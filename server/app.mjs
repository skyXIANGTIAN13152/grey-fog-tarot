import { createServer as createHttpServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, consumeUpstream, createUpstreamRequest, isLoopback, normalizeConfig, upstreamStatusMessage, validateMessages } from './providers.mjs';

const defaultDist = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8' };

function sendEvent(response, event, status = 200) {
  if (response.destroyed || response.writableEnded) return;
  if (!response.headersSent) response.writeHead(status, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Accel-Buffering': 'no',
  });
  response.write(`${JSON.stringify(event)}\n`);
}

function validateLocalRequest(request, dev) {
  let host;
  try { host = new URL(`http://${request.headers.host || ''}`); } catch { throw new ApiError('请从本机地址打开网站。', 403); }
  if (!isLoopback(host.hostname) || host.username || host.password) throw new ApiError('本地服务仅接受本机地址。', 403);
  const port = String(request.socket.localPort);
  const ports = new Set([port, ...(dev ? ['5173', '5174', '8787'] : [])]);
  if (!ports.has(host.port || '80')) throw new ApiError('本地服务地址不匹配。', 403);
  if (request.headers.origin) {
    let origin;
    try { origin = new URL(request.headers.origin); } catch { throw new ApiError('此页面不能调用本地 AI 服务。', 403); }
    if (origin.protocol !== 'http:' || !isLoopback(origin.hostname) || !ports.has(origin.port || '80') || origin.pathname !== '/' || origin.username || origin.password) {
      throw new ApiError('此页面不能调用本地 AI 服务，请在本地网站中重试。', 403);
    }
  }
}

function readJson(request) {
  const limit = 1_500_000;
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw new ApiError('请求必须使用 JSON 格式。', 415);
  if (Number(request.headers['content-length']) > limit) throw new ApiError('请求内容过长，请开启新的占卜。', 413);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let failed = false;
    request.on('data', chunk => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > limit) { failed = true; reject(new ApiError('请求内容过长，请开启新的占卜。', 413)); return; }
      chunks.push(chunk);
    });
    request.once('error', () => reject(new ApiError('请求连接已中断。', 400)));
    request.once('end', () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new ApiError('请求数据格式不正确。')); }
    });
  });
}

async function chat(request, response, { fetchImpl, timeoutMs }) {
  const input = await readJson(request);
  if (!input || typeof input !== 'object') throw new ApiError('请求数据格式不正确。');
  const config = normalizeConfig(input.config);
  const messages = input.test === true
    ? [{ role: 'user', content: 'Reply with the single word OK.' }]
    : validateMessages(input.messages);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs ?? (input.test ? 30_000 : 120_000));
  timer.unref();
  const disconnect = () => { if (!response.writableEnded) controller.abort(); };
  response.once('close', disconnect);
  request.once('aborted', disconnect);
  try {
    const upstream = await fetchImpl(config.url, { ...createUpstreamRequest(config, messages, input.test === true), signal: controller.signal });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw new ApiError(upstreamStatusMessage(upstream.status), 502);
    }
    await consumeUpstream(upstream, config.provider, event => sendEvent(response, event));
  } catch (error) {
    if (response.destroyed) return;
    if (timedOut) throw new ApiError('AI 服务响应超时，请稍后重试或更换模型。', 504);
    if (error instanceof ApiError) throw error;
    // Raw fetch/provider errors may contain URLs or credentials. Do not return or log them.
    throw new ApiError('无法连接 AI 服务，请检查接口地址、网络连接及本机模型是否已启动。', 502);
  } finally {
    clearTimeout(timer);
    response.off('close', disconnect);
    request.off('aborted', disconnect);
    if (!controller.signal.aborted) controller.abort();
  }
  response.end();
}

async function serveStatic(request, response, distDir) {
  if (!['GET', 'HEAD'].includes(request.method)) throw new ApiError('不支持此请求方式。', 405);
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { throw new ApiError('页面地址不正确。'); }
  if (pathname.includes('\0') || pathname.includes('\\')) throw new ApiError('页面地址不正确。');
  const root = path.resolve(distDir);
  let filename = path.resolve(root, `.${pathname}`);
  if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) throw new ApiError('页面不存在。', 404);
  let info = await stat(filename).catch(() => null);
  if (info?.isDirectory()) { filename = path.join(filename, 'index.html'); info = await stat(filename).catch(() => null); }
  if (!info?.isFile() && !path.extname(pathname)) { filename = path.join(root, 'index.html'); info = await stat(filename).catch(() => null); }
  if (!info?.isFile()) throw new ApiError('页面文件不存在，请先运行构建命令。', 404);
  response.writeHead(200, {
    'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': path.extname(filename) === '.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  });
  if (request.method === 'HEAD') { response.end(); return; }
  const stream = createReadStream(filename);
  stream.once('error', () => response.destroy());
  response.once('close', () => stream.destroy());
  stream.pipe(response);
}

export function createServer({ distDir = defaultDist, dev = false, fetchImpl = globalThis.fetch, timeoutMs } = {}) {
  const server = createHttpServer(async (request, response) => {
    try {
      validateLocalRequest(request, dev);
      if (request.url === '/api/health' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ ok: true, service: 'grey-fog-tarot' }));
      } else if (request.url === '/api/chat' && request.method === 'POST') {
        await chat(request, response, { fetchImpl, timeoutMs });
      } else if (request.url?.startsWith('/api/')) {
        throw new ApiError('接口不存在或请求方式不正确。', 404);
      } else await serveStatic(request, response, distDir);
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      sendEvent(response, { type: 'error', message: error instanceof ApiError ? error.message : '本地服务暂时无法处理此请求。' }, error instanceof ApiError ? error.status : 500);
      response.end();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return server;
}
