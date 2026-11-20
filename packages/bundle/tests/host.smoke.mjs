#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundleRoot = path.resolve(here, '..')
const harnessRepo = path.resolve(bundleRoot, '../../aiwork-editor-harness')
const dshDefault = path.resolve(bundleRoot, '../../../aiwork-harness/deepseek-harness')

const checkoutCandidates = [
  process.env.DSH_CHECKOUT,
  dshDefault,
  path.resolve(harnessRepo, '../aiwork-harness/deepseek-harness'),
].filter(Boolean)

let toolsEntry = ''
for (const dir of checkoutCandidates) {
  const entry = path.join(dir, 'packages/core/tools/lib/index.js')
  if (fs.existsSync(entry)) {
    toolsEntry = entry
    break
  }
}
if (!toolsEntry) {
  console.error('FAIL  missing dsh-tools; set DSH_CHECKOUT')
  process.exit(1)
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools') {
      return { url: pathToFileURL(toolsEntry).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const results = []
function record(ok, label, detail) {
  results.push({ ok, label, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

async function check(label, fn) {
  try {
    await fn()
    record(true, label)
  } catch (error) {
    record(false, label, error instanceof Error ? error.message : String(error))
  }
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-host-'))
const tools = new Map()
const routes = new Map()
const skills = new Map()

const ctx = {
  tools: { register(t) { tools.set(t.name, t) } },
  connection: {
    fetch: {
      register(def) {
        const key = def.path
        routes.set(key, def)
        return () => routes.delete(key)
      },
    },
  },
  skills: { register(s) { skills.set(s.name, s) } },
  get(name) { return ctx[name] },
  agentDefaultModel: { currentSelection: () => ({ provider: 'mock', model: 'mock' }) },
  llm: {
    prepareCall: async () => ({
      config: {},
      stream: async function* () {
        yield {
          type: 'text-delta',
          text: JSON.stringify({
            nodes: [{ id: 'n1', name: '测试', type: 'concept' }],
            edges: [],
          }),
        }
      },
    }),
  },
  effect(fn, label) { fn(); return () => {} },
  provide() { return () => {} },
  set(k, v) { ctx[k] = v },
  logger: { warn() {} },
}

try {
  const mod = await import(pathToFileURL(path.join(bundleRoot, 'dist/index.js')).href)
  await check('bundle name knowledge-graph', () => assert.equal(mod.name, 'knowledge-graph'))
  await check('apply registers library', async () => {
    await mod.apply(ctx, { dataDir })
    assert.ok(ctx.kgLibrary)
  })
  const EXPECTED = [
    'graph__list_articles', 'graph__get_article', 'graph__create_article',
    'graph__save_article_graph', 'graph__build_from_article', 'graph__get_workshop_state',
  ]
  await check('core tools registered', () => {
    for (const name of EXPECTED) assert.ok(tools.has(name), name)
  })
  const drive = async (path, init) => {
    const pathname = path.split('?')[0]
    const def = routes.get(pathname)
    assert.ok(def, `route missing ${pathname}`)
    return def.fetch(new Request(`http://local${path}`, init))
  }
  let articleId = ''
  await check('create article + save graph', async () => {
    const r = await drive('/api/kg/article/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Smoke', body_text: '人工智能改变世界。' }),
    })
    const payload = await r.json()
    articleId = payload.article.id
    const save = await drive('/api/kg/graph/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: articleId,
        graph_rev: payload.article.graph_rev,
        graph: { nodes: [{ id: 'a', name: 'A', type: 'concept' }], edges: [] },
      }),
    })
    assert.equal(save.status, 200)
  })
  await check('extract start returns started', async () => {
    const r = await drive('/api/kg/extract/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ articleId }),
    })
    assert.equal(r.status, 200)
    await new Promise((r) => setTimeout(r, 2000))
    const st = await drive(`/api/kg/extract/status?articleId=${articleId}`, { method: 'GET' })
    const body = await st.json()
    assert.ok(body.progress)
  })
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(failed === 0 ? `\nPASS host.smoke: ${results.length} checks` : `\nFAIL ${failed}/${results.length}`)
if (failed) process.exitCode = 1