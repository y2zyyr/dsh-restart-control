// src/client/index.tsx
// Client half of dsh-restart-button (@y2zyyr scoped npm package).
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

const STYLE_ID = 'dsh-restart-button/row.css';
const CSS = `.drb-row{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:12px;padding:16px 0;display:flex}
.drb-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}
.drb-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.drb-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}`;

interface RowStoreSnapshot {
  restartable: boolean;
  restarting: boolean;
  error: boolean;
  revision: number;
}

/** Row state mirror (same defineStore pattern as the official rows). */
const store = defineStore({
  init: (): RowStoreSnapshot => ({ restartable: false, restarting: false, error: false, revision: -1 }),
  actions: {
    reconcile: (d: RowStoreSnapshot, restartable: boolean, revision: number) => {
      if (revision <= d.revision) return;
      d.restartable = restartable;
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
async function fetchStatus(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(STATUS_URL, { method: 'GET', signal, cache: 'no-store' });
    if (!res.ok) return false;
    const json = (await res.json()) as { ok?: boolean; restartable?: boolean };
    return json?.ok === true && json.restartable === true;
  } catch {
    return false;
  }
}

export function RestartRow({
  t,
  useStore,
  onStatus,
  onRestart,
}: {
  t: Translate;
  useStore: <T>(selector: (s: RowStoreSnapshot) => T) => T;
  onStatus: (status: { restartable: boolean }) => void;
  onRestart: () => void;
}): JSX.Element {
  const restartable = useStore((s) => s.restartable);
  const restarting = useStore((s) => s.restarting);
  const error = useStore((s) => s.error);
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
    fetchStatus().then((ok) => { if (alive) onStatus({ restartable: ok }); });
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
          {error ? t('error.failed') : (restartable ? t('description') : t('busy.unsupported'))}
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
          description={t('dialog.description')}
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
  let bound: { reconcile: (r: boolean, v: number) => void; restarting: (v: number) => void; failed: (v: number) => void } | undefined;
  let revision = 0;
  const bump = (): number => { revision += 1; return revision; };

  const injected = (actions: { reconcile: (r: boolean, v: number) => void; restarting: (v: number) => void; failed: (v: number) => void }) => {
    bound = actions;
    return {
      onStatus: (status: { restartable: boolean }) => void bound?.reconcile(status.restartable, bump()),
      onRestart: () => {
        const rev = bump();
        void bound?.restarting(rev);
        fetch(RESTART_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' })
          .then((res) => { void res; })
          .catch(() => { void bound?.failed(bump()); });
        // The host either returns 202 (process about to relaunch) or the socket
        // drops mid-shutdown. Restarting state is intentionally sticky on success.
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