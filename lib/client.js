window.__ModuleLoader__.load({
	id: "dsh-restart-button",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // src/client/index.tsx
  var import_react = __require("react");
  var import_client = __require("@deepseek-ai/dsh-client-runtime/client");
  var import_dsh_client_ui_primitives = __require("@deepseek-ai/dsh-client-ui-primitives");

  // src/locale.ts
  var LOCALE_NS = "dsh-restart-button";
  var zh = {
    "title": "\u91CD\u542F DSH",
    "description": "\u91CD\u65B0\u542F\u52A8 DSH Desktop \u5E94\u7528",
    "description.web": "\u91CD\u65B0\u542F\u52A8 DSH \u670D\u52A1\u8FDB\u7A0B\uFF08web \u6A21\u5F0F\uFF0C\u4F18\u96C5\u9000\u51FA\u540E\u81EA\u52A8\u62C9\u8D77\uFF09",
    "button": "\u91CD\u542F DSH",
    "button.restarting": "\u6B63\u5728\u91CD\u542F\u2026",
    "busy.warning": "\u5F53\u524D\u4ECD\u6709\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\uFF0C\u91CD\u542F\u4F1A\u4E2D\u65AD\u6B63\u5728\u6267\u884C\u7684\u4EFB\u52A1\u3002",
    "busy.supported": "DSH Desktop \u5C06\u5173\u95ED\u5E76\u91CD\u65B0\u542F\u52A8\u3002\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u6216\u672A\u5B8C\u6210\u64CD\u4F5C\u53EF\u80FD\u4F1A\u4E2D\u65AD\u3002",
    "busy.unsupported": "\u5F53\u524D\u73AF\u5883\u672A\u63D0\u4F9B\u91CD\u542F\u80FD\u529B\uFF0C\u6309\u94AE\u5DF2\u7981\u7528\u3002",
    "dialog.title": "\u91CD\u542F DSH\uFF1F",
    "dialog.description": "DSH Desktop \u5C06\u5173\u95ED\u5E76\u91CD\u65B0\u542F\u52A8\u3002\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u6216\u672A\u5B8C\u6210\u64CD\u4F5C\u53EF\u80FD\u4F1A\u4E2D\u65AD\u3002",
    "dialog.description.web": "DSH \u670D\u52A1\u8FDB\u7A0B\u5C06\u4F18\u96C5\u9000\u51FA\u5E76\u91CD\u65B0\u542F\u52A8\u3002\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u6216\u672A\u5B8C\u6210\u64CD\u4F5C\u53EF\u80FD\u4F1A\u4E2D\u65AD\u3002",
    "dialog.confirm": "\u91CD\u542F",
    "dialog.cancel": "\u53D6\u6D88",
    "error.failed": "\u91CD\u542F\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002"
  };
  var en = {
    "title": "Restart DSH",
    "description": "Restart the DSH Desktop application",
    "description.web": "Restart the DSH server process (web mode; graceful exit, then automatic relaunch)",
    "button": "Restart DSH",
    "button.restarting": "Restarting\u2026",
    "busy.warning": "Tasks are still running; restarting will interrupt them.",
    "busy.supported": "DSH Desktop will close and relaunch. Running tasks or unfinished work may be interrupted.",
    "busy.unsupported": "The restart capability is not available in this environment; the button is disabled.",
    "dialog.title": "Restart DSH?",
    "dialog.description": "DSH Desktop will close and relaunch. Running tasks or unfinished work may be interrupted.",
    "dialog.description.web": "The DSH server process will exit gracefully and relaunch. Running tasks or unfinished work may be interrupted.",
    "dialog.confirm": "Restart",
    "dialog.cancel": "Cancel",
    "error.failed": "Restart request failed. Please try again."
  };

  // src/client/index.tsx
  var import_jsx_runtime = __require("react/jsx-runtime");
  var inject = ["slots", "locale"];
  var API_PREFIX = "/dsh-restart-button/api";
  var STATUS_URL = API_PREFIX + "/status";
  var RESTART_URL = API_PREFIX + "/restart";
  var RECOVERY_TIMEOUT_MS = 3e4;
  var RECOVERY_POLL_MS = 250;
  var CSS = `.drb-row{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:12px;padding:16px 0;display:flex}
.drb-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}
.drb-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.drb-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}`;
  var store = (0, import_client.defineStore)({
    init: () => ({ restartable: false, restarting: false, error: false, revision: -1 }),
    actions: {
      reconcile: (d, status, revision) => {
        if (revision <= d.revision) return;
        d.restartable = status.restartable;
        d.mode = status.mode;
        d.restarting = false;
        d.error = false;
        d.revision = revision;
      },
      restarting: (d, revision) => {
        if (revision < d.revision) return;
        d.restarting = true;
        d.error = false;
        d.revision = revision;
      },
      failed: (d, revision) => {
        if (revision < d.revision) return;
        d.restarting = false;
        d.error = true;
        d.revision = revision;
      }
    }
  });
  async function fetchStatus(signal) {
    try {
      const res = await fetch(STATUS_URL, { method: "GET", signal, cache: "no-store" });
      if (!res.ok) return { restartable: false };
      const json = await res.json();
      const restartable = json?.ok === true && json.restartable === true;
      return {
        restartable,
        mode: restartable ? json.mode : void 0,
        pid: restartable && Number.isInteger(json.pid) ? json.pid : void 0
      };
    } catch {
      return { restartable: false };
    }
  }
  async function waitForWebRecovery(previousPid) {
    const deadline = Date.now() + RECOVERY_TIMEOUT_MS;
    let sawUnavailable = false;
    while (Date.now() < deadline) {
      const status = await fetchStatus();
      if (!status.restartable) {
        sawUnavailable = true;
      } else if (status.mode === "web" && (sawUnavailable || previousPid !== void 0 && status.pid !== void 0 && status.pid !== previousPid)) {
        if (typeof window !== "undefined" && typeof window.location?.reload === "function") {
          window.location.reload();
        }
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, RECOVERY_POLL_MS));
    }
    return false;
  }
  function RestartRow({
    t,
    useStore,
    onStatus,
    onRestart
  }) {
    const restartable = useStore((s) => s.restartable);
    const restarting = useStore((s) => s.restarting);
    const error = useStore((s) => s.error);
    const mode = useStore((s) => s.mode);
    const [confirmOpen, setConfirmOpen] = (0, import_react.useState)(false);
    (0, import_react.useEffect)(() => {
      if (typeof document === "undefined") return;
      if (document.querySelector('style[data-drb="1"]')) return;
      const tag = document.createElement("style");
      tag.dataset.drb = "1";
      tag.dataset.plugin = LOCALE_NS;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }, []);
    (0, import_react.useEffect)(() => {
      let alive = true;
      fetchStatus().then((status) => {
        if (alive) onStatus(status);
      });
      return () => {
        alive = false;
      };
    }, [onStatus]);
    const handleConfirm = (0, import_react.useCallback)(() => {
      if (restarting) return;
      setConfirmOpen(false);
      onRestart();
    }, [restarting, onRestart]);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "drb-row", "data-dsh-restart-button": "1", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "drb-rowText", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "drb-title", children: t("title") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "drb-desc", children: error ? t("error.failed") : restartable ? t(mode === "web" ? "description.web" : "description") : t("busy.unsupported") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          variant: "primary",
          size: "md",
          disabled: !restartable || restarting,
          onClick: () => {
            if (!restarting && restartable) setConfirmOpen(true);
          },
          children: restarting ? t("button.restarting") : t("button")
        }
      ),
      confirmOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Modal,
        {
          open: confirmOpen,
          onClose: () => setConfirmOpen(false),
          title: t("dialog.title"),
          description: t(mode === "web" ? "dialog.description.web" : "dialog.description"),
          footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", onClick: () => setConfirmOpen(false), children: t("dialog.cancel") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", onClick: handleConfirm, children: t("dialog.confirm") })
          ] })
        }
      )
    ] });
  }
  function apply(ctx) {
    ctx.effect(() => {
      ctx.locale.register(LOCALE_NS, { zh, en });
    }, "dsh-restart-button: dictionaries");
    const t = ctx.locale.bind(LOCALE_NS);
    let bound;
    let currentStatus = { restartable: false };
    let revision = 0;
    const bump = () => {
      revision += 1;
      return revision;
    };
    const injected = (actions) => {
      bound = actions;
      return {
        onStatus: (status) => {
          currentStatus = status;
          void bound?.reconcile(status, bump());
        },
        onRestart: () => {
          const before = currentStatus;
          const rev = bump();
          void bound?.restarting(rev);
          let recovery;
          const recover = () => recovery ??= waitForWebRecovery(before.pid);
          fetch(RESTART_URL, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", cache: "no-store" }).then(async (res) => {
            if (!res.ok) return false;
            let body = {};
            try {
              body = await res.json();
            } catch {
            }
            return (body.mode ?? before.mode) === "web" ? recover() : true;
          }).catch(() => before.mode === "web" ? recover() : false).then((ok) => {
            if (!ok) void bound?.failed(bump());
          });
        }
      };
    };
    ctx.slots.inject("settings.general.item", () => ctx.slots.register(
      {
        name: "settings.general.item",
        id: "restart-dsh",
        order: 30,
        store,
        locale: LOCALE_NS,
        inject: injected
      },
      RestartRow
    ));
  }

  // src/client/_entry.js
  self.__dsh_restart_button_entry__ = { apply, inject };
})();

		var entry = self.__dsh_restart_button_entry__;
		module.exports.apply = entry && entry.apply;
		module.exports.inject = entry && entry.inject;
		return module.exports;
	}
});
