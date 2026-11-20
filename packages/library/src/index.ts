import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context as CordisContext } from '@deepseek-ai/cordis'
import { ArticleLibrary } from './article-library.js'
import { registerGraphTools } from './tools.js'
import { registerGraphRoutes } from './routes.js'

export const name = 'knowledge-graph'
export const inject = ['tools', 'connection', 'skills', 'llm']

export interface KnowledgeGraphConfig {
  dataDir?: string
  schemaPath?: string
}

function bundleRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  if (path.basename(here) === 'dist') return path.dirname(here)
  return path.resolve(here, '../../bundle')
}

function defaultSchemaPath(): string | undefined {
  const candidates = [
    path.join(bundleRoot(), 'shared', 'graph-schema', 'default-schema.json'),
    path.resolve(bundleRoot(), '..', '..', 'shared/graph-schema/default-schema.json'),
  ]
  return candidates.find((c) => fs.existsSync(c))
}

function registerBundledSkill(ctx: CordisContext) {
  const file = path.join(bundleRoot(), 'skill', 'SKILL.md')
  if (!fs.existsSync(file)) {
    const bundleSkill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bundle/skill/SKILL.md')
    if (!fs.existsSync(bundleSkill)) return
    registerSkillFile(ctx, bundleSkill)
    return
  }
  registerSkillFile(ctx, file)
}

function registerSkillFile(ctx: CordisContext, file: string) {
  const raw = fs.readFileSync(file, 'utf8')
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!frontmatter?.[1]) return
  const fields: Record<string, string> = {}
  for (const line of frontmatter[1].split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (match?.[1] && match[2] !== undefined) fields[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  const name = fields.name
  const description = fields.description
  if (!name || !description) return
  ctx.effect(
    () =>
      ctx.skills.register({
        name,
        description,
        content: raw.slice(frontmatter[0].length).trim(),
        path: file,
        resourceBase: { kind: 'directory', path: path.dirname(file) },
      }),
    'knowledge-graph: skill',
  )
}

export async function apply(ctx: CordisContext, config: KnowledgeGraphConfig = {}) {
  const dataDir =
    config.dataDir?.trim() ||
    path.join(process.env.DSH_PROFILE_DIR ?? process.cwd(), 'kg-workshop')
  const schemaPath = config.schemaPath?.trim() || defaultSchemaPath()
  const lib = new ArticleLibrary(dataDir, schemaPath)

  if (typeof ctx.provide === 'function') ctx.provide('kgLibrary', lib)
  ctx.kgLibrary = lib

  registerGraphTools(ctx, lib)
  registerGraphRoutes(ctx, lib)
  registerBundledSkill(ctx)

  ctx.effect(() => () => {
    if (ctx.kgLibrary === lib) ctx.kgLibrary = undefined
  }, 'knowledge-graph: library handle')
}