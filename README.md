# Restart DSH

Adds a **Restart DSH** button to DSH Desktop → Settings → General (通用设置). It sits
directly below「繁忙时 Enter 键行为」and lets you restart the DSH Desktop application
with one click, using DSH's **official** graceful restart facility.

## Features

- Restart DSH Desktop from Settings → General (官方 slot：`settings.general.item`)
- Uses the **official** DSH Desktop restart API
  (`ctx.desktopRuntime.requestRestart()` → graceful Cordis teardown +
  `app.relaunch()` + `app.exit(0)`) — no shell, no kill, no sudo
- Native confirmation dialog (native `Modal` + `Button` primitives) before restarting
- Single-flight protection: while a restart is pending the button shows
  「正在重启…」and is disabled
- Light / Dark theme via DSH design tokens (`--dsw-alias-*`) — no hardcoded colors
- i18n: zh-CN + en
- No telemetry, no network access, no credential access, no filesystem access

## Installation

Local install into a DSH web profile (additive, backed-up edits):

1. Add to `~/.dsh/profiles/web/package.json` `dependencies`:
   ```json
   "@y2zyyr/dsh-restart-button": "link:/path/to/dsh-restart-button"
   ```
2. Add `@y2zyyr/dsh-restart-button` to `dsh.profile.bundles`.
3. Run `pnpm install` in the profile directory.
4. Restart DSH Desktop once so the new bundle's loader row activates.

The plugin's own `cordis.patch.yml` registers the Loader entry; the host half is
loaded by Cordis and the browser half is served as
`/plugins/dsh-restart-button/client.js`.

## Compatibility

- DSH Desktop (Electron shell) running in `compatibility` or `advanced` mode —
  provides the `desktopRuntime` service, so the button is enabled.
- Pure `dsh web` (headless browser, no desktop shell): the button renders but is
  disabled with a note — the restart capability is not available there.
- DSH core packages at `^0.1.0-rc.6` (compatible with the DeepSeek Harness Desktop runtime 0.1.0-rc.7; v0.1.1 widened the range so the DSH Desktop market verifier accepts the package).

## Restart mechanism

The host half registers a browser-trust-fenced route (`/dsh-restart-button/api`,
loopback / same-origin only) and calls the official
`ctx.desktopRuntime.requestRestart()` when a desktop shell is present. The
official implementation disposes the whole Cordis plugin tree (flushing settings /
session state, 5 s grace), then `app.relaunch()` + `app.exit(0)`. This is a
**graceful** restart — never a process kill. If the desktop runtime is absent, the
route reports `restartable: false` and the client disables the button.

## Security

- **No shell execution** — restart goes through the official `desktopRuntime`
  service; the plugin never spawns kill/pkill/osascript/sudo.
- **No network** — the only route is a loopback, same-origin-fenced HTTP route.
- **No credential / token access** — the plugin reads no .env, API keys, or
  session content.
- **No telemetry** — the only runtime side effect is an optional boot marker under
  `/tmp/dsh-restart-button-test/` used purely for local verification, and it is
  never shipped as telemetry.
- **Minimal permissions** — the host only requires `webServer` (route) and
  optionally `desktopRuntime`; the client only `slots`/locale.

## Development

- `pnpm install`
- `pnpm typecheck` (tsc, no emit)
- `pnpm test` (node --test; real Cordis integration tests)
- `pnpm build` (scripts/build.mjs → `lib/index.js` + `lib/client.js`)