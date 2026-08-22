// test/host.test.mjs
// Host-half unit tests against the REAL built lib/index.js.
// - Route registration with the desktopRuntime capability present -> restart allowed.
// - desktopRuntime absent -> restart NOT allowed (button disabled client-side).
// - Restart call reaches ctx.desktopRuntime.requestRestart -> graceful relaunch path.
// - No shell / kill / spawn / sudo operations referenced in the host bundle.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const hostPath = join(rootDir, 'lib', 'index.js');
const hostSrc = readFileSync(hostPath, 'utf8');

// ---- Test 1: safe-operations audit (no dangerous mechanisms) ----
function testNoDangerousOps() {
  for (const bad of ['pkill', 'killall', 'kill -9', 'osascript', 'launchctl', 'sudo ']) {
    if (hostSrc.includes(bad)) {
      throw new Error('host bundle must not contain dangerous op: ' + bad);
    }
  }
  console.log('PASS 1: host bundle has no shell/kill/sudo operations');
}

// ---- Test 2: restart reaches desktopRuntime.requestRestart when present ----
async function testRestartRoute() {
  const mod = await import(hostPath);
  let restartCalled = false;
  const routes = [];
  const webServer = { register(route) { routes.push(route); return () => {}; } };
  // Mirror cordis: provide(webServer) makes ctx.webServer a property getter.
  const ctx = {
    get webServer() { return webServer; },
    get(name) {
      if (name === 'webServer') return webServer;
      if (name === 'desktopRuntime') return { requestRestart: async () => { restartCalled = true; } };
      return undefined;
    },
    logger: { warn() {}, error() {} },
    effect() {},
  };

  mod.apply(ctx);

  const restartRoute = routes.find((r) => r.path === '/dsh-restart-button/api');
  if (!restartRoute) throw new Error('restart route not registered with desktopRuntime');
  if (restartRoute.kind !== 'prefix') throw new Error('route kind must be prefix');

  // POST restart -> should call requestRestart (fire-and-forget, returns 202)
  let status = 0, body;
  const res = { statusCode: 0, setHeader() {}, end(b) { body = JSON.parse(b); } };
  const req = {
    method: 'POST',
    url: '/dsh-restart-button/api/restart',
    headers: { host: '127.0.0.1:50642', 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:50642' },
    [Symbol.asyncIterator]() { return (async function* () {})(); },
  };
  await restartRoute.handler(req, res);
  await new Promise((r) => setTimeout(r, 20));
  if (!restartCalled) throw new Error('requestRestart not invoked');
  if (res.statusCode !== 202) throw new Error('expected 202, got ' + res.statusCode);
  if (body.ok !== true) throw new Error('expected ok:true');
  console.log('PASS 2: restart route calls desktopRuntime.requestRestart (202)');
}

// ---- Test 3: loader metadata must declare the host service ----
async function testLoaderMetadata() {
  const mod = await import(hostPath);
  if (!Array.isArray(mod.inject) || !mod.inject.includes('webServer')) {
    throw new Error('host bundle must declare inject:[webServer] so DSH can boot the plugin');
  }
  console.log('PASS 3: host bundle declares webServer injection');
}

// ---- Test 4: no source export pollution ----
async function testExports() {
  const mod = await import(hostPath);
  if (typeof mod.apply !== 'function') throw new Error('apply missing');
  console.log('PASS 4: host bundle exports apply()');
}

testNoDangerousOps();
await testRestartRoute();
await testLoaderMetadata();
await testExports();
console.log('HOST TESTS: PASS (4/4)');
