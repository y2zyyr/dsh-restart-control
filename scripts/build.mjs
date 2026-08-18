// scripts/build.mjs
// Builds the host bundle (lib/index.js, ESM) and the client bundle
// (lib/client.js + root client.js, IIFE wrapped for window.__ModuleLoader__).
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const PLUGIN_ID = 'dsh-restart-button'; // stable loader id (unchanged by rename)
const ENTRY_GLOBAL = '__dsh_restart_button_entry__';

const hostExternals = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/schemastery',
  'node:fs',
  'node:path',
];
const clientExternals = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-ui-settings',
];

async function main() {
  mkdirSync(join(rootDir, 'lib'), { recursive: true });

  // 1) Host bundle (ESM)
  await build({
    entryPoints: [join(rootDir, 'src', 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    external: hostExternals,
    outfile: join(rootDir, 'lib', 'index.js'),
    sourcemap: false,
    logLevel: 'silent',
  });

  // 2) Client bundle (IIFE setting a global the loader wrapper reads)
  const result = await build({
    entryPoints: [join(rootDir, 'src', 'client', '_entry.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    external: clientExternals,
    sourcemap: false,
    logLevel: 'silent',
    write: false,
  });
  const body = result.outputFiles[0].text;

  const wrapped = `window.__ModuleLoader__.load({
	id: "${PLUGIN_ID}",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
		var entry = self.${ENTRY_GLOBAL};
		module.exports.apply = entry && entry.apply;
		module.exports.inject = entry && entry.inject;
		return module.exports;
	}
});
`;

  writeFileSync(join(rootDir, 'lib', 'client.js'), wrapped);
  writeFileSync(join(rootDir, 'client.js'), wrapped);

  mkdirSync(join(rootDir, 'lib', 'types'), { recursive: true });
  mkdirSync(join(rootDir, 'lib', 'types', 'client'), { recursive: true });
  writeFileSync(join(rootDir, 'lib', 'types', 'index.d.ts'), `export * from '../../src/index';`);
  writeFileSync(join(rootDir, 'lib', 'types', 'client', 'index.d.ts'), `export * from '../../../src/client/index';`);

  console.log('[build] host ->', join(rootDir, 'lib', 'index.js'));
  console.log('[build] client ->', join(rootDir, 'lib', 'client.js'), '(' + Buffer.byteLength(wrapped) + ' bytes)');
  console.log('[build] client compat ->', join(rootDir, 'client.js'));
}
main().catch((e) => { console.error('[build] failed', e); process.exit(1); });