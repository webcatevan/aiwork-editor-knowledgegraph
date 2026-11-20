#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundle = path.join(root, 'packages/bundle')
const dsh = process.env.DSH_CHECKOUT ?? path.join(root, '../aiwork-harness/deepseek-harness')

function run(label, cmd, args, cwd, extra = {}) {
  console.log(`\n>> ${label}`)
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...extra }, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const tools = path.join(dsh, 'packages/core/tools/lib/index.js')
if (!fs.existsSync(tools)) {
  console.error('missing', tools, '(set DSH_CHECKOUT)')
  process.exit(1)
}

run('build', 'node', ['build.mjs', 'all'], bundle)
run('test', 'npm', ['test'], bundle, { DSH_CHECKOUT: dsh })
console.log('\nPASS release-prep')