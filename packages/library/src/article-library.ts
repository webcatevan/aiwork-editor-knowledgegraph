import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { normalizeGraphPayload, searchSubgraph, type GraphDoc } from './graph-normalize.js'

type SqlValue = string | number | bigint | null
type SqlRow = Record<string, unknown>

interface SqlPreparedStatement {
  get(...params: SqlValue[]): SqlRow | undefined
  all(...params: SqlValue[]): SqlRow[]
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint }
}

interface SqlDatabase {
  prepare(sql: string): SqlPreparedStatement
  exec(sql: string): void
}

class NodeSqliteDatabase implements SqlDatabase {
  private readonly db: DatabaseSync

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
  }

  prepare(sql: string): SqlPreparedStatement {
    const statement = this.db.prepare(sql)
    return {
      get: (...params) => statement.get(...params) as SqlRow | undefined,
      all: (...params) => statement.all(...params) as SqlRow[],
      run: (...params) => statement.run(...params),
    }
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }
}

export type ExtractStep = 'idle' | 'chunk' | 'extract' | 'merge' | 'done' | 'error'
export type ExtractProgress = {
  status: ExtractStep
  message?: string
  steps: { key: string; label: string; status: 'pending' | 'running' | 'done' | 'error' }[]
}

export type ArticleRow = {
  id: string
  title: string
  body_text: string
  locale: string
  schema_json: string
  graph_json: string
  graph_rev: number
  extract_status: string
  qa_summary: string
  updated_at: number
  created_at: number
}

const EMPTY_GRAPH = JSON.stringify({ nodes: [], edges: [] })

export class ArticleLibrary {
  private readonly db: SqlDatabase
  private readonly schemaJson: string
  private focusArticleId = ''
  private readonly extractProgress = new Map<string, ExtractProgress>()
  private readonly runningExtract = new Set<string>()

  constructor(dataDir: string, defaultSchemaPath?: string) {
    const file = path.join(dataDir, 'library.sqlite')
    this.db = new NodeSqliteDatabase(file)
    this.schemaJson = defaultSchemaPath && fs.existsSync(defaultSchemaPath)
      ? fs.readFileSync(defaultSchemaPath, 'utf8')
      : EMPTY_GRAPH
    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body_text TEXT NOT NULL DEFAULT '',
        locale TEXT NOT NULL DEFAULT 'zh',
        schema_json TEXT NOT NULL,
        graph_json TEXT NOT NULL,
        graph_rev INTEGER NOT NULL DEFAULT 1,
        extract_status TEXT NOT NULL DEFAULT 'idle',
        qa_summary TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
  }

  private rowToArticle(row: SqlRow): ArticleRow {
    return {
      id: String(row.id),
      title: String(row.title),
      body_text: String(row.body_text ?? ''),
      locale: String(row.locale ?? 'zh'),
      schema_json: String(row.schema_json ?? this.schemaJson),
      graph_json: String(row.graph_json ?? EMPTY_GRAPH),
      graph_rev: Number(row.graph_rev) || 1,
      extract_status: String(row.extract_status ?? 'idle'),
      qa_summary: String(row.qa_summary ?? ''),
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
    }
  }

  listArticles(query = ''): { id: string; title: string; updated_at: number; extract_status: string }[] {
    const q = query.trim().toLowerCase()
    const rows = this.db.prepare('SELECT id, title, updated_at, extract_status FROM articles ORDER BY updated_at DESC').all()
    return rows
      .map((r) => ({
        id: String(r.id),
        title: String(r.title),
        updated_at: Number(r.updated_at),
        extract_status: String(r.extract_status ?? 'idle'),
      }))
      .filter((r) => !q || r.title.toLowerCase().includes(q))
  }

  getArticle(id: string): ArticleRow {
    const row = this.db.prepare('SELECT * FROM articles WHERE id = ?').get(id)
    if (!row) {
      throw Object.assign(new Error('article not found'), { code: 'NOT_FOUND' })
    }
    return this.rowToArticle(row)
  }

  createArticle(title = '未命名文稿', bodyText = ''): ArticleRow {
    const id = randomUUID()
    const ts = Date.now()
    const schema = this.schemaJson
    this.db.prepare(
      `INSERT INTO articles (id, title, body_text, locale, schema_json, graph_json, graph_rev, extract_status, qa_summary, created_at, updated_at)
       VALUES (?, ?, ?, 'zh', ?, ?, 1, 'idle', '', ?, ?)`,
    ).run(id, title, bodyText, schema, EMPTY_GRAPH, ts, ts)
    return this.getArticle(id)
  }

  updateArticle(id: string, patch: { title?: string; body_text?: string; locale?: string }): ArticleRow {
    const current = this.getArticle(id)
  const ts = Date.now()
    this.db.prepare(
      `UPDATE articles SET title = ?, body_text = ?, locale = ?, updated_at = ? WHERE id = ?`,
    ).run(
      patch.title ?? current.title,
      patch.body_text ?? current.body_text,
      patch.locale ?? current.locale,
      ts,
      id,
    )
    return this.getArticle(id)
  }

  deleteArticle(id: string): void {
    const r = this.db.prepare('DELETE FROM articles WHERE id = ?').run(id)
    if (Number(r.changes) === 0) {
      throw Object.assign(new Error('article not found'), { code: 'NOT_FOUND' })
    }
    this.extractProgress.delete(id)
  }

  getGraph(id: string): { graph: GraphDoc; graph_rev: number } {
    const article = this.getArticle(id)
    return {
      graph: normalizeGraphPayload(JSON.parse(article.graph_json)),
      graph_rev: article.graph_rev,
    }
  }

  saveGraph(id: string, graph: unknown, expectedRev: number): ArticleRow {
    const current = this.getArticle(id)
    if (Number(current.graph_rev) !== Number(expectedRev)) {
      throw Object.assign(new Error('graph revision conflict'), { code: 'GRAPH_REV_CONFLICT' })
    }
    const normalized = normalizeGraphPayload(graph)
    const ts = Date.now()
    const nextRev = Number(current.graph_rev) + 1
    this.db.prepare(
      `UPDATE articles SET graph_json = ?, graph_rev = ?, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(normalized), nextRev, ts, id)
    return this.getArticle(id)
  }

  patchGraph(
    id: string,
    patch: { upsert_nodes?: unknown[]; upsert_edges?: unknown[]; remove_node_ids?: string[]; remove_edge_ids?: string[] },
    expectedRev: number,
  ): ArticleRow {
    const { graph, graph_rev } = this.getGraph(id)
    if (graph_rev !== expectedRev) {
      throw Object.assign(new Error('graph revision conflict'), { code: 'GRAPH_REV_CONFLICT' })
    }
    const nodes = [...graph.nodes]
    const edges = [...graph.edges]
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))
    for (const raw of patch.upsert_nodes ?? []) {
      const n = normalizeGraphPayload({ nodes: [raw], edges: [] }).nodes[0]
      if (!n) continue
      nodeMap.set(n.id, n)
    }
    const nextNodes = [...nodeMap.values()]
    const nextIds = new Set(nextNodes.map((n) => n.id))
    let nextEdges = edges.filter((e) => nextIds.has(e.source) && nextIds.has(e.target))
    for (const raw of patch.upsert_edges ?? []) {
      const e = normalizeGraphPayload({ nodes: [], edges: [raw] }).edges[0]
      if (!e) continue
      nextEdges = nextEdges.filter((x) => x.id !== e.id && !(x.source === e.source && x.target === e.target && x.type === e.type))
      nextEdges.push(e)
    }
    for (const nid of patch.remove_node_ids ?? []) {
      const idStr = String(nid)
      const idx = nextNodes.findIndex((n) => n.id === idStr)
      if (idx >= 0) nextNodes.splice(idx, 1)
      nextEdges = nextEdges.filter((e) => e.source !== idStr && e.target !== idStr)
    }
  for (const eid of patch.remove_edge_ids ?? []) {
      const idStr = String(eid)
      nextEdges = nextEdges.filter((e) => e.id !== idStr)
    }
    return this.saveGraph(id, { nodes: nextNodes, edges: nextEdges }, expectedRev)
  }

  setFocusArticle(articleId: string): void {
    this.focusArticleId = articleId
  }

  getWorkshopState(): { focus: { articleId: string } } {
    return { focus: { articleId: this.focusArticleId } }
  }

  getExtractProgress(articleId: string): ExtractProgress {
    return this.extractProgress.get(articleId) ?? {
      status: 'idle',
      steps: defaultSteps('idle'),
    }
  }

  setExtractProgress(articleId: string, progress: ExtractProgress): void {
    this.extractProgress.set(articleId, progress)
    this.db.prepare('UPDATE articles SET extract_status = ? WHERE id = ?').run(progress.status, articleId)
  }

  markExtractRunning(articleId: string): boolean {
    if (this.runningExtract.has(articleId)) return false
    this.runningExtract.add(articleId)
    return true
  }

  markExtractDone(articleId: string): void {
    this.runningExtract.delete(articleId)
  }

  applyExtractResult(articleId: string, graph: GraphDoc, summary: string): ArticleRow {
    const current = this.getArticle(articleId)
    const ts = Date.now()
    const nextRev = Number(current.graph_rev) + 1
    this.db.prepare(
      `UPDATE articles SET graph_json = ?, graph_rev = ?, qa_summary = ?, extract_status = 'done', updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(graph), nextRev, summary, ts, articleId)
    return this.getArticle(articleId)
  }

  search(id: string, query: string): GraphDoc {
    const { graph } = this.getGraph(id)
    return searchSubgraph(graph, query)
  }
}

function defaultSteps(status: ExtractStep) {
  const keys = [
    ['chunk', '分段正文'],
    ['extract', 'LLM 抽取实体关系'],
    ['merge', '合并图谱'],
    ['done', '完成'],
  ] as const
  return keys.map(([key, label]) => ({
    key,
    label,
    status:
      status === 'error' && key === 'extract'
        ? 'error' as const
        : status === key
          ? 'running' as const
          : status === 'done' || (status === 'merge' && key !== 'done') || (status === 'extract' && key === 'chunk')
            ? 'done' as const
            : 'pending' as const,
  }))
}