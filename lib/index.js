// src/index.ts
var name = "@y2zyyr/dsh-restart-control";
var inject = ["webServer"];
var PREFIX = "/dsh-restart-control/api";
var STATUS_PATH = PREFIX + "/status";
var RESTART_PATH = PREFIX + "/restart";
var RELAUNCH_BACKSTOP_MS = 15e3;
var RELAUNCHER_SOURCE = `(async () => {
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
function hostProcess() {
  return globalThis.process;
}
var defaultRestartDeps = {
  spawnRelauncher(config) {
    try {
      const proc = hostProcess();
      if (!proc) return false;
      const cp = proc.getBuiltinModule?.("node:child_process");
      if (!cp || typeof cp.spawn !== "function") return false;
      const child = cp.spawn(proc.execPath, ["-e", RELAUNCHER_SOURCE], {
        detached: true,
        stdio: "inherit",
        env: { ...proc.env, DRB_RELAUNCH_CFG: JSON.stringify(config) }
      });
      child.unref?.();
      return true;
    } catch {
      return false;
    }
  },
  terminateSelf() {
    try {
      hostProcess()?.kill(hostProcess().pid, "SIGTERM");
    } catch {
    }
  }
};
function resolveRestartTarget(ctx) {
  const dr = ctx.get("desktopRuntime");
  if (dr !== void 0 && dr !== null && typeof dr.requestRestart === "function") {
    return { kind: "desktop", restart: () => dr.requestRestart() };
  }
  const proc = hostProcess();
  if (proc && typeof proc.pid === "number" && proc.pid > 0 && typeof proc.kill === "function" && typeof proc.execPath === "string" && proc.execPath.length > 0) {
    return { kind: "web" };
  }
  return null;
}
function isTrustedApiRequest(request) {
  const raw = request.headers["host"];
  const host = typeof raw === "string" ? raw : void 0;
  if (host === void 0) return false;
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  const loopback = hostname === "localhost" || hostname === "[::1]" || hostname.split(".").length === 4 && hostname.startsWith("127.");
  if (!loopback) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers["origin"];
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
function writeJson(res, status, body) {
  if (typeof res.statusCode === "number") res.statusCode = status;
  if (typeof res.setHeader === "function") res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += String(chunk);
  if (body.length === 0) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
function registerApiRoutes(ctx, deps) {
  const webServer = ctx.webServer;
  if (webServer === void 0 || typeof webServer.register !== "function") {
    ctx.logger?.warn?.("dsh-restart-control: webServer unavailable; status/restart routes not registered");
    return;
  }
  const dispose = webServer.register({
    kind: "prefix",
    path: PREFIX,
    handler: async (req, res) => {
      if (!isTrustedApiRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        return;
      }
      const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
      if (req.method === "GET" && (pathname === STATUS_PATH || pathname === PREFIX)) {
        const target = resolveRestartTarget(ctx);
        const proc = hostProcess();
        writeJson(res, 200, {
          ok: true,
          restartable: target !== null,
          mode: target === null ? void 0 : target.kind,
          // The web client uses the PID to distinguish the relaunched process
          // from the old generation before it reloads the browser panel.
          pid: target?.kind === "web" ? proc?.pid : void 0
        });
        return;
      }
      if (req.method === "POST" && pathname === RESTART_PATH) {
        await readJsonBody(req);
        const target = resolveRestartTarget(ctx);
        if (target === null) {
          writeJson(res, 409, { ok: false, error: { code: "not-restartable", message: "no restart facility available" } });
          return;
        }
        if (target.kind === "desktop") {
          writeJson(res, 202, { ok: true, mode: "desktop" });
          try {
            await target.restart();
          } catch (e) {
            ctx.logger?.error?.("dsh-restart-control: restart request failed", String(e?.message ?? e));
          }
          return;
        }
        const proc = hostProcess();
        const config = {
          ppid: proc.pid,
          execPath: proc.execPath,
          args: [...proc.argv.slice(1)],
          cwd: proc.cwd(),
          timeoutMs: RELAUNCH_BACKSTOP_MS
        };
        if (!deps.spawnRelauncher(config)) {
          ctx.logger?.error?.("dsh-restart-control: relauncher could not be spawned; keeping server up");
          writeJson(res, 500, { ok: false, error: { code: "relaunch-failed", message: "relauncher unavailable" } });
          return;
        }
        writeJson(res, 202, { ok: true, mode: "web" });
        setTimeout(() => deps.terminateSelf(), 50);
        return;
      }
      writeJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
    }
  });
  if (typeof ctx.effect === "function") {
    ctx.effect(() => {
      const stop = dispose;
      return () => {
        try {
          stop?.();
        } catch {
        }
      };
    }, "dsh-restart-control: routes");
  }
}
function writeBootProbe(ctx) {
  try {
    const proc = globalThis.process;
    const fsModule = proc?.getBuiltinModule?.("node:fs");
    const write = fsModule?.writeFileSync;
    const mkdir = fsModule?.mkdirSync;
    if (write && mkdir) {
      mkdir("/tmp/dsh-restart-control-test", { recursive: true });
      write("/tmp/dsh-restart-control-test/loaded", (/* @__PURE__ */ new Date()).toISOString() + "\n");
    }
  } catch {
  }
}
function apply(ctx, deps) {
  writeBootProbe(ctx);
  registerApiRoutes(ctx, { ...defaultRestartDeps, ...deps ?? {} });
}
export {
  RELAUNCHER_SOURCE,
  apply,
  defaultRestartDeps,
  inject,
  name,
  resolveRestartTarget
};
