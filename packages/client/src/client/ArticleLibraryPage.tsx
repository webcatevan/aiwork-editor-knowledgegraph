import { useMemo, useState, type ReactNode } from 'react'
import type { ArticleSummary } from './api.js'
import type { KgKey } from './locales.js'

type Tr = (key: KgKey) => string

export function ArticleLibraryPage({
  articles,
  loading,
  query,
  onQueryChange,
  onRefresh,
  onCreate,
  onOpen,
  translate: tr,
  status = '',
}: {
  articles: readonly ArticleSummary[]
  loading: boolean
  query: string
  onQueryChange: (v: string) => void
  onRefresh: () => void
  onCreate: (title: string) => void | Promise<void>
  onOpen: (id: string) => void
  translate: Tr
  status?: string
}): ReactNode {
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState(() => tr('untitledArticle'))
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return articles
    return articles.filter((a) => a.title.toLowerCase().includes(q))
  }, [articles, query])

  return (
    <div className="kg-library">
      <header className="kg-library-head">
        <h2>{tr('libraryTitle')}</h2>
        <div className="kg-library-actions">
          <button type="button" className="kg-btn" onClick={onRefresh}>{tr('refresh')}</button>
          <button
            type="button"
            className="kg-btn primary"
            disabled={loading}
            onClick={() => {
              setNewTitle(tr('untitledArticle'))
              setCreateOpen(true)
            }}
          >
            {tr('newArticle')}
          </button>
        </div>
      </header>
      {createOpen ? (
        <div className="kg-create-bar" role="dialog" aria-label={tr('newArticle')}>
          <label className="kg-create-label">
            {tr('createTitleLabel')}
            <input
              className="kg-search"
              style={{ marginTop: 4 }}
              value={newTitle}
              autoFocus
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void (async () => {
                    await onCreate(newTitle.trim() || tr('untitledArticle'))
                    setCreateOpen(false)
                  })()
                }
                if (e.key === 'Escape') setCreateOpen(false)
              }}
            />
          </label>
          <div className="kg-library-actions">
            <button type="button" className="kg-btn" onClick={() => setCreateOpen(false)}>{tr('cancel')}</button>
            <button
              type="button"
              className="kg-btn primary"
              onClick={() => {
                void (async () => {
                  await onCreate(newTitle.trim() || tr('untitledArticle'))
                  setCreateOpen(false)
                })()
              }}
            >
              {tr('createConfirm')}
            </button>
          </div>
        </div>
      ) : null}
      {status ? <p className="kg-muted kg-status-warn">{status}</p> : null}
      <input
        className="kg-search"
        type="search"
        value={query}
        placeholder={tr('searchPlaceholder')}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      {loading ? <p>…</p> : null}
      {!loading && filtered.length === 0 ? <p className="kg-muted">—</p> : null}
      <motion className="kg-grid">
        {filtered.map((article) => (
          <article key={article.id} className="kg-card">
            <h3>{article.title}</h3>
            <p className="kg-muted">{article.extract_status}</p>
            <button type="button" className="kg-btn" onClick={() => onOpen(article.id)}>{tr('open')}</button>
          </article>
        ))}
      </motion>
    </div>
  )
}

function motion({ className, children }: { className?: string; children: ReactNode }): ReactNode {
  return <div className={className}>{children}</div>
}