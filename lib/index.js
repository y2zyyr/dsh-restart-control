// src/index.ts
var name = "dsh-restart-button";
var inject = ["webServer"];
var PREFIX = "/dsh-restart-button/api";
var STATUS_PATH = PREFIX + "/status";
var RESTART_PATH = PREFIX + "/restart";
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
function registerApiRoutes(ctx, restartable, requestRestart) {
  const webServer = ctx.webServer;
  if (webServer === void 0 || typeof webServer.register !== "function") {
    ctx.logger?.warn?.("dsh-restart-button: webServer unavailable; status/restart routes not registered");
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
        writeJson(res, 200, { ok: true, restartable: restartable() });
        return;
      }
      if (req.method === "POST" && pathname === RESTART_PATH) {
        await readJsonBody(req);
        const dr = restartable();
        if (!dr) {
          writeJson(res, 409, { ok: false, error: { code: "not-restartable", message: "desktopRuntime unavailable" } });
          return;
        }
        writeJson(res, 202, { ok: true });
        try {
          await requestRestart();
        } catch (e) {
          ctx.logger?.error?.("dsh-restart-button: restart request failed", String(e?.message ?? e));
        }
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
    }, "dsh-restart-button: routes");
  }
}
function writeBootProbe(ctx) {
  try {
    const proc = globalThis.process;
    const fsModule = proc?.getBuiltinModule?.("node:fs");
    const write = fsModule?.writeFileSync;
    const mkdir = fsModule?.mkdirSync;
    if (write && mkdir) {
      mkdir("/tmp/dsh-restart-button-test", { recursive: true });
      write("/tmp/dsh-restart-button-test/loaded", (/* @__PURE__ */ new Date()).toISOString() + "\n");
    }
  } catch {
  }
}
function apply(ctx) {
  writeBootProbe(ctx);
  const desktopRuntime = ctx.get("desktopRuntime");
  const reactService = desktopRuntime !== void 0 && typeof desktopRuntime.requestRestart === "function" ? desktopRuntime : void 0;
  const restartable = () => reactService !== void 0;
  registerApiRoutes(ctx, restartable, () => {
    const active = ctx.get("desktopRuntime");
    return active?.requestRestart ? active.requestRestart() : Promise.reject(new Error("desktopRuntime unavailable"));
  });
}
export {
  apply,
  inject,
  name
};
