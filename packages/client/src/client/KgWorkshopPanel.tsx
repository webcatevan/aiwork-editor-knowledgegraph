import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  createArticle,
  errorMessage,
  fetchArticle,
  fetchArticles,
  fetchExtractStatus,
  saveGraph,
  startExtract,
  updateArticle,
  type ArticleDetail,
  type ArticleSummary,
  type GraphDoc,
} from './api.js'
import { ArticleLibraryPage } from './ArticleLibraryPage.js'
import { GraphCanvas } from './GraphCanvas.js'
import { relationsFor } from './relations.mjs'
import { fallbackTranslate, type KgKey } from './locales.js'
import styles from './kg-workshop.css?inline'

type Screen = 'library' | 'workshop'
type Tab = 'canvas' | 'json'

function formatGraph(doc: GraphDoc): string {
  try {
    return JSON.stringify(doc, null, 2)
  } catch {
    return '{"nodes":[],"edges":[]}'
  }
}

function graphEqual(a: GraphDoc, b: GraphDoc): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

const EMPTY: GraphDoc = { nodes: [], edges: [] }

export interface KgWorkshopPanelProps {
  readonly t?: (key: KgKey) => string
}

export function KgWorkshopPanel({ t }: KgWorkshopPanelProps): ReactNode {
  const tr = useCallback((key: KgKey) => (t ? t(key) : fallbackTranslate(key)), [t])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const id = 'kg-workshop-styles'
    if (document.getElementById(id)) return
    const el = document.createElement('style')
    el.id = id
    el.textContent = styles
    document.head.appendChild(el)
  }, [])

  const [screen, setScreen] = useState<Screen>('library')
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [libraryQuery, setLibraryQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [articleId, setArticleId] = useState('')
  const [article, setArticle] = useState<ArticleDetail | null>(null)
  const [bodyDraft, setBodyDraft] = useState('')
  const [graph, setGraph] = useState<GraphDoc>(EMPTY)
  const baselineGraph = useRef<GraphDoc>(EMPTY)
  const [graphRev, setGraphRev] = useState(1)
  const [graphDirty, setGraphDirty] = useState(false)
  const [bodyDirty, setBodyDirty] = useState(false)
  const [tab, setTab] = useState<Tab>('canvas')
  const [jsonDraft, setJsonDraft] = useState(formatGraph(EMPTY))
  const [selectedId, setSelectedId] = useState('')
  const [building, setBuilding] = useState(false)
  const [buildMsg, setBuildMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  const loadLibrary = useCallback(async () => {
    setLoading(true)
    try {
      setArticles(await fetchArticles(''))
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  const applyArticle = useCallback((detail: ArticleDetail) => {
    const g = detail.graph ?? EMPTY
    setArticle(detail)
    setBodyDraft(detail.body_text)
    setGraph(g)
    baselineGraph.current = g
    setGraphRev(detail.graph_rev)
    setJsonDraft(formatGraph(g))
    setGraphDirty(false)
    setBodyDirty(false)
    setSelectedId(g.nodes[0]?.id ?? '')
  }, [])

  const openArticle = useCallback(async (id: string) => {
    if (graphDirty && !globalThis.confirm?.(tr('discardChanges'))) return
    setArticleId(id)
    setScreen('workshop')
    try {
      applyArticle(await fetchArticle(id))
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }, [applyArticle, graphDirty, tr])

  const onCreate = async (title: string): Promise<void> => {
    setStatus('')
    try {
      const created = await createArticle(title.trim() || tr('untitledArticle'), '')
      setArticles((prev) => [
        { id: created.id, title: created.title, updated_at: created.updated_at, extract_status: created.extract_status },
        ...prev,
      ])
      await openArticle(created.id)
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }

  const onSaveBody = async (): Promise<void> => {
    if (!article) return
    try {
      const saved = await updateArticle(article.id, { body_text: bodyDraft })
      applyArticle({ ...saved, graph: article.graph ?? graph })
      setBodyDirty(false)
      setStatus(tr('saved'))
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }

  const onSaveGraph = async (): Promise<void> => {
    if (!article || saving) return
    let payload = graph
    if (tab === 'json') {
      try {
        payload = JSON.parse(jsonDraft) as GraphDoc
      } catch {
        setStatus(tr('invalidJson'))
        return
      }
    }
    setSaving(true)
    try {
      const saved = await saveGraph(article.id, payload, graphRev)
      const g = saved.graph ?? normalize(saved)
      applyArticle({ ...saved, graph: g })
      setStatus(tr('saved'))
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function normalize(detail: ArticleDetail): GraphDoc {
    if (detail.graph) return detail.graph
    try {
      return JSON.parse(detail.graph_json) as GraphDoc
    } catch {
      return EMPTY
    }
  }

  const onBuild = async (): Promise<void> => {
    if (!article) return
    if (bodyDirty) await onSaveBody()
    setBuilding(true)
    setBuildMsg(tr('building'))
    try {
      await startExtract(article.id)
      const poll = async (): Promise<void> => {
        const progress = await fetchExtractStatus(article.id)
        setBuildMsg(progress.message ?? progress.status)
        if (progress.status === 'done') {
          applyArticle(await fetchArticle(article.id))
          setBuilding(false)
          setStatus(tr('saved'))
          return
        }
        if (progress.status === 'error') {
          setBuilding(false)
          setStatus(progress.message ?? tr('error'))
          return
        }
        globalThis.setTimeout(() => { void poll() }, 1200)
      }
      void poll()
    } catch (error) {
      setBuilding(false)
      setStatus(errorMessage(error))
    }
  }

  const setGraphAndDirty = (next: GraphDoc): void => {
    setGraph(next)
    const dirty = !graphEqual(baselineGraph.current, next)
    setGraphDirty(dirty)
    if (tab === 'json') setJsonDraft(formatGraph(next))
  }

  const selected = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  )
  const relations = useMemo(
    () => relationsFor(graph, selected?.id ?? '').map((item) => ({
      ...item,
      relation: item.relation || tr('unnamedRelation'),
    })),
    [graph, selected, tr],
  )

  if (screen === 'library') {
    return (
      <div className="kg-root">
        <ArticleLibraryPage
          articles={articles}
          loading={loading}
          query={libraryQuery}
          onQueryChange={setLibraryQuery}
          onRefresh={() => { void loadLibrary() }}
          onCreate={(title) => onCreate(title)}
          onOpen={(id) => { void openArticle(id) }}
          translate={tr}
          status={status}
        />
      </div>
    )
  }

  return (
    <div className="kg-root">
      <header className="kg-workshop-head">
        <button type="button" className="kg-btn" onClick={() => {
          if (graphDirty && !globalThis.confirm?.(tr('discardChanges'))) return
          setScreen('library')
          setArticleId('')
          setArticle(null)
        }}
        >
          {tr('backLibrary')}
        </button>
        <strong>{article?.title ?? ''}</strong>
        <div className="kg-toolbar">
          <button type="button" className="kg-btn primary" disabled={building || !article} onClick={() => { void onBuild() }}>
            {building ? tr('building') : tr('buildGraph')}
          </button>
          <button type="button" className="kg-btn primary" disabled={!graphDirty || saving} onClick={() => { void onSaveGraph() }}>
            {saving ? tr('saving') : graphDirty ? tr('saveGraph') : tr('graphSaved')}
          </button>
        </div>
      </header>
      {buildMsg ? <p className="kg-steps">{buildMsg}</p> : null}
      {graphDirty ? <span className="kg-status-warn">{tr('unsaved')}</span> : null}
      {status ? <p className="kg-muted">{status}</p> : null}

      <div className="kg-workshop">
        <section className="kg-pane">
          <h3>{tr('bodyTitle')}</h3>
          <textarea
            className="kg-body-textarea"
            value={bodyDraft}
            onChange={(e) => {
              setBodyDraft(e.target.value)
              setBodyDirty(e.target.value !== (article?.body_text ?? ''))
            }}
          />
          <button type="button" className="kg-btn" style={{ marginTop: 8 }} disabled={!bodyDirty} onClick={() => { void onSaveBody() }}>
            {tr('saveBody')}
          </button>
        </section>

        <section className="kg-pane">
          <h3>{tr('graphTitle')}</h3>
          <p className="kg-muted">{tr('nodes')} {graph.nodes.length} · {tr('edges')} {graph.edges.length}</p>
          <div className="kg-tabs">
            <button type="button" className={`kg-tab${tab === 'canvas' ? ' active' : ''}`} onClick={() => setTab('canvas')}>{tr('canvasTab')}</button>
            <button type="button" className={`kg-tab${tab === 'json' ? ' active' : ''}`} onClick={() => {
              setJsonDraft(formatGraph(graph))
              setTab('json')
            }}
            >
              {tr('jsonTab')}
            </button>
          </div>
          {tab === 'canvas' ? (
            graph.nodes.length === 0
              ? <p className="kg-muted">{tr('emptyGraph')}</p>
              : <GraphCanvas graph={graph} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <textarea
              className="kg-json"
              value={jsonDraft}
              onChange={(e) => {
                setJsonDraft(e.target.value)
                try {
                  const parsed = JSON.parse(e.target.value) as GraphDoc
                  setGraph(parsed)
                  setGraphDirty(!graphEqual(baselineGraph.current, parsed))
                } catch {
                  setGraphDirty(true)
                }
              }}
            />
          )}
          {selected ? (
            <div className="kg-detail">
              <strong>{selected.name ?? selected.label}</strong>
              <div className="kg-muted">{selected.type}</div>
              <input
                style={{ width: '100%', marginTop: 6 }}
                value={selected.name ?? ''}
                onChange={(e) => {
                  const next = {
                    ...graph,
                    nodes: graph.nodes.map((n) => (n.id === selected.id ? { ...n, name: e.target.value, label: e.target.value } : n)),
                  }
                  setGraphAndDirty(next)
                }}
              />
              <div className="kg-muted" style={{ marginTop: 8 }}>{tr('relations')}</div>
              {relations.length === 0 ? (
                <div className="kg-muted">{tr('noRelations')}</div>
              ) : (
                <ul className="kg-relations">
                  {relations.map((item) => (
                    <li key={item.key}>
                      <button type="button" className="kg-relation" onClick={() => setSelectedId(item.otherId)}>
                        <span className="kg-relation-name">{item.relation}</span>
                        <span>{item.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}