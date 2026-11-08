import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.mjs';
import { normalizeConfig } from '../server/providers.mjs';

async function listen(server, t) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t, handler, options = {}) {
  const upstream = createHttpServer(handler);
  const upstreamUrl = await listen(upstream, t);
  const appUrl = await listen(createServer(options), t);
  const call = async (provider = 'openai', extras = {}, headers = {}) => {
    const response = await fetch(`${appUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: appUrl, ...headers },
      body: JSON.stringify({ config: { provider, baseUrl: `${upstreamUrl}/v1`, model: 'mock-model', apiKey: 'test-private-key' }, messages: [{ role: 'system', content: '使用中文回答。' }, { role: 'user', content: '如何理解这张牌？' }], ...extras }),
    });
    const text = await response.text();
    return { response, text, events: text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) };
  };
  return { call, upstreamUrl, appUrl };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

test('config normalizes root, versioned, and full endpoints without duplicating paths', () => {
  const base = { apiKey: 'key', model: 'model' };
  assert.equal(normalizeConfig({ ...base, provider: 'openai', baseUrl: 'https://example.com' }).url.href, 'https://example.com/v1/chat/completions');
  assert.equal(normalizeConfig({ ...base, provider: 'openai', baseUrl: 'https://example.com/custom/v1/' }).url.href, 'https://example.com/custom/v1/chat/completions');
  assert.equal(normalizeConfig({ ...base, provider: 'openai', baseUrl: 'https://example.com/v1/chat/completions' }).url.href, 'https://example.com/v1/chat/completions');
  assert.equal(normalizeConfig({ ...base, provider: 'anthropic', baseUrl: 'https://example.com/v1' }).url.href, 'https://example.com/v1/messages');
  assert.equal(normalizeConfig({ ...base, provider: 'gemini', baseUrl: 'https://example.com/v1beta' }).url.href, 'https://example.com/v1beta/models/model:streamGenerateContent?alt=sse');
  assert.equal(normalizeConfig({ ...base, provider: 'gemini', baseUrl: 'https://example.com/v1beta/models/old:generateContent?key=secret' }).url.href, 'https://example.com/v1beta/models/model:streamGenerateContent?alt=sse');
});

test('remote cleartext, embedded credentials and malformed settings are rejected; local models allow no key', () => {
  const base = { provider: 'openai', apiKey: 'key', model: 'model' };
  for (const baseUrl of ['http://example.com/v1', 'ftp://example.com', 'https://user:pass@example.com', 'not a URL']) assert.throws(() => normalizeConfig({ ...base, baseUrl }));
  assert.throws(() => normalizeConfig({ ...base, apiKey: '', baseUrl: 'https://example.com/v1' }));
  assert.equal(normalizeConfig({ ...base, apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1' }).apiKey, '');
});

test('OpenAI stream survives arbitrary UTF-8 chunks, CRLF and a final event without newline', async t => {
  let sent;
  const { call } = await fixture(t, async (request, response) => {
    sent = { path: request.url, authorization: request.headers.authorization, body: await readBody(request) };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const data = ': ping\r\n\r\ndata: {"choices":[{"index":0,"delta":{"content":"灰雾中的新开始。"},"finish_reason":null}]}\r\n\r\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]';
    const bytes = Buffer.from(data);
    for (let offset = 0; offset < bytes.length; offset += 5) response.write(bytes.subarray(offset, offset + 5));
    response.end();
  });
  const { response, events, text } = await call();
  assert.equal(response.status, 200);
  assert.deepEqual(events, [{ type: 'delta', text: '灰雾中的新开始。' }, { type: 'done' }]);
  assert.equal(sent.path, '/v1/chat/completions');
  assert.equal(sent.authorization, 'Bearer test-private-key');
  assert.equal(sent.body.messages[0].role, 'system');
  assert.equal(sent.body.stream, true);
  assert.equal(text.includes('test-private-key'), false);
});

test('Anthropic maps system messages and only exposes text deltas', async t => {
  let sent;
  const { call } = await fixture(t, async (request, response) => {
    sent = { path: request.url, key: request.headers['x-api-key'], body: await readBody(request) };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end([
      { type: 'message_start', message: { content: [] } },
      { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'private reasoning' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: '保持耐心。' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ].map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
  });
  const { events } = await call('anthropic');
  assert.deepEqual(events, [{ type: 'delta', text: '保持耐心。' }, { type: 'done' }]);
  assert.equal(sent.path, '/v1/messages');
  assert.equal(sent.key, 'test-private-key');
  assert.equal(sent.body.system, '使用中文回答。');
  assert.equal(sent.body.messages.length, 1);
  assert.equal(sent.body.max_tokens, 4096);
});

test('Gemini maps model conversation and system instruction with header authentication', async t => {
  let sent;
  const { call } = await fixture(t, async (request, response) => {
    sent = { path: request.url, key: request.headers['x-goog-api-key'], body: await readBody(request) };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end('data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"private"},{"text":"看清自己的选择。"}]},"finishReason":"STOP"}]}\n\n');
  });
  const { events } = await call('gemini', { messages: [{ role: 'system', content: '用中文。' }, { role: 'user', content: '问题' }, { role: 'assistant', content: '上一轮' }, { role: 'user', content: '追问' }] });
  assert.deepEqual(events, [{ type: 'delta', text: '看清自己的选择。' }, { type: 'done' }]);
  assert.equal(sent.path, '/v1/models/mock-model:streamGenerateContent?alt=sse');
  assert.equal(sent.path.includes('test-private-key'), false);
  assert.equal(sent.key, 'test-private-key');
  assert.equal(sent.body.contents[1].role, 'model');
  assert.equal(sent.body.systemInstruction.parts[0].text, '用中文。');
});

test('nonstream JSON fallback and connection-test request are supported', async t => {
  let sent;
  const { call } = await fixture(t, async (request, response) => {
    sent = await readBody(request);
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }));
  });
  const { events } = await call('openai', { test: true, messages: [] });
  assert.deepEqual(events, [{ type: 'delta', text: 'OK' }, { type: 'done' }]);
  assert.equal(sent.messages.length, 1);
  assert.equal(sent.messages[0].content, 'Reply with the single word OK.');
  assert.equal(sent.max_tokens, 128);
});

test('incomplete stream preserves received text but never reports done', async t => {
  const { call } = await fixture(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end('data: {"choices":[{"delta":{"content":"部分回复"},"finish_reason":null}]}\n\n');
  });
  const { events } = await call();
  assert.equal(events[0].text, '部分回复');
  assert.equal(events.at(-1).type, 'error');
  assert.match(events.at(-1).message, /中断/);
  assert.equal(events.some(event => event.type === 'done'), false);
});

test('mid-stream upstream errors and length limits do not silently succeed', async t => {
  for (const ending of [{ error: { message: 'secret token test-private-key' } }, { choices: [{ delta: {}, finish_reason: 'length' }] }]) {
    await t.test(JSON.stringify(ending), async t => {
      const { call } = await fixture(t, (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end(`data: {"choices":[{"delta":{"content":"部分"}}]}\n\ndata: ${JSON.stringify(ending)}\n\ndata: [DONE]\n\n`);
      });
      const { events, text } = await call();
      assert.equal(events.at(-1).type, 'error');
      assert.equal(events.some(event => event.type === 'done'), false);
      assert.equal(text.includes('test-private-key'), false);
    });
  }
});

test('upstream error bodies never leak key or provider internals', async t => {
  const { call } = await fixture(t, (_request, response) => {
    response.writeHead(401, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'Incorrect token: test-private-key' } }));
  });
  const { response, events, text } = await call();
  assert.equal(response.status, 502);
  assert.match(events[0].message, /API Key/);
  assert.equal(text.includes('test-private-key'), false);
});

test('non-local browser origins and Host headers are rejected before forwarding', async t => {
  let upstreamCalls = 0;
  const { call, appUrl } = await fixture(t, (_request, response) => { upstreamCalls++; response.end(); });
  const { response } = await call('openai', {}, { Origin: 'https://evil.example' });
  assert.equal(response.status, 403);
  const forgedStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(`${appUrl}/api/health`, { headers: { Host: 'evil.example:4173' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end();
  });
  assert.equal(forgedStatus, 403);
  assert.equal(upstreamCalls, 0);
});

test('invalid messages and non-JSON requests fail before forwarding', async t => {
  let calls = 0;
  const { call } = await fixture(t, (_request, response) => { calls++; response.end(); });
  assert.equal((await call('openai', { messages: [] })).response.status, 400);
  assert.equal((await call('openai', {}, { 'Content-Type': 'text/plain' })).response.status, 415);
  assert.equal((await call('openai', { messages: [{ role: 'user', content: 'a'.repeat(500_001) }] })).response.status, 413);
  assert.equal(calls, 0);
});

test('upstream timeout returns actionable error and aborts the connection', async t => {
  const { call } = await fixture(t, () => {}, { timeoutMs: 30 });
  const { response, events } = await call();
  assert.equal(response.status, 504);
  assert.match(events[0].message, /超时/);
});

test('client cancellation aborts the upstream fetch', async t => {
  let upstreamSignal;
  const server = createServer({ fetchImpl: async (_url, options) => {
    upstreamSignal = options.signal;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"start"}}]}\n\n')); options.signal.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true }); } }), { headers: { 'content-type': 'text/event-stream' } });
  } });
  const appUrl = await listen(server, t);
  const controller = new AbortController();
  const response = await fetch(`${appUrl}/api/chat`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: { baseUrl: 'http://127.0.0.1:12345', model: 'mock' }, messages: [{ role: 'user', content: 'q' }] }) });
  await response.body.getReader().read();
  controller.abort();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(upstreamSignal.aborted, true);
});

test('production serves local SPA and blocks framing and external network resources', async t => {
  const scratchRoot = tmpdir();
  const dir = await mkdtemp(path.join(scratchRoot, 'grey-fog-server-test-'));
  t.after(() => {
    if (!path.resolve(dir).startsWith(`${path.resolve(scratchRoot)}${path.sep}`)) throw new Error('Unexpected test cleanup path');
    return rm(dir, { recursive: true, force: true });
  });
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>灰雾之上</title>');
  const appUrl = await listen(createServer({ distDir: dir }), t);
  const response = await fetch(`${appUrl}/history`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /灰雾之上/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal((await fetch(`${appUrl}/missing.js`)).status, 404);
});
