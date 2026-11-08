import type { ApiConfig } from './types';
export async function streamChat(
  config: ApiConfig,
  messages: {role: string; content: string}[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  test = false,
) {
  const response = await fetch('/api/chat', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({config, messages, test}), signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || data?.error || data?.message || `连接失败（${response.status}），请检查接口设置。`);
  }
  if (!response.body) throw new Error('接口没有返回可读取的内容，请检查服务是否支持流式响应。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; let done = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { throw new Error('接口返回格式异常，请检查接口地址与协议。'); }
    if (event.type === 'error') throw new Error(event.message || 'AI 服务返回错误，请稍后重试。');
    if (event.type === 'delta' && typeof event.text === 'string') onDelta(event.text);
    if (event.type === 'done') done = true;
  };
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) { buffer += decoder.decode(); break; }
      buffer += decoder.decode(result.value, {stream: true});
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      lines.forEach(consume);
    }
    if (buffer.trim()) consume(buffer);
    if (!done) throw new Error('连接提前中断，已接收的内容会保留。请重新生成或继续追问。');
  } finally { reader.releaseLock(); }
}
