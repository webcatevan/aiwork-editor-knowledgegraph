#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const clientPath = join(here, '..', 'dist', 'client.js')
const body = readFileSync(clientPath, 'utf8')

assert.ok(body.includes('__ModuleLoader__.load'), 'client wrapper')
assert.ok(body.includes('@aiwork/dsh-knowledge-graph'), 'bundle id')
assert.ok(body.includes('apply'), 'exports apply')
for (const text of ['保存正文', '相关节点', '图谱已保存', 'JSON 无效', 'kg-node', 'kg-relation']) {
  assert.ok(body.includes(text), text)
}
console.log('PASS client.smoke: bundle shape ok')