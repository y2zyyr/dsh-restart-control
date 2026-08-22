// test/integration.test.mjs
// Real @deepseek-ai/cordis Context + this plugin's REAL built host bundle.
// Exercises the register-once-webServer / restart-capability-gating path the
// way the live runtime does. No network, no desktop process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { apply as applyPlugin } from '../lib/index.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Fake webServer service surface (same shape the host uses). */
function makeWebServer() {
  const routes = [];
  return {
    routes,
    service: { register(route) { routes.push(route); return () => {}; } },
  };
}

test('registers restart route only when desktopRuntime is present; 202 + requestRestart', async () => {
  const ctx = new Context();
  const ws = makeWebServer();
  ctx.provide('webServer', ws.service);
  let restartCalled = 0;
  const dr = { requestRestart: async () => { restartCalled += 1; } };
  ctx.provide('desktopRuntime', dr);
  applyPlugin(ctx);
  await tick();

  const restartRoute = ws.routes.find((r) => r.path === '/dsh-restart-button/api');
  assert.ok(restartRoute, 'restart route should be registered when desktopRuntime present');
  assert.equal(restartRoute.kind, 'prefix');

  let status = 0; let sent = null;
  const res = { statusCode: 0, setHeader() {}, end(b) { sent = b; } };
  const req = {
    method: 'POST',
    url: '/dsh-restart-button/api/restart',
    headers: { host: '127.0.0.1:50642', 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:50642' },
    [Symbol.asyncIterator]() { return (async function* () {})(); },
  };
  await restartRoute.handler(req, res);
  status = res.statusCode;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(status, 202, 'expect 202 Accepted');
  assert.equal(restartCalled, 1, 'desktopRuntime.requestRestart invoked once');
  assert.ok(JSON.parse(sent).ok === true);
});

test('desktopRuntime absent -> web mode reported as restartable', async () => {
  const ctx = new Context();
  const ws = makeWebServer();
  ctx.provide('webServer', ws.service);
  // NO desktopRuntime provided -> pure-web generation
  applyPlugin(ctx, {
    spawnRelauncher: () => false, // never actually spawn in tests
    terminateSelf: () => { throw new Error('must not terminate in this test'); },
  });
  await tick();

  const restartRoute = ws.routes.find((r) => r.path === '/dsh-restart-button/api');
  assert.ok(restartRoute, 'API prefix route still registered (so client can probe status)');

  // status GET reports the web-mode facility
  let status = 0; let sent = null;
  const res = { statusCode: 0, setHeader() {}, end(b) { sent = b; } };
  const req = {
    method: 'GET',
    url: '/dsh-restart-button/api/status',
    headers: { host: '127.0.0.1:50642', 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:50642' },
  };
  await restartRoute.handler(req, res);
  const parsed = JSON.parse(sent);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.restartable, true, 'web generation offers its own graceful restart path');
  assert.equal(parsed.mode, 'web');
  assert.equal(parsed.pid, process.pid, 'web status exposes the current generation pid');
});

test('web mode POST -> arms relauncher with captured argv/cwd, replies 202, terminates self once', async () => {
  const ctx = new Context();
  const ws = makeWebServer();
  ctx.provide('webServer', ws.service);
  const spawned = [];
  let terminated = 0;
  applyPlugin(ctx, {
    spawnRelauncher: (cfg) => { spawned.push(cfg); return true; },
    terminateSelf: () => { terminated += 1; },
  });
  await tick();

  const restartRoute = ws.routes.find((r) => r.path === '/dsh-restart-button/api');
  assert.ok(restartRoute);

  let status = 0; let sent = null;
  const res = { statusCode: 0, setHeader() {}, end(b) { sent = b; } };
  const req = {
    method: 'POST',
    url: '/dsh-restart-button/api/restart',
    headers: { host: '127.0.0.1:50642', 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:50642' },
    [Symbol.asyncIterator]() { return (async function* () {})(); },
  };
  await restartRoute.handler(req, res);
  status = res.statusCode;
  assert.equal(status, 202, 'expect 202 Accepted');
  assert.equal(JSON.parse(sent).mode, 'web');
  await new Promise((r) => setTimeout(r, 100)); // termination is deferred ~50ms to flush the reply
  assert.equal(spawned.length, 1, 'relauncher armed exactly once');
  assert.equal(spawned[0].ppid, process.pid, 'config carries the terminating pid');
  assert.ok(Array.isArray(spawned[0].args) && spawned[0].args.length >= 1, 'config carries original argv');
  assert.equal(typeof spawned[0].cwd, 'string');
  assert.ok(spawned[0].timeoutMs >= 1000, 'bounded backstop present');
  assert.equal(terminated, 1, 'self-termination requested exactly once AFTER relauncher armed');
});

test('web mode POST with failed spawn -> 500 and server stays up (no self-termination)', async () => {
  const ctx = new Context();
  const ws = makeWebServer();
  ctx.provide('webServer', ws.service);
  let terminated = 0;
  applyPlugin(ctx, {
    spawnRelauncher: () => false,
    terminateSelf: () => { terminated += 1; },
  });
  await tick();

  const restartRoute = ws.routes.find((r) => r.path === '/dsh-restart-button/api');
  let status = 0; let sent = null;
  const res = { statusCode: 0, setHeader() {}, end(b) { sent = b; } };
  const req = {
    method: 'POST',
    url: '/dsh-restart-button/api/restart',
    headers: { host: '127.0.0.1:50642', 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:50642' },
    [Symbol.asyncIterator]() { return (async function* () {})(); },
  };
  await restartRoute.handler(req, res);
  status = res.statusCode;
  assert.equal(status, 500);
  assert.equal(JSON.parse(sent).error.code, 'relaunch-failed');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(terminated, 0, 'never take the server down without a relauncher');
});
