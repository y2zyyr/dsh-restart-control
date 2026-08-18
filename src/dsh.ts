// src/dsh.ts
// Local structural typings for the DSH runtime services this plugin consumes
// dynamically (declaration merging lives in core packages outside this
// project's type scope). Type-only; no runtime values.
import type { Context } from '@deepseek-ai/cordis';

/** DesktopHost runtime service (provided by dsh-plugin-desktop, Electron shell). */
export interface DesktopRuntimeLike {
  readonly platform?: string;
  readonly mode?: string;
  requestRestart(): Promise<void>;
}
/** Host-side WebServer face (provided by @deepseek-ai/dsh-host-webserver). */
export interface WebServerRoute {
  kind: 'prefix' | 'exact' | string;
  path: string;
  handler: (req: unknown, res: unknown) => unknown | Promise<unknown>;
}
export interface WebServerLike {
  register(route: WebServerRoute): () => void;
}
/** Context extended with the DSH runtime service surface used by this plugin. */
export type DshContext = Context & {
  logger?: { warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
  get(name: string): unknown;
  webServer?: WebServerLike;
  effect(callback: () => unknown, label?: string): unknown;
};
