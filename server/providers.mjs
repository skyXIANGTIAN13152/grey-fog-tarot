// Protocol references (checked 2026-11-06):
// https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
// https://platform.claude.com/docs/en/build-with-claude/streaming
// https://ai.google.dev/api/generate-content

export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isLoopback(hostname) {
  return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname.toLowerCase());
}

export function normalizeConfig(input) {
  if (!input || typeof input !== 'object') throw new ApiError('请先填写 AI 接口设置。');
  const provider = input.provider || 'openai';
  if (!['openai', 'anthropic', 'gemini'].includes(provider)) throw new ApiError('请选择支持的接口格式。');
  const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : '';
  const model = typeof input.model === 'string' ? input.model.trim() : '';
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (!model || model.length > 200 || /[\r\n]/.test(model)) throw new ApiError('请填写有效的模型名称。');
  if (!baseUrl || baseUrl.length > 2048) throw new ApiError('请填写完整的 AI 接口地址。');
  if (apiKey.length > 8192 || /[\r\n]/.test(apiKey)) throw new ApiError('API Key 格式不正确，请重新粘贴。');
  let url;
  try { url = new URL(baseUrl); } catch { throw new ApiError('接口地址格式不正确，例如 https://api.deepseek.com/v1。'); }
  if (url.username || url.password || url.hash) throw new ApiError('接口地址中不能包含账号、密码或 # 片段。');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new ApiError('远程 AI 接口请使用 HTTPS；本机模型可使用 http://127.0.0.1。');
  }
  if (!apiKey && !isLoopback(url.hostname)) throw new ApiError('请填写 API Key。本机模型可留空。');
  let path = url.pathname.replace(/\/+$/, '');
  if (provider === 'openai') {
    if (!path.endsWith('/chat/completions')) path = `${path || '/v1'}/chat/completions`;
  } else if (provider === 'anthropic') {
    if (!path.endsWith('/messages')) path = `${path || '/v1'}/messages`;
  } else {
    // The selected model is authoritative, including when a full Gemini URL is pasted.
    path = path.replace(/\/models\/[^/]+:(?:streamGenerateContent|generateContent)$/, '');
    path = `${path || '/v1beta'}/models/${encodeURIComponent(model.replace(/^models\//, ''))}:streamGenerateContent`;
    url.searchParams.set('alt', 'sse');
    url.searchParams.delete('key');
  }
  url.pathname = path;
  return { provider, model, apiKey, url };
}

export function validateMessages(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 200) throw new ApiError('对话记录不完整或过长，请重新开始一次占卜。');
  let length = 0;
  const messages = input.map(message => {
    if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) {
      throw new ApiError('对话内容格式不正确，请重新提交。');
    }
    length += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (length > 500_000) throw new ApiError('这段对话太长，请开启一次新的占卜。', 413);
  if (!messages.some(message => message.role === 'user')) throw new ApiError('请填写你想询问的问题。');
  return messages;
}

export function createUpstreamRequest(config, messages, test = false) {
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' };
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
  const conversation = messages.filter(message => message.role !== 'system');
  let body;
  if (config.provider === 'openai') {
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    body = { model: config.model, messages, stream: true };
    // Omit sampling parameters: reasoning models and compatible services differ.
    if (test) body[config.url.hostname === 'api.openai.com' ? 'max_completion_tokens' : 'max_tokens'] = 128;
  } else if (config.provider === 'anthropic') {
    if (config.apiKey) headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = { model: config.model, messages: conversation, max_tokens: test ? 128 : 4096, stream: true };
    if (system) body.system = system;
  } else {
    if (config.apiKey) headers['x-goog-api-key'] = config.apiKey;
    body = {
      contents: conversation.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
      generationConfig: { maxOutputTokens: test ? 128 : 4096 },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
  }
  return { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error' };
}

function reasonError(reason, provider) {
  if (!reason) return null;
  if ((provider === 'openai' && reason === 'stop') || (provider === 'anthropic' && ['end_turn', 'stop_sequence'].includes(reason)) || (provider === 'gemini' && reason === 'STOP')) return null;
  if (['length', 'max_tokens', 'MAX_TOKENS'].includes(reason)) return new ApiError('AI 回复达到长度上限，内容可能尚未结束。你可以继续追问。', 502);
  if (['content_filter', 'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(reason)) return new ApiError('AI 服务未能完成这次回复，请换一种方式描述问题。', 502);
  return new ApiError('AI 服务返回了当前不支持的结束状态，请检查模型或重试。', 502);
}

/** Converts upstream payloads into a small text-only protocol; never exposes reasoning or credentials. */
function extractPayload(payload, provider, state, emit) {
  if (!payload || typeof payload !== 'object') throw new ApiError('AI 接口返回了无法识别的数据。', 502);
  if (payload.error || payload.type === 'error') throw new ApiError('AI 服务在生成过程中返回错误，请检查模型、额度或稍后重试。', 502);
  const push = text => {
    if (typeof text !== 'string' || !text) return;
    state.textLength += text.length;
    if (state.textLength > 1_000_000) throw new ApiError('AI 返回的内容过长，已停止接收。', 502);
    emit({ type: 'delta', text });
  };
  if (provider === 'openai') {
    const choice = payload.choices?.find(choice => choice.index === 0) ?? payload.choices?.[0];
    if (!choice) return;
    const content = choice.delta?.content ?? choice.message?.content;
    if (Array.isArray(content)) content.filter(part => part.type === 'text').forEach(part => push(part.text));
    else push(content);
    if (choice.delta?.refusal || choice.message?.refusal) push(choice.delta?.refusal ?? choice.message?.refusal);
    if (choice.finish_reason) {
      const error = reasonError(choice.finish_reason, provider);
      if (error) throw error;
      state.complete = true;
    }
  } else if (provider === 'anthropic') {
    if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') push(payload.delta.text);
    if (payload.type === 'content_block_start' && payload.content_block?.type === 'text') push(payload.content_block.text);
    if (Array.isArray(payload.content)) payload.content.filter(part => part.type === 'text').forEach(part => push(part.text));
    const reason = payload.delta?.stop_reason ?? payload.stop_reason;
    const error = reasonError(reason, provider);
    if (error) throw error;
    if (payload.type === 'message_stop' || (Array.isArray(payload.content) && reason)) state.complete = true;
  } else {
    if (payload.promptFeedback?.blockReason) throw new ApiError('AI 服务未接受这个问题，请调整问题后重试。', 502);
    const candidate = payload.candidates?.[0];
    if (!candidate) return;
    candidate.content?.parts?.filter(part => !part.thought).forEach(part => push(part.text));
    if (candidate.finishReason) {
      const error = reasonError(candidate.finishReason, provider);
      if (error) throw error;
      state.complete = true;
    }
  }
}

/** Handles UTF-8 and SSE boundaries across arbitrary network chunks, including a final unterminated event. */
export async function consumeUpstream(response, provider, emit) {
  const state = { textLength: 0, complete: false };
  const type = response.headers.get('content-type') || '';
  if (/application\/(?:[^;]+\+)?json/i.test(type)) {
    const text = await readBoundedText(response, 8_000_000);
    let payload;
    try { payload = JSON.parse(text); } catch { throw new ApiError('AI 接口没有返回有效的 JSON，请检查接口地址。', 502); }
    for (const item of Array.isArray(payload) ? payload : [payload]) extractPayload(item, provider, state, emit);
    // Nonstream responses from compatible services may omit a finish reason.
    state.complete = true;
  } else {
    if (!response.body) throw new ApiError('AI 接口没有返回内容。', 502);
    const decoder = new TextDecoder();
    let buffer = '';
    let dataLines = [];
    let bytes = 0;
    const dispatch = () => {
      if (!dataLines.length) return;
      const data = dataLines.join('\n');
      dataLines = [];
      if (data.trim() === '[DONE]') { state.complete = true; return; }
      let payload;
      try { payload = JSON.parse(data); } catch { throw new ApiError('AI 接口的流式数据格式异常，请确认接口格式设置。', 502); }
      extractPayload(payload, provider, state, emit);
    };
    const line = value => {
      if (value === '') dispatch();
      else if (value.startsWith('data:')) dataLines.push(value.slice(5).replace(/^ /, ''));
    };
    const flush = final => {
      while (true) {
        const index = buffer.search(/[\r\n]/);
        if (index < 0 || (!final && index === buffer.length - 1 && buffer[index] === '\r')) break;
        const end = index + (buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1);
        const value = buffer.slice(0, index);
        buffer = buffer.slice(end);
        line(value);
      }
      if (final) { if (buffer) line(buffer); buffer = ''; dispatch(); }
    };
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 8_000_000) throw new ApiError('AI 返回的数据过多，已停止接收。', 502);
      buffer += decoder.decode(chunk, { stream: true });
      flush(false);
    }
    buffer += decoder.decode();
    flush(true);
  }
  if (!state.complete) throw new ApiError('AI 连接在回复结束前中断了。已收到的内容仍可保留，请重试或继续追问。', 502);
  if (!state.textLength) throw new ApiError('已连接到 AI，但没有收到文字回复。请检查模型名称或重试。', 502);
  emit({ type: 'done' });
}

async function readBoundedText(response, maxBytes) {
  let total = 0;
  const chunks = [];
  if (!response.body) return '';
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new ApiError('AI 返回的数据过多。', 502);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function upstreamStatusMessage(status) {
  if (status === 401 || status === 403) return 'AI 服务拒绝访问，请检查 API Key、接口地址和账号权限。';
  if (status === 404) return '没有找到该接口或模型，请检查接口地址和模型名称。';
  if (status === 429) return 'AI 服务请求过多或额度不足，请检查余额或稍后再试。';
  if (status === 400 || status === 422) return 'AI 服务未接受请求，请检查模型名称及接口格式是否匹配。';
  if (status >= 500) return 'AI 服务暂时不可用，请稍后再试。';
  return `AI 服务返回错误（HTTP ${status}），请检查接口设置。`;
}
