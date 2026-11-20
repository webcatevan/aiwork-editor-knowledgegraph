import type { Context } from '@deepseek-ai/cordis'
import { mergeGraphs, normalizeGraphPayload, type GraphDoc } from './graph-normalize.js'
import type { ArticleLibrary } from './article-library.js'

const CHUNK_SIZE = 3500

const EXTRACT_SYSTEM = `你是知识图谱抽取助手。只输出一个 JSON 对象，不要 markdown 围栏。
格式：{"nodes":[{"id":"n1","name":"名称","type":"concept|person|event|organization|location","description":"一句简介"}],"edges":[{"id":"e1","source":"n1","target":"n2","type":"related_to|part_of|causes|located_in","label":"关系说明"}]}
规则：节点 id 在同一响应内唯一；边 source/target 必须是 nodes 里的 id；不要编造文中没有的信息；type 用英文 code。`

export function chunkText(text: string): string[] {
  const body = text.trim()
  if (!body) return []
  const parts: string[] = []
  for (let i = 0; i < body.length; i += CHUNK_SIZE) {
    parts.push(body.slice(i, i + CHUNK_SIZE))
  }
  return parts
}

function parseGraphReply(text: string): GraphDoc {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw Object.assign(new Error('模型未返回 JSON 对象'), { code: 'MODEL_FAILED' })
  }
  const json = trimmed.slice(start, end + 1)
  return normalizeGraphPayload(JSON.parse(json))
}

function resolveModelRoute(ctx: Context): { provider: string; model: string } {
  const host = ctx as Context & {
    get?: (name: string) => {
      currentSelection?: () => { provider?: string; model?: string } | undefined
    } | undefined
  }
  const selection = host.get?.('agentDefaultModel')?.currentSelection?.()
  if (selection == null || typeof selection.provider !== 'string' || typeof selection.model !== 'string') {
    throw Object.assign(new Error('没有可用的默认模型，请先在设置里选择模型'), { code: 'MODEL_UNCONFIGURED' })
  }
  return { provider: selection.provider, model: selection.model }
}

async function extractChunk(ctx: Context, articleTitle: string, chunk: string, index: number, total: number, signal: AbortSignal): Promise<GraphDoc> {
  const route = resolveModelRoute(ctx)
  const call = await ctx.llm.prepareCall({ provider: route.provider, model: route.model, maxTokens: 4096 }, signal)
  const user = [
    `文章标题：${articleTitle}`,
    `片段 ${index + 1}/${total}：`,
    chunk,
    '',
    '请抽取本章片段的实体与关系，输出 JSON。',
  ].join('\n')
  let text = ''
  for await (const part of call.stream({
    ...(call.config as Record<string, unknown>),
    system: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    signal,
    purpose: 'knowledge-graph',
  })) {
    if (part.type === 'text-delta') text += part.text
  }
  return parseGraphReply(text)
}

export async function runArticleExtract(ctx: Context, lib: ArticleLibrary, articleId: string): Promise<void> {
  if (!lib.markExtractRunning(articleId)) return
  const signal = AbortSignal.timeout(600_000)
  try {
    const article = lib.getArticle(articleId)
    if (!article.body_text.trim()) {
      throw new Error('正文为空，无法建图')
    }
    lib.setExtractProgress(articleId, { status: 'chunk', message: '正在分段…', steps: stepState('chunk') })
    const chunks = chunkText(article.body_text)
    lib.setExtractProgress(articleId, { status: 'extract', message: `抽取 0/${chunks.length}`, steps: stepState('extract') })
    const parts: GraphDoc[] = []
    for (let i = 0; i < chunks.length; i += 1) {
      lib.setExtractProgress(articleId, {
        status: 'extract',
        message: `抽取 ${i + 1}/${chunks.length}`,
        steps: stepState('extract', i, chunks.length),
      })
      parts.push(await extractChunk(ctx, article.title, chunks[i], i, chunks.length, signal))
    }
    lib.setExtractProgress(articleId, { status: 'merge', message: '合并节点与边…', steps: stepState('merge') })
    const merged = mergeGraphs(parts)
    const summary = `共 ${merged.nodes.length} 个节点、${merged.edges.length} 条边（${chunks.length} 段抽取）。`
    lib.applyExtractResult(articleId, merged, summary)
    lib.setExtractProgress(articleId, { status: 'done', message: summary, steps: stepState('done') })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    lib.setExtractProgress(articleId, { status: 'error', message, steps: stepState('error') })
    lib.markExtractDone(articleId)
    return
  }
  lib.markExtractDone(articleId)
}

function stepState(phase: string, chunkIndex = 0, chunkTotal = 1) {
  const defs = [
    ['chunk', '分段正文'],
    ['extract', 'LLM 抽取'],
    ['merge', '合并图谱'],
    ['done', '完成'],
  ] as const
  return defs.map(([key, label]) => {
    let status: 'pending' | 'running' | 'done' | 'error' = 'pending'
    if (phase === 'error' && key === 'extract') status = 'error'
    else if (key === phase) status = 'running'
    else if (phase === 'done' || (phase === 'merge' && key !== 'done') || (phase === 'extract' && (key === 'chunk' || key === 'extract'))) {
      if (key === 'extract' && phase === 'extract' && chunkIndex < chunkTotal - 1) status = 'running'
      else if (key === phase) status = 'running'
      else if (defs.findIndex((d) => d[0] === phase) > defs.findIndex((d) => d[0] === key)) status = 'done'
      else if (phase === 'done') status = 'done'
    }
    if (phase === 'chunk' && key === 'chunk') status = 'running'
    if (phase === 'merge' && (key === 'chunk' || key === 'extract')) status = 'done'
    if (phase === 'merge' && key === 'merge') status = 'running'
    if (phase === 'done') status = 'done'
    return { key, label, status }
  })
}