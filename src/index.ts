// src/index.ts
// Host half of dsh-restart-control.
//
//   Desktop path : when the Electron shell provides the `desktopRuntime`
//                  service, POST /restart calls its official
//                  `requestRestart()` (graceful Cordis teardown, then
//                  app.relaunch() + app.exit(0)). Unchanged from v0.1.x.
//
//   Web path     : a pure `dsh --profile web` generation has no desktop shell,
//                  so there is no official restart facade. The plugin instead:
//                    1. spawns a DETACHED one-shot relauncher child first,
//                    2. replies 202,
//                    3. SIGTERMs its own process ~50ms later. The dsh CLI
//                       installs process.on("SIGTERM") -> root fiber.dispose()
//                       (profile-boot), i.e. the SAME graceful teardown the
//                       desktop facade performs; no state is lost.
//                  The relauncher polls until the old pid is actually gone
//                  (bounded backstop, never double-spawns) and re-execs the
//                  captured argv/cwd verbatim. No shell, no kill/pkill/sudo.
//
//   Lifecycle    : both paths are reported through GET /status as
//                  { restartable, mode }, which drives the client row.
import type { DshContext, WebServerLike } from './dsh.ts';

export const name = 'dsh-restart-control'; // stable plugin identity (must match package name)
/** The route service is injected by the DSH loader before apply() runs. */
export const inject = ['webServer'];

/** Route prefix (loopback only). */
const PREFIX = '/dsh-restart-control/api';
/** Status: reported to the client so it can enable/disable the button. */
const STATUS_PATH = PREFIX + '/status';
/** Restart: the only mutation. */
const RESTART_PATH = PREFIX + '/restart';

/** How long the relauncher waits for the old process to die before giving up. */
const RELAUNCH_BACKSTOP_MS = 15_000;

/** Config handed to the detached relauncher via env (JSON, lossless). */
export interface RelauncherConfig {
  /** PID of the process that will terminate itself. */
  ppid: number;
  /** Node executable to re-exec (captured verbatim). */
  execPath: string;
  /** Original argv minus the node binary (captured verbatim). */
  args: string[];
  /** Original working directory (captured verbatim). */
  cwd: string;
  /** Backstop wait for old-process death. */
  timeoutMs?: number;
}

/**
 * One-shot detached relauncher source. Runs under `node -e` (CommonJS).
 * Exit codes: 2 bad config, 1 old process refused to die (never double-spawn),
 * 0 relaunched (or old process already gone and respawn issued).
 */
export const RELAUNCHER_SOURCE = `(async () => {
  var cfg = {};
  try { cfg = JSON.parse(process.env.DRB_RELAUNCH_CFG || '{}'); } catch (e) {}
  var ppid = Number(cfg.ppid), timeoutMs = Number(cfg.timeoutMs) || 15000;
  var execPath = String(cfg.execPath || ''), args = Array.isArray(cfg.args) ? cfg.args.map(String) : null;
  var cwd = String(cfg.cwd || process.cwd());
  if (!ppid || !execPath || !args) process.exit(2);
  var alive = function () { try { process.kill(ppid, 0); return true; } catch (e) { return false; } };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var t0 = Date.now();
  while (alive()) {
    if (Date.now() - t0 >= timeoutMs) process.exit(1);
    await sleep(100);
  }
  var child = require('node:child_process').spawn(execPath, args, { cwd: cwd, detached: true, stdio: 'inherit', env: process.env });
  child.unref();
})().then(function () { process.exit(0); }, function () { process.exit(1); });
`;

/** Test seams — production callers use the defaults; tests inject fakes. */
export interface RestartDeps {
  spawnRelauncher(config: RelauncherConfig): boolean;
  terminateSelf(): void;
}

interface NodeProcessLike {
  pid: number;
  execPath: string;
  argv: string[];
  env: Record<string, string | undefined>;
  cwd(): string;
  kill(pid: number, signal?: string): void;
}
function hostProcess(): NodeProcessLike | undefined {
  return (globalThis as unknown as { process?: NodeProcessLike }).process;
}

/** Default restart mechanics; exported for reuse and e2e verification. */
export const defaultRestartDeps: RestartDeps = {
  spawnRelauncher(config: RelauncherConfig): boolean {
    try {
      const proc = hostProcess();
      if (!proc) return false;
      const cp = (proc as unknown as { getBuiltinModule?: (id: string) => any }).getBuiltinModule?.('node:child_process');
      if (!cp || typeof cp.spawn !== 'function') return false;
      const child = cp.spawn(proc.execPath, ['-e', RELAUNCHER_SOURCE], {
        detached: true,
        stdio: 'inherit',
        env: { ...proc.env, DRB_RELAUNCH_CFG: JSON.stringify(config) },
      });
      child.unref?.();
      return true;
    } catch {
      return false;
    }
  },
  terminateSelf(): void {
    // The CLI's own SIGTERM handler performs the graceful Cordis disposal.
    try { hostProcess()?.kill(hostProcess()!.pid, 'SIGTERM'); } catch { /* best effort */ }
  },
};

/** Which restart facility applies to the current generation (resolved per request). */
export type RestartTarget =
  | { kind: 'desktop'; restart(): Promise<void> }
  | { kind: 'web' }
  | null;

export function resolveRestartTarget(ctx: DshContext): RestartTarget {
  const dr = ctx.get('desktopRuntime') as { requestRestart?: () => Promise<void> } | undefined;
  if (dr !== undefined && dr !== null && typeof dr.requestRestart === 'function') {
    return { kind: 'desktop', restart: () => dr.requestRestart!() };
  }
  const proc = hostProcess();
  if (proc && typeof proc.pid === 'number' && proc.pid > 0 && typeof proc.kill === 'function' &&
      typeof proc.execPath === 'string' && proc.execPath.length > 0) {
    return { kind: 'web' };
  }
  return null;
}

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
function registerApiRoutes(ctx: DshContext, deps: RestartDeps): void {
  const webServer: WebServerLike | undefined = ctx.webServer;
  if (webServer === undefined || typeof webServer.register !== 'function') {
    ctx.logger?.warn?.('dsh-restart-control: webServer unavailable; status/restart routes not registered');
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
        const target = resolveRestartTarget(ctx);
        const proc = hostProcess();
        writeJson(res, 200, {
          ok: true,
          restartable: target !== null,
          mode: target === null ? undefined : target.kind,
          // The web client uses the PID to distinguish the relaunched process
          // from the old generation before it reloads the browser panel.
          pid: target?.kind === 'web' ? proc?.pid : undefined,
        });
        return;
      }
      // restart
      if (req.method === 'POST' && pathname === RESTART_PATH) {
        await readJsonBody(req);
        const target = resolveRestartTarget(ctx);
        if (target === null) { writeJson(res, 409, { ok: false, error: { code: 'not-restartable', message: 'no restart facility available' } }); return; }
        if (target.kind === 'desktop') {
          // Fire and forget: the process is about to exit + relaunch. Respond 202
          // first so the client sees success before the socket drops.
          writeJson(res, 202, { ok: true, mode: 'desktop' });
          try {
            await target.restart();
          } catch (e) {
            ctx.logger?.error?.('dsh-restart-control: restart request failed', String((e as Error)?.message ?? e));
          }
          return;
        }
        // Web mode: arm the relauncher BEFORE terminating ourselves. If it
        // cannot be spawned we must NOT take the server down.
        const proc = hostProcess()!;
        const config: RelauncherConfig = {
          ppid: proc.pid,
          execPath: proc.execPath,
          args: [...proc.argv.slice(1)],
          cwd: proc.cwd(),
          timeoutMs: RELAUNCH_BACKSTOP_MS,
        };
        if (!deps.spawnRelauncher(config)) {
          ctx.logger?.error?.('dsh-restart-control: relauncher could not be spawned; keeping server up');
          writeJson(res, 500, { ok: false, error: { code: 'relaunch-failed', message: 'relauncher unavailable' } });
          return;
        }
        writeJson(res, 202, { ok: true, mode: 'web' });
        // Give the socket a beat to flush the 202, then hand control to the
        // CLI's graceful SIGTERM teardown. The relauncher owns the comeback.
        setTimeout(() => deps.terminateSelf(), 50);
        return;
      }
      writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } });
    },
  });
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => { const stop = dispose; return () => { try { stop?.(); } catch { /* noop */ } }; }, 'dsh-restart-control: routes');
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
      mkdir('/tmp/dsh-restart-control-test', { recursive: true });
      write('/tmp/dsh-restart-control-test/loaded', new Date().toISOString() + '\n');
    }
  } catch { /* boot probe is best-effort */ }
}
export function apply(ctx: DshContext, deps?: Partial<RestartDeps>): void {
  writeBootProbe(ctx);
  registerApiRoutes(ctx, { ...defaultRestartDeps, ...(deps ?? {}) });
}
