import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(process.execPath, ['server/index.mjs', '--dev'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { cwd: root, stdio: 'inherit' }),
];
let stopped = false;
function stop(code = 0) { if (stopped) return; stopped = true; children.forEach(p => p.kill()); process.exitCode = code; }
children.forEach(p => { p.on('error', e => { console.error(e.message); stop(1); }); p.on('exit', code => stop(code || 0)); });
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
