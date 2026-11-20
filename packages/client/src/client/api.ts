export class KgError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export type ArticleSummary = { id: string; title: string; updated_at: number; extract_status: string }

export type GraphDoc = {
  nodes: { id: string; name?: string; label?: string; type?: string; description?: string }[]
  edges: { id?: string; source: string; target: string; type?: string; label?: string }[]
}

export type ArticleDetail = ArticleSummary & {
  body_text: string
  graph_json: string
  graph_rev: number
  qa_summary: string
  graph?: GraphDoc
}

export type ExtractProgress = {
  status: string
  message?: string
  steps: { key: string; label: string; status: string }[]
}

const ENDPOINTS = {
  articles: '/api/kg/articles',
  article: '/api/kg/article',
  create: '/api/kg/article/create',
  update: '/api/kg/article/update',
  delete: '/api/kg/article/delete',
  graphSave: '/api/kg/graph/save',
  extractStart: '/api/kg/extract/start',
  extractStatus: '/api/kg/extract/status',
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { code?: string; message?: string }
  if (!response.ok) {
    throw new KgError(response.status, String(payload.code ?? 'HTTP'), String(payload.message ?? response.statusText))
  }
  return payload as T
}

function withQuery(base: string, key: string, value: string): string {
  const url = new URL(base, 'http://local')
  if (value) url.searchParams.set(key, value)
  return `${url.pathname}${url.search}`
}

export async function fetchArticles(query = ''): Promise<ArticleSummary[]> {
  const response = await fetch(withQuery(ENDPOINTS.articles, 'q', query), { headers: { Accept: 'application/json' } })
  const data = await readJson<{ articles?: ArticleSummary[] }>(response)
  return Array.isArray(data.articles) ? data.articles : []
}

export async function fetchArticle(id: string): Promise<ArticleDetail> {
  const response = await fetch(withQuery(ENDPOINTS.article, 'id', id), { headers: { Accept: 'application/json' } })
  const data = await readJson<{ article?: ArticleDetail }>(response)
  if (!data.article) throw new KgError(500, 'INVALID', 'missing article')
  return data.article
}

export async function createArticle(title: string, body = ''): Promise<ArticleDetail> {
  const response = await fetch(ENDPOINTS.create, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ title, body_text: body }),
  })
  const data = await readJson<{ article?: ArticleDetail }>(response)
  if (!data.article) throw new KgError(500, 'INVALID', 'missing article')
  return data.article
}

export async function updateArticle(id: string, patch: { title?: string; body_text?: string }): Promise<ArticleDetail> {
  const response = await fetch(ENDPOINTS.update, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  })
  const data = await readJson<{ article?: ArticleDetail }>(response)
  if (!data.article) throw new KgError(500, 'INVALID', 'missing article')
  return data.article
}

export async function saveGraph(id: string, graph: GraphDoc, graphRev: number): Promise<ArticleDetail> {
  const response = await fetch(ENDPOINTS.graphSave, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ id, graph, graph_rev: graphRev }),
  })
  const data = await readJson<{ article?: ArticleDetail }>(response)
  if (!data.article) throw new KgError(500, 'INVALID', 'missing article')
  return data.article
}

export async function startExtract(articleId: string): Promise<void> {
  const response = await fetch(ENDPOINTS.extractStart, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ articleId }),
  })
  await readJson(response)
}

export async function fetchExtractStatus(articleId: string): Promise<ExtractProgress> {
  const response = await fetch(withQuery(ENDPOINTS.extractStatus, 'articleId', articleId), {
    headers: { Accept: 'application/json' },
  })
  const data = await readJson<{ progress?: ExtractProgress }>(response)
  return data.progress ?? { status: 'idle', steps: [] }
}

export function errorMessage(error: unknown): string {
  if (error instanceof KgError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}