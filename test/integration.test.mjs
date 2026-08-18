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

test('desktopRuntime absent -> no restart route (client disables button)', async () => {
  const ctx = new Context();
  const ws = makeWebServer();
  ctx.provide('webServer', ws.service);
  // NO desktopRuntime provided
  applyPlugin(ctx);
  await tick();

  const restartRoute = ws.routes.find((r) => r.path === '/dsh-restart-button/api');
  assert.ok(restartRoute, 'API prefix route still registered (so client can probe status)');

  // status GET must report restartable:false
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
  assert.equal(parsed.restartable, false, 'should report not restartable when desktopRuntime missing');
});
