import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))
const packageName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
const repoRoot = resolve(root, '..', '..')
const which = process.argv[2] ?? 'all'

const hostExternals = [/^node:/, /^@deepseek-ai\//]
const clientExternals = ['react', 'react-dom', 'react/jsx-runtime', /^@deepseek-ai\/dsh-client-/]

async function buildHost() {
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    build: {
      outDir: join(root, 'dist/.host'),
      emptyOutDir: true,
      target: 'node20',
      lib: {
        entry: join(repoRoot, 'packages/library/src/index.ts'),
        formats: ['es'],
        fileName: () => 'index.js',
      },
      rollupOptions: { external: hostExternals },
    },
  })
  const body = readFileSync(join(root, 'dist/.host/index.js'), 'utf8')
  mkdirSync(join(root, 'dist'), { recursive: true })
  writeFileSync(join(root, 'dist/index.js'), body)
  rmSync(join(root, 'dist/.host'), { recursive: true, force: true })
  console.log(`host   dist/index.js        ${(body.length / 1024).toFixed(0)} KiB`)
}

async function buildClient() {
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    esbuild: { jsx: 'automatic' },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      outDir: join(root, 'dist/.client'),
      emptyOutDir: true,
      target: 'es2022',
      minify: true,
      lib: {
        entry: join(repoRoot, 'packages/client/src/client/index.tsx'),
        formats: ['cjs'],
        fileName: () => 'client.body',
      },
      rollupOptions: { external: clientExternals, output: { exports: 'named' } },
    },
  })
  const body = readFileSync(join(root, 'dist/.client/client.body'), 'utf8')
  const wrapped = [
    '//! Knowledge Graph client — 智能图谱',
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(packageName)},`,
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    body,
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '',
  ].join('\n')
  writeFileSync(join(root, 'dist/client.js'), wrapped)
  rmSync(join(root, 'dist/.client'), { recursive: true, force: true })
  console.log(`client dist/client.js       ${(wrapped.length / 1024).toFixed(0)} KiB`)
}

if (which === 'host' || which === 'all') await buildHost()
if (which === 'client' || which === 'all') await buildClient()