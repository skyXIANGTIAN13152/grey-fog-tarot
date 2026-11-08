import { createServer } from './app.mjs';

const dev = process.argv.includes('--dev');
const portArgument = process.argv.find(argument => argument.startsWith('--port='))?.slice(7);
const port = Number(portArgument || process.env.PORT || (dev ? 8787 : 4173));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('端口无效，请使用 1–65535 之间的数字。');
  process.exit(1);
}
const server = createServer({ dev });
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。请关闭已有窗口，或使用 --port=其他端口。` : '本地服务无法启动，请检查本机端口权限。');
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`灰雾之上已启动：http://127.0.0.1:${port}${dev ? '（AI 接口）' : ''}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
});
