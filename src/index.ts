// src/index.ts
// Host half of dsh-restart-button.
//
//   Restart wiring : registers a browser-trust-fenced, plugin-owned route that
//                    POSTs a restart request to the DSH Desktop host. When the
//                    Electron desktop shell (dsh-plugin-desktop) is running it
//                    provides the `desktopRuntime` service; its
//                    `requestRestart()` gracefully disposes the whole Cordis
//                    tree (settings/session flush, 5s grace) then
//                    `app.relaunch()` + `app.exit(0)`. That is the DSH official
//                    restart facade — no shell, no kill, no sudo.
//
//   Lifecycle gate : `desktopRuntime` only exists in a desktop-shell generation.
//                    In a pure `dsh web` browser session the restart route is
//                    NOT registered and the client row disables the button.
//                    `webServer` is injected so apply() runs once the loopback
//                    server is up (the Phase 2.3 lesson from dsh-model-retry-settings).
import type { DshContext, WebServerLike } from './dsh.ts';

export const name = 'dsh-restart-button'; // stable plugin identity (loader id), independent of npm package name

/**
 * Required host services. WebServer is a hard dependency (the restart + status
 * routes must register once the loopback server is up). `desktopRuntime` is
 * accessed OPTIONALLY via ctx.get() because it only exists inside a desktop
 * shell; the plugin must still load (with the row disabled) under plain web.
 */
export const inject = ['webServer'];

/** Route prefix (loopback only). */
const PREFIX = '/dsh-restart-button/api';
/** Status: reported to the client so it can enable/disable the button. */
const STATUS_PATH = PREFIX + '/status';
/** Restart: the only mutation. */
const RESTART_PATH = PREFIX + '/restart';

/** Loopback / same-origin fence (mirrors the core /api gateway rule). */
function isTrustedApiRequest(request: { headers: Record<string, string | string[] | undefined> }): boolean {
  const raw = request.headers['host'];
  const host = typeof raw === 'string' ? raw : undefined;
  if (host === undefined) return false;
  const hostname = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0];
  const loopback = hostname === 'localhost' || hostname === '[::1]' ||
    (hostname.split('.').length === 4 && hostname.startsWith('127.'));
  if (!loopback) return false;
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers['origin'];
  if (origin === undefined) return true;
  try { return new URL(origin as string).host === host; } catch { return false; }
}
function writeJson(res: any, status: number, body: unknown): void {
  if (typeof res.statusCode === 'number') res.statusCode = status;
  if (typeof res.setHeader === 'function') res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}
async function readJsonBody(req: any): Promise<unknown> {
  let body = '';
  for await (const chunk of req) body += String(chunk);
  if (body.length === 0) return {};
  try { return JSON.parse(body); } catch { return {}; }
}

/** Register the plugin's browser-trust-fenced status + restart route. */
function registerApiRoutes(ctx: DshContext, restartable: () => boolean, requestRestart: () => Promise<void>): void {
  const webServer = ctx.webServer;
  if (webServer === undefined || typeof webServer.register !== 'function') {
    ctx.logger?.warn?.('dsh-restart-button: webServer unavailable; status/restart routes not registered');
    return;
  }
  const dispose = webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req: any, res: any) => {
      if (!isTrustedApiRequest(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } }); return; }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
      // status
      if (req.method === 'GET' && (pathname === STATUS_PATH || pathname === PREFIX)) {
        writeJson(res, 200, { ok: true, restartable: restartable() });
        return;
      }
      // restart
      if (req.method === 'POST' && pathname === RESTART_PATH) {
        await readJsonBody(req);
        const dr = restartable();
        if (!dr) { writeJson(res, 409, { ok: false, error: { code: 'not-restartable', message: 'desktopRuntime unavailable' } }); return; }
        // Fire and forget: the process is about to exit + relaunch. Respond 202
        // first so the client sees success before the socket drops.
        writeJson(res, 202, { ok: true });
        try {
          await requestRestart();
        } catch (e) {
          ctx.logger?.error?.('dsh-restart-button: restart request failed', String((e as Error)?.message ?? e));
        }
        return;
      }
      writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } });
    },
  });
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => { const stop = dispose; return () => { try { stop?.(); } catch { /* noop */ } }; }, 'dsh-restart-button: routes');
  }
}


/** Boot probe (verification aid, not telemetry): record that the host half loaded. */
function writeBootProbe(ctx: DshContext): void {
  try {
    // ESM-safe way to reach node:fs on Node >= 22 (host runtime only; never in browser).
    const proc = (globalThis as unknown as { process?: { getBuiltinModule?: (id: string) => Record<string, unknown> } }).process;
    const fsModule = proc?.getBuiltinModule?.('node:fs');
    const write = fsModule?.writeFileSync as ((p: string, d: string) => void) | undefined;
    const mkdir = fsModule?.mkdirSync as ((p: string, o?: unknown) => void) | undefined;
    if (write && mkdir) {
      mkdir('/tmp/dsh-restart-button-test', { recursive: true });
      write('/tmp/dsh-restart-button-test/loaded', new Date().toISOString() + '\n');
    }
  } catch { /* boot probe is best-effort */ }
}
export function apply(ctx: DshContext): void {
  writeBootProbe(ctx);
  const desktopRuntime = ctx.get('desktopRuntime') as { requestRestart?: () => Promise<void> } | undefined;
  const reactService = (desktopRuntime !== undefined && typeof desktopRuntime.requestRestart === 'function')
    ? desktopRuntime
    : undefined;
  const restartable = () => reactService !== undefined;

  registerApiRoutes(ctx, restartable, () => {
    // Desktop shell guarantees requestRestart exists when the service is present.
    const active = ctx.get('desktopRuntime') as { requestRestart?: () => Promise<void> } | undefined;
    return (active?.requestRestart ? active.requestRestart() : Promise.reject(new Error('desktopRuntime unavailable')));
  });
}