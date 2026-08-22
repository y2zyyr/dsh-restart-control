// src/client/index.tsx
// Client half of dsh-restart-button (unscoped npm name; must match the profile dependency key — DSH Desktop ≥ 2.0.2 validates package identity).
//
// Registers one compact preference row into the official General settings
// section (`settings.general.item`, the same slot LanguageRow / AppearanceRow /
// EnterBehaviorRow use). Order 30 places it directly below「繁忙时 Enter 键行为」
// (composer-enter, order 20). The restart request goes through the plugin's OWN
// browser-fenced host route (`/dsh-restart-button/api/restart`), so no core
// apiproxy change is needed — the host route calls the official desktopRuntime
// service (or refuses when absent, which disables the button).
import { useCallback, useEffect, useState } from 'react';
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { en, LOCALE_NS, zh } from '../locale.ts';

export const inject = ['slots', 'locale'];

const API_PREFIX = '/dsh-restart-button/api';
const STATUS_URL = API_PREFIX + '/status';
const RESTART_URL = API_PREFIX + '/restart';
const RECOVERY_TIMEOUT_MS = 30_000;
const RECOVERY_POLL_MS = 250;

const STYLE_ID = 'dsh-restart-button/row.css';
const CSS = `.drb-row{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:12px;padding:16px 0;display:flex}
.drb-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}
.drb-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.drb-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}`;

type RestartMode = 'desktop' | 'web';

interface RestartStatus {
  restartable: boolean;
  mode?: RestartMode;
  pid?: number;
}

interface RowStoreSnapshot {
  restartable: boolean;
  restarting: boolean;
  error: boolean;
  revision: number;
  mode?: RestartMode;
}

/** Row state mirror (same defineStore pattern as the official rows). */
const store = defineStore({
  init: (): RowStoreSnapshot => ({ restartable: false, restarting: false, error: false, revision: -1 }),
  actions: {
    reconcile: (d: RowStoreSnapshot, status: { restartable: boolean; mode?: RestartMode }, revision: number) => {
      if (revision <= d.revision) return;
      d.restartable = status.restartable;
      d.mode = status.mode;
      d.restarting = false;
      d.error = false;
      d.revision = revision;
    },
    restarting: (d: RowStoreSnapshot, revision: number) => {
      if (revision < d.revision) return;
      d.restarting = true;
      d.error = false;
      d.revision = revision;
    },
    failed: (d: RowStoreSnapshot, revision: number) => {
      if (revision < d.revision) return;
      d.restarting = false;
      d.error = true;
      d.revision = revision;
    },
  },
});

type Translate = (key: string) => string;

/** Probe host restart capability once per row mount. */
async function fetchStatus(signal?: AbortSignal): Promise<RestartStatus> {
  try {
    const res = await fetch(STATUS_URL, { method: 'GET', signal, cache: 'no-store' });
    if (!res.ok) return { restartable: false };
    const json = (await res.json()) as { ok?: boolean; restartable?: boolean; mode?: RestartMode; pid?: number };
    const restartable = json?.ok === true && json.restartable === true;
    return {
      restartable,
      mode: restartable ? json.mode : undefined,
      pid: restartable && Number.isInteger(json.pid) ? json.pid : undefined,
    };
  } catch {
    return { restartable: false };
  }
}

/** Wait for the new web generation, then reload the enclosing browser panel. */
async function waitForWebRecovery(previousPid?: number): Promise<boolean> {
  const deadline = Date.now() + RECOVERY_TIMEOUT_MS;
  let sawUnavailable = false;
  while (Date.now() < deadline) {
    const status = await fetchStatus();
    if (!status.restartable) {
      sawUnavailable = true;
    } else if (status.mode === 'web' &&
      (sawUnavailable || (previousPid !== undefined && status.pid !== undefined && status.pid !== previousPid))) {
      if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
        window.location.reload();
      }
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, RECOVERY_POLL_MS));
  }
  return false;
}

export function RestartRow({
  t,
  useStore,
  onStatus,
  onRestart,
}: {
  t: Translate;
  useStore: <T>(selector: (s: RowStoreSnapshot) => T) => T;
  onStatus: (status: RestartStatus) => void;
  onRestart: () => void;
}): JSX.Element {
  const restartable = useStore((s) => s.restartable);
  const restarting = useStore((s) => s.restarting);
  const error = useStore((s) => s.error);
  const mode = useStore((s) => s.mode);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector('style[data-drb="1"]')) return;
    const tag = document.createElement('style');
    tag.dataset.drb = '1';
    tag.dataset.plugin = LOCALE_NS;
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }, []);

  // Probe capability on mount.
  useEffect(() => {
    let alive = true;
    fetchStatus().then((status) => { if (alive) onStatus(status); });
    return () => { alive = false; };
  }, [onStatus]);

  const handleConfirm = useCallback(() => {
    if (restarting) return;
    setConfirmOpen(false);
    onRestart();
  }, [restarting, onRestart]);

  return (
    <div className="drb-row" data-dsh-restart-button="1">
      <div className="drb-rowText">
        <div className="drb-title">{t('title')}</div>
        <div className="drb-desc">
          {error
            ? t('error.failed')
            : (restartable ? t(mode === 'web' ? 'description.web' : 'description') : t('busy.unsupported'))}
        </div>
      </div>
      <Button
        variant="primary"
        size="md"
        disabled={!restartable || restarting}
        onClick={() => { if (!restarting && restartable) setConfirmOpen(true); }}
      >
        {restarting ? t('button.restarting') : t('button')}
      </Button>
      {confirmOpen && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={t('dialog.title')}
          description={t(mode === 'web' ? 'dialog.description.web' : 'dialog.description')}
          footer={(
            <>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t('dialog.cancel')}</Button>
              <Button variant="primary" onClick={handleConfirm}>{t('dialog.confirm')}</Button>
            </>
          )}
        />
      )}
    </div>
  );
}

/** Client plugin body: dictionaries + the General row + host round-trips. */
export function apply(ctx: any): void {
  ctx.effect(() => { ctx.locale.register(LOCALE_NS, { zh, en }); }, 'dsh-restart-button: dictionaries');
  const t = ctx.locale.bind(LOCALE_NS) as Translate;
  let bound: { reconcile: (s: RestartStatus, v: number) => void; restarting: (v: number) => void; failed: (v: number) => void } | undefined;
  let currentStatus: RestartStatus = { restartable: false };
  let revision = 0;
  const bump = (): number => { revision += 1; return revision; };

  const injected = (actions: { reconcile: (s: RestartStatus, v: number) => void; restarting: (v: number) => void; failed: (v: number) => void }) => {
    bound = actions;
    return {
      onStatus: (status: RestartStatus) => {
        currentStatus = status;
        void bound?.reconcile(status, bump());
      },
      onRestart: () => {
        const before = currentStatus;
        const rev = bump();
        void bound?.restarting(rev);
        let recovery: Promise<boolean> | undefined;
        const recover = (): Promise<boolean> => recovery ??= waitForWebRecovery(before.pid);
        fetch(RESTART_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' })
          .then(async (res) => {
            if (!res.ok) return false;
            let body: { mode?: RestartMode } = {};
            try { body = await res.json() as { mode?: RestartMode }; } catch { /* response may drop during shutdown */ }
            return (body.mode ?? before.mode) === 'web' ? recover() : true;
          })
          .catch(() => before.mode === 'web' ? recover() : false)
          .then((ok) => { if (!ok) void bound?.failed(bump()); });
      },
    };
  };

  ctx.slots.inject('settings.general.item', () => ctx.slots.register(
    {
      name: 'settings.general.item',
      id: 'restart-dsh',
      order: 30,
      store,
      locale: LOCALE_NS,
      inject: injected,
    },
    RestartRow,
  ));
}
