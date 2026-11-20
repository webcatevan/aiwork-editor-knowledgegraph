import type { Context } from '@deepseek-ai/cordis'
import type { ArticleLibrary } from './article-library.js'
import { normalizeGraphPayload } from './graph-normalize.js'
import { runArticleExtract } from './extract-service.js'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function failure(status: number, code: string, message: string): Response {
  return json({ code, message }, status)
}

function errorResponse(error: unknown): Response {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : 'INTERNAL'
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'NOT_FOUND') return failure(404, code, message)
  if (code === 'GRAPH_REV_CONFLICT') return failure(409, code, message)
  if (code === 'INVALID_GRAPH') return failure(400, code, message)
  return failure(500, code, message)
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text()
  if (!text.trim()) return {}
  return JSON.parse(text) as unknown
}

function queryId(request: Request, key = 'id'): string | undefined {
  const id = new URL(request.url).searchParams.get(key)?.trim()
  return id || undefined
}

export function registerGraphRoutes(ctx: Context, lib: ArticleLibrary) {
  const articles = async (request: Request): Promise<Response> => {
    try {
      const q = new URL(request.url).searchParams.get('q') ?? ''
      return json({ articles: lib.listArticles(q) })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const article = async (request: Request): Promise<Response> => {
    const id = queryId(request)
    if (!id) return failure(400, 'INVALID_INPUT', 'missing id')
    try {
      const row = lib.getArticle(id)
      return json({
        article: {
          ...row,
          graph: normalizeGraphPayload(JSON.parse(row.graph_json)),
        },
      })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const articleCreate = async (request: Request): Promise<Response> => {
    try {
      const body = (await readJson(request)) as Record<string, unknown>
      const created = lib.createArticle(String(body.title ?? '未命名文稿'), String(body.body_text ?? ''))
      return json({ article: created })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const articleUpdate = async (request: Request): Promise<Response> => {
    try {
      const body = (await readJson(request)) as Record<string, unknown>
      const id = str(body.id)
      if (!id) return failure(400, 'INVALID_INPUT', 'missing id')
      const updated = lib.updateArticle(id, {
        title: body.title != null ? String(body.title) : undefined,
        body_text: body.body_text != null ? String(body.body_text) : undefined,
      })
      return json({ article: updated })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const articleDelete = async (request: Request): Promise<Response> => {
    try {
      const body = (await readJson(request)) as Record<string, unknown>
      lib.deleteArticle(String(body.id))
      return json({ ok: true })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const graphSave = async (request: Request): Promise<Response> => {
    try {
      const body = (await readJson(request)) as Record<string, unknown>
      const id = String(body.id ?? '')
      const graphRev = Number(body.graph_rev)
      if (!id || !Number.isFinite(graphRev)) return failure(400, 'INVALID_INPUT', 'missing id or graph_rev')
      const saved = lib.saveGraph(id, body.graph, graphRev)
      return json({ article: saved })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const graphPatch = async (request: Request): Promise<Response> => {
    try {
      const body = (await readJson(request)) as Record<string, unknown>
      const id = String(body.id ?? '')
      const graphRev = Number(body.graph_rev)
      if (!id || !Number.isFinite(graphRev)) return failure(400, 'INVALID_INPUT', 'missing id or graph_rev')
      const saved = lib.patchGraph(id, body, graphRev)
      return json({ article: saved })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const search = async (request: Request): Promise<Response> => {
    const id = queryId(request, 'articleId') ?? queryId(request, 'id')
    const q = new URL(request.url).searchParams.get('q') ?? ''
    if (!id) return failure(400, 'INVALID_INPUT', 'missing articleId')
    try {
      return json({ graph: lib.search(id, q) })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const extractStart = async (request: Request): Promise<Response> => {
    try {
      const body = (await readJson(request)) as Record<string, unknown>
      const articleId = String(body.articleId ?? body.id ?? '')
      if (!articleId) return failure(400, 'INVALID_INPUT', 'missing articleId')
      lib.getArticle(articleId)
      void runArticleExtract(ctx, lib, articleId)
      return json({ started: true, articleId })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const extractStatus = async (request: Request): Promise<Response> => {
    const articleId = queryId(request, 'articleId') ?? queryId(request, 'id')
    if (!articleId) return failure(400, 'INVALID_INPUT', 'missing articleId')
    try {
      return json({ progress: lib.getExtractProgress(articleId) })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const workshopState = async (): Promise<Response> => json(lib.getWorkshopState())

  const routes: [string, string | string[], (req: Request) => Promise<Response> | Response][] = [
    ['/api/kg/articles', 'GET', articles],
    ['/api/kg/article', 'GET', article],
    ['/api/kg/article/create', 'POST', articleCreate],
    ['/api/kg/article/update', 'POST', articleUpdate],
    ['/api/kg/article/delete', 'POST', articleDelete],
    ['/api/kg/graph/save', 'POST', graphSave],
    ['/api/kg/graph/patch', 'POST', graphPatch],
    ['/api/kg/search', 'GET', search],
    ['/api/kg/extract/start', 'POST', extractStart],
    ['/api/kg/extract/status', 'GET', extractStatus],
    ['/api/kg/workshop-state', 'GET', workshopState],
  ]

  for (const [path, methods, fetch] of routes) {
    const list = Array.isArray(methods) ? methods : [methods]
    ctx.effect(
      () =>
        ctx.connection.fetch.register({
          path,
          methods: list as ('GET' | 'POST')[],
          requestBody: 'buffered',
          fetch,
        }),
      `knowledge-graph: ${path}`,
    )
  }
}

function str(v: unknown): string {
  return v != null ? String(v) : ''
}