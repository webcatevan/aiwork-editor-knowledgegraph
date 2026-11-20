import type { Context } from '@deepseek-ai/cordis'
import type { ArticleLibrary } from './article-library.js'
import { defineJsonTool, type ParameterSpec } from './tool-def.js'
import { normalizeGraphPayload } from './graph-normalize.js'
import { runArticleExtract } from './extract-service.js'

const P = 'graph__'

type Args = Record<string, unknown>
type Exec = (args: Args) => unknown | Promise<unknown>

function str(v: unknown, fallback = '') {
  return v != null ? String(v) : fallback
}

export function registerGraphTools(ctx: Context, lib: ArticleLibrary) {
  const tool = (name: string, description: string, parameters: Record<string, ParameterSpec>, execute: Exec) => {
    ctx.tools.register(defineJsonTool({ name, description, parameters, execute }))
  }

  tool(`${P}list_articles`, '列出智能图谱文稿', { query: { type: 'string' } }, (args) =>
    lib.listArticles(str(args.query)),
  )

  tool(`${P}get_article`, '获取文稿正文与图谱', { id: { type: 'string', required: true } }, (args) => {
    const a = lib.getArticle(str(args.id))
    return { ...a, graph: normalizeGraphPayload(JSON.parse(a.graph_json)) }
  })

  tool(`${P}create_article`, '新建文稿', { title: { type: 'string' }, body_text: { type: 'string' } }, (args) =>
    lib.createArticle(str(args.title, '未命名文稿'), str(args.body_text)),
  )

  tool(
    `${P}update_article`,
    '更新标题或正文',
    {
      id: { type: 'string', required: true },
      title: { type: 'string' },
      body_text: { type: 'string' },
    },
    (args) =>
      lib.updateArticle(str(args.id), {
        title: args.title != null ? str(args.title) : undefined,
        body_text: args.body_text != null ? str(args.body_text) : undefined,
      }),
  )

  tool(`${P}delete_article`, '删除文稿', { id: { type: 'string', required: true } }, (args) => {
    lib.deleteArticle(str(args.id))
    return { ok: true }
  })

  tool(
    `${P}save_article_graph`,
    '保存整图；先 get_article 取 graph_rev',
    {
      id: { type: 'string', required: true },
      graph: { type: 'json', required: true },
      graph_rev: { type: 'integer', required: true },
    },
    (args) => lib.saveGraph(str(args.id), args.graph, Number(args.graph_rev)),
  )

  tool(
    `${P}build_from_article`,
    '对一篇文稿启动 LLM 知识图谱构建（异步）',
    { id: { type: 'string', required: true } },
    async (args) => {
      const id = str(args.id)
      void runArticleExtract(ctx, lib, id)
      return { started: true, articleId: id }
    },
  )

  tool(
    `${P}search_nodes`,
    '在文稿图谱中检索子图',
    { id: { type: 'string', required: true }, query: { type: 'string', required: true } },
    (args) => lib.search(str(args.id), str(args.query)),
  )

  tool(`${P}focus_article`, '设置工坊当前文稿', { id: { type: 'string', required: true } }, (args) => {
    lib.setFocusArticle(str(args.id))
    return lib.getWorkshopState()
  })

  tool(`${P}get_workshop_state`, '读取工坊焦点文稿', {}, () => lib.getWorkshopState())
}