import b from "node:fs";
import y from "node:path";
import { fileURLToPath as $ } from "node:url";
import { DatabaseSync as C } from "node:sqlite";
import { randomUUID as F } from "node:crypto";
function S(e) {
  return e == null ? "" : String(e).trim();
}
function k(e, t) {
  return S(e) || t;
}
function L(e) {
  let t = e;
  if (typeof t == "string" && (t = JSON.parse(t)), !t || typeof t != "object" || Array.isArray(t))
    return { nodes: [], edges: [] };
  const r = t;
  r.data && typeof r.data == "object" && (t = r.data);
  const n = t, s = Array.isArray(n.nodes) ? n.nodes : Array.isArray(n.entities) ? n.entities : [], d = Array.isArray(n.edges) ? n.edges : Array.isArray(n.relations) ? n.relations : [], c = [], l = /* @__PURE__ */ new Set();
  for (let p = 0; p < s.length; p += 1) {
    const f = s[p];
    if (!f || typeof f != "object") continue;
    const u = f, a = S(u.name) || S(u.label) || S(u.title) || `节点${p + 1}`, i = k(u.id, `n_${p + 1}`);
    l.has(i) || (l.add(i), c.push({
      ...u,
      id: i,
      name: a,
      label: S(u.label) || a,
      type: S(u.type) || "concept"
    }));
  }
  const o = new Map(c.map((p) => [p.id, p])), h = new Map(c.map((p) => [S(p.name).toLowerCase(), p.id])), _ = [];
  for (let p = 0; p < d.length; p += 1) {
    const f = d[p];
    if (!f || typeof f != "object") continue;
    const u = f;
    let a = k(u.source ?? u.from ?? u.head, ""), i = k(u.target ?? u.to ?? u.tail, "");
    if (!o.has(a)) {
      const g = h.get(a.toLowerCase());
      g && (a = g);
    }
    if (!o.has(i)) {
      const g = h.get(i.toLowerCase());
      g && (i = g);
    }
    !a || !i || !o.has(a) || !o.has(i) || _.push({
      ...u,
      id: k(u.id, `e_${p + 1}`),
      source: a,
      target: i,
      type: S(u.type) || "related_to",
      label: S(u.label) || S(u.type) || "相关"
    });
  }
  return { nodes: c, edges: _ };
}
function J(e) {
  const t = [], r = [], n = /* @__PURE__ */ new Map(), s = (l) => {
    const o = S(l.name).toLowerCase();
    n.get(o) || (n.set(o, l.id), t.push(l));
  };
  for (const l of e)
    for (const o of l.nodes) s(o);
  const d = /* @__PURE__ */ new Map();
  for (const l of e)
    for (const o of l.nodes) {
      const h = n.get(S(o.name).toLowerCase()) ?? o.id;
      d.set(o.id, h);
    }
  const c = /* @__PURE__ */ new Set();
  for (const l of e)
    for (const o of l.edges) {
      const h = d.get(o.source) ?? o.source, _ = d.get(o.target) ?? o.target, p = `${h}	${_}	${o.type ?? ""}`;
      c.has(p) || (c.add(p), r.push({ ...o, source: h, target: _ }));
    }
  return { nodes: t, edges: r };
}
function M(e, t, r = 40) {
  const n = t.trim().toLowerCase();
  if (!n) return e;
  const s = /* @__PURE__ */ new Set();
  for (const o of e.nodes)
    [
      o.name,
      o.label,
      o.description,
      ...Array.isArray(o.aliases) ? o.aliases : []
    ].filter(Boolean).join(" ").toLowerCase().includes(n) && s.add(o.id);
  if (s.size === 0) return { nodes: [], edges: [] };
  const d = e.edges.filter((o) => s.has(o.source) || s.has(o.target));
  for (const o of d)
    s.add(o.source), s.add(o.target);
  const c = e.nodes.filter((o) => s.has(o.id)).slice(0, r), l = new Set(c.map((o) => o.id));
  return {
    nodes: c,
    edges: d.filter((o) => l.has(o.source) && l.has(o.target))
  };
}
class H {
  db;
  constructor(t) {
    b.mkdirSync(y.dirname(t), { recursive: !0 }), this.db = new C(t);
  }
  prepare(t) {
    const r = this.db.prepare(t);
    return {
      get: (...n) => r.get(...n),
      all: (...n) => r.all(...n),
      run: (...n) => r.run(...n)
    };
  }
  exec(t) {
    this.db.exec(t);
  }
}
const j = JSON.stringify({ nodes: [], edges: [] });
class V {
  db;
  schemaJson;
  focusArticleId = "";
  extractProgress = /* @__PURE__ */ new Map();
  runningExtract = /* @__PURE__ */ new Set();
  constructor(t, r) {
    const n = y.join(t, "library.sqlite");
    this.db = new H(n), this.schemaJson = r && b.existsSync(r) ? b.readFileSync(r, "utf8") : j, this.init();
  }
  init() {
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
    `);
  }
  rowToArticle(t) {
    return {
      id: String(t.id),
      title: String(t.title),
      body_text: String(t.body_text ?? ""),
      locale: String(t.locale ?? "zh"),
      schema_json: String(t.schema_json ?? this.schemaJson),
      graph_json: String(t.graph_json ?? j),
      graph_rev: Number(t.graph_rev) || 1,
      extract_status: String(t.extract_status ?? "idle"),
      qa_summary: String(t.qa_summary ?? ""),
      created_at: Number(t.created_at),
      updated_at: Number(t.updated_at)
    };
  }
  listArticles(t = "") {
    const r = t.trim().toLowerCase();
    return this.db.prepare("SELECT id, title, updated_at, extract_status FROM articles ORDER BY updated_at DESC").all().map((s) => ({
      id: String(s.id),
      title: String(s.title),
      updated_at: Number(s.updated_at),
      extract_status: String(s.extract_status ?? "idle")
    })).filter((s) => !r || s.title.toLowerCase().includes(r));
  }
  getArticle(t) {
    const r = this.db.prepare("SELECT * FROM articles WHERE id = ?").get(t);
    if (!r)
      throw Object.assign(new Error("article not found"), { code: "NOT_FOUND" });
    return this.rowToArticle(r);
  }
  createArticle(t = "未命名文稿", r = "") {
    const n = F(), s = Date.now(), d = this.schemaJson;
    return this.db.prepare(
      `INSERT INTO articles (id, title, body_text, locale, schema_json, graph_json, graph_rev, extract_status, qa_summary, created_at, updated_at)
       VALUES (?, ?, ?, 'zh', ?, ?, 1, 'idle', '', ?, ?)`
    ).run(n, t, r, d, j, s, s), this.getArticle(n);
  }
  updateArticle(t, r) {
    const n = this.getArticle(t), s = Date.now();
    return this.db.prepare(
      "UPDATE articles SET title = ?, body_text = ?, locale = ?, updated_at = ? WHERE id = ?"
    ).run(
      r.title ?? n.title,
      r.body_text ?? n.body_text,
      r.locale ?? n.locale,
      s,
      t
    ), this.getArticle(t);
  }
  deleteArticle(t) {
    const r = this.db.prepare("DELETE FROM articles WHERE id = ?").run(t);
    if (Number(r.changes) === 0)
      throw Object.assign(new Error("article not found"), { code: "NOT_FOUND" });
    this.extractProgress.delete(t);
  }
  getGraph(t) {
    const r = this.getArticle(t);
    return {
      graph: L(JSON.parse(r.graph_json)),
      graph_rev: r.graph_rev
    };
  }
  saveGraph(t, r, n) {
    const s = this.getArticle(t);
    if (Number(s.graph_rev) !== Number(n))
      throw Object.assign(new Error("graph revision conflict"), { code: "GRAPH_REV_CONFLICT" });
    const d = L(r), c = Date.now(), l = Number(s.graph_rev) + 1;
    return this.db.prepare(
      "UPDATE articles SET graph_json = ?, graph_rev = ?, updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(d), l, c, t), this.getArticle(t);
  }
  patchGraph(t, r, n) {
    const { graph: s, graph_rev: d } = this.getGraph(t);
    if (d !== n)
      throw Object.assign(new Error("graph revision conflict"), { code: "GRAPH_REV_CONFLICT" });
    const c = [...s.nodes], l = [...s.edges], o = new Map(c.map((f) => [f.id, f]));
    for (const f of r.upsert_nodes ?? []) {
      const u = L({ nodes: [f], edges: [] }).nodes[0];
      u && o.set(u.id, u);
    }
    const h = [...o.values()], _ = new Set(h.map((f) => f.id));
    let p = l.filter((f) => _.has(f.source) && _.has(f.target));
    for (const f of r.upsert_edges ?? []) {
      const u = L({ nodes: [], edges: [f] }).edges[0];
      u && (p = p.filter((a) => a.id !== u.id && !(a.source === u.source && a.target === u.target && a.type === u.type)), p.push(u));
    }
    for (const f of r.remove_node_ids ?? []) {
      const u = String(f), a = h.findIndex((i) => i.id === u);
      a >= 0 && h.splice(a, 1), p = p.filter((i) => i.source !== u && i.target !== u);
    }
    for (const f of r.remove_edge_ids ?? []) {
      const u = String(f);
      p = p.filter((a) => a.id !== u);
    }
    return this.saveGraph(t, { nodes: h, edges: p }, n);
  }
  setFocusArticle(t) {
    this.focusArticleId = t;
  }
  getWorkshopState() {
    return { focus: { articleId: this.focusArticleId } };
  }
  getExtractProgress(t) {
    return this.extractProgress.get(t) ?? {
      status: "idle",
      steps: W("idle")
    };
  }
  setExtractProgress(t, r) {
    this.extractProgress.set(t, r), this.db.prepare("UPDATE articles SET extract_status = ? WHERE id = ?").run(r.status, t);
  }
  markExtractRunning(t) {
    return this.runningExtract.has(t) ? !1 : (this.runningExtract.add(t), !0);
  }
  markExtractDone(t) {
    this.runningExtract.delete(t);
  }
  applyExtractResult(t, r, n) {
    const s = this.getArticle(t), d = Date.now(), c = Number(s.graph_rev) + 1;
    return this.db.prepare(
      "UPDATE articles SET graph_json = ?, graph_rev = ?, qa_summary = ?, extract_status = 'done', updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(r), c, n, d, t), this.getArticle(t);
  }
  search(t, r) {
    const { graph: n } = this.getGraph(t);
    return M(n, r);
  }
}
function W(e) {
  return [
    ["chunk", "分段正文"],
    ["extract", "LLM 抽取实体关系"],
    ["merge", "合并图谱"],
    ["done", "完成"]
  ].map(([r, n]) => ({
    key: r,
    label: n,
    status: e === r ? "running" : "pending"
  }));
}
function O(e) {
  const t = {};
  return e.description !== void 0 && (t.description = e.description), e.title !== void 0 && (t.title = e.title), e.default !== void 0 && (t.default = e.default), e.examples !== void 0 && (t.examples = e.examples), e.enum !== void 0 && (t.enum = e.enum), e.const !== void 0 && (t.const = e.const), t;
}
function R(e) {
  if (e.type === "json") return O(e);
  if (e.oneOf !== void 0) return { ...O(e), oneOf: e.oneOf.map(R) };
  if (e.type === "object") {
    const t = {
      type: "object",
      additionalProperties: e.additionalProperties ?? !1,
      ...O(e)
    };
    if (e.properties !== void 0) {
      const r = Object.entries(e.properties).filter(([, n]) => n.required === !0).map(([n]) => n);
      t.properties = Object.fromEntries(
        Object.entries(e.properties).map(([n, s]) => [n, R(s)])
      ), r.length > 0 && (t.required = r);
    }
    return t;
  }
  return e.type === "array" ? {
    ...e.items === void 0 ? {} : { items: R(e.items) },
    type: "array",
    ...O(e)
  } : { ...e.type === void 0 ? {} : { type: e.type }, ...O(e) };
}
function X(e) {
  const t = Object.entries(e).filter(([, n]) => n.required === !0).map(([n]) => n), r = {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(e).map(([n, s]) => [n, R(s)])
    )
  };
  return t.length > 0 && (r.required = t), r;
}
function z(e) {
  return [{ type: "text", text: JSON.stringify(e ?? null, null, 2) }];
}
function K(e) {
  return {
    name: e.name,
    description: e.description,
    parameters: X(e.parameters),
    output: { schema: {}, render: (t, r) => z(r) },
    execute: async (t) => e.execute(t ?? {})
  };
}
const U = 3500, B = `你是知识图谱抽取助手。只输出一个 JSON 对象，不要 markdown 围栏。
格式：{"nodes":[{"id":"n1","name":"名称","type":"concept|person|event|organization|location","description":"一句简介"}],"edges":[{"id":"e1","source":"n1","target":"n2","type":"related_to|part_of|causes|located_in","label":"关系说明"}]}
规则：节点 id 在同一响应内唯一；边 source/target 必须是 nodes 里的 id；不要编造文中没有的信息；type 用英文 code。`;
function Y(e) {
  const t = e.trim();
  if (!t) return [];
  const r = [];
  for (let n = 0; n < t.length; n += U)
    r.push(t.slice(n, n + U));
  return r;
}
function Z(e) {
  const t = e.trim(), r = t.indexOf("{"), n = t.lastIndexOf("}");
  if (r < 0 || n <= r)
    throw Object.assign(new Error("模型未返回 JSON 对象"), { code: "MODEL_FAILED" });
  const s = t.slice(r, n + 1);
  return L(JSON.parse(s));
}
function Q(e) {
  const r = e.get?.("agentDefaultModel")?.currentSelection?.();
  if (r == null || typeof r.provider != "string" || typeof r.model != "string")
    throw Object.assign(new Error("没有可用的默认模型，请先在设置里选择模型"), { code: "MODEL_UNCONFIGURED" });
  return { provider: r.provider, model: r.model };
}
async function tt(e, t, r, n, s, d) {
  const c = Q(e), l = await e.llm.prepareCall({ provider: c.provider, model: c.model, maxTokens: 4096 }, d), o = [
    `文章标题：${t}`,
    `片段 ${n + 1}/${s}：`,
    r,
    "",
    "请抽取本章片段的实体与关系，输出 JSON。"
  ].join(`
`);
  let h = "";
  for await (const _ of l.stream({
    ...l.config,
    system: B,
    messages: [{ role: "user", content: [{ type: "text", text: o }] }],
    signal: d,
    purpose: "knowledge-graph"
  }))
    _.type === "text-delta" && (h += _.text);
  return Z(h);
}
async function G(e, t, r) {
  if (!t.markExtractRunning(r)) return;
  const n = AbortSignal.timeout(6e5);
  try {
    const s = t.getArticle(r);
    if (!s.body_text.trim())
      throw new Error("正文为空，无法建图");
    t.setExtractProgress(r, { status: "chunk", message: "正在分段…", steps: w("chunk") });
    const d = Y(s.body_text);
    t.setExtractProgress(r, { status: "extract", message: `抽取 0/${d.length}`, steps: w("extract") });
    const c = [];
    for (let h = 0; h < d.length; h += 1)
      t.setExtractProgress(r, {
        status: "extract",
        message: `抽取 ${h + 1}/${d.length}`,
        steps: w("extract", h, d.length)
      }), c.push(await tt(e, s.title, d[h], h, d.length, n));
    t.setExtractProgress(r, { status: "merge", message: "合并节点与边…", steps: w("merge") });
    const l = J(c), o = `共 ${l.nodes.length} 个节点、${l.edges.length} 条边（${d.length} 段抽取）。`;
    t.applyExtractResult(r, l, o), t.setExtractProgress(r, { status: "done", message: o, steps: w("done") });
  } catch (s) {
    const d = s instanceof Error ? s.message : String(s);
    t.setExtractProgress(r, { status: "error", message: d, steps: w("error") }), t.markExtractDone(r);
    return;
  }
  t.markExtractDone(r);
}
function w(e, t = 0, r = 1) {
  const n = [
    ["chunk", "分段正文"],
    ["extract", "LLM 抽取"],
    ["merge", "合并图谱"],
    ["done", "完成"]
  ];
  return n.map(([s, d]) => {
    let c = "pending";
    return e === "error" && s === "extract" ? c = "error" : s === e ? c = "running" : (e === "done" || e === "merge" && s !== "done" || e === "extract" && (s === "chunk" || s === "extract")) && (s === "extract" && e === "extract" && t < r - 1 || s === e ? c = "running" : (n.findIndex((l) => l[0] === e) > n.findIndex((l) => l[0] === s) || e === "done") && (c = "done")), e === "chunk" && s === "chunk" && (c = "running"), e === "merge" && (s === "chunk" || s === "extract") && (c = "done"), e === "merge" && s === "merge" && (c = "running"), e === "done" && (c = "done"), { key: s, label: d, status: c };
  });
}
const N = "graph__";
function m(e, t = "") {
  return e != null ? String(e) : t;
}
function et(e, t) {
  const r = (n, s, d, c) => {
    e.tools.register(K({ name: n, description: s, parameters: d, execute: c }));
  };
  r(
    `${N}list_articles`,
    "列出智能图谱文稿",
    { query: { type: "string" } },
    (n) => t.listArticles(m(n.query))
  ), r(`${N}get_article`, "获取文稿正文与图谱", { id: { type: "string", required: !0 } }, (n) => {
    const s = t.getArticle(m(n.id));
    return { ...s, graph: L(JSON.parse(s.graph_json)) };
  }), r(
    `${N}create_article`,
    "新建文稿",
    { title: { type: "string" }, body_text: { type: "string" } },
    (n) => t.createArticle(m(n.title, "未命名文稿"), m(n.body_text))
  ), r(
    `${N}update_article`,
    "更新标题或正文",
    {
      id: { type: "string", required: !0 },
      title: { type: "string" },
      body_text: { type: "string" }
    },
    (n) => t.updateArticle(m(n.id), {
      title: n.title != null ? m(n.title) : void 0,
      body_text: n.body_text != null ? m(n.body_text) : void 0
    })
  ), r(`${N}delete_article`, "删除文稿", { id: { type: "string", required: !0 } }, (n) => (t.deleteArticle(m(n.id)), { ok: !0 })), r(
    `${N}save_article_graph`,
    "保存整图；先 get_article 取 graph_rev",
    {
      id: { type: "string", required: !0 },
      graph: { type: "json", required: !0 },
      graph_rev: { type: "integer", required: !0 }
    },
    (n) => t.saveGraph(m(n.id), n.graph, Number(n.graph_rev))
  ), r(
    `${N}build_from_article`,
    "对一篇文稿启动 LLM 知识图谱构建（异步）",
    { id: { type: "string", required: !0 } },
    async (n) => {
      const s = m(n.id);
      return G(e, t, s), { started: !0, articleId: s };
    }
  ), r(
    `${N}search_nodes`,
    "在文稿图谱中检索子图",
    { id: { type: "string", required: !0 }, query: { type: "string", required: !0 } },
    (n) => t.search(m(n.id), m(n.query))
  ), r(`${N}focus_article`, "设置工坊当前文稿", { id: { type: "string", required: !0 } }, (n) => (t.setFocusArticle(m(n.id)), t.getWorkshopState())), r(`${N}get_workshop_state`, "读取工坊焦点文稿", {}, () => t.getWorkshopState());
}
function E(e, t = 200) {
  return new Response(JSON.stringify(e), {
    status: t,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function T(e, t, r) {
  return E({ code: t, message: r }, e);
}
function A(e) {
  const t = typeof e == "object" && e !== null && "code" in e ? String(e.code) : "INTERNAL", r = e instanceof Error ? e.message : String(e);
  return T(t === "NOT_FOUND" ? 404 : t === "GRAPH_REV_CONFLICT" ? 409 : t === "INVALID_GRAPH" ? 400 : 500, t, r);
}
async function v(e) {
  const t = await e.text();
  return t.trim() ? JSON.parse(t) : {};
}
function I(e, t = "id") {
  return new URL(e.url).searchParams.get(t)?.trim() || void 0;
}
function rt(e, t) {
  const u = [
    ["/api/kg/articles", "GET", async (a) => {
      try {
        const i = new URL(a.url).searchParams.get("q") ?? "";
        return E({ articles: t.listArticles(i) });
      } catch (i) {
        return A(i);
      }
    }],
    ["/api/kg/article", "GET", async (a) => {
      const i = I(a);
      if (!i) return T(400, "INVALID_INPUT", "missing id");
      try {
        const g = t.getArticle(i);
        return E({
          article: {
            ...g,
            graph: L(JSON.parse(g.graph_json))
          }
        });
      } catch (g) {
        return A(g);
      }
    }],
    ["/api/kg/article/create", "POST", async (a) => {
      try {
        const i = await v(a), g = t.createArticle(String(i.title ?? "未命名文稿"), String(i.body_text ?? ""));
        return E({ article: g });
      } catch (i) {
        return A(i);
      }
    }],
    ["/api/kg/article/update", "POST", async (a) => {
      try {
        const i = await v(a), g = nt(i.id);
        if (!g) return T(400, "INVALID_INPUT", "missing id");
        const x = t.updateArticle(g, {
          title: i.title != null ? String(i.title) : void 0,
          body_text: i.body_text != null ? String(i.body_text) : void 0
        });
        return E({ article: x });
      } catch (i) {
        return A(i);
      }
    }],
    ["/api/kg/article/delete", "POST", async (a) => {
      try {
        const i = await v(a);
        return t.deleteArticle(String(i.id)), E({ ok: !0 });
      } catch (i) {
        return A(i);
      }
    }],
    ["/api/kg/graph/save", "POST", async (a) => {
      try {
        const i = await v(a), g = String(i.id ?? ""), x = Number(i.graph_rev);
        if (!g || !Number.isFinite(x)) return T(400, "INVALID_INPUT", "missing id or graph_rev");
        const P = t.saveGraph(g, i.graph, x);
        return E({ article: P });
      } catch (i) {
        return A(i);
      }
    }],
    ["/api/kg/graph/patch", "POST", async (a) => {
      try {
        const i = await v(a), g = String(i.id ?? ""), x = Number(i.graph_rev);
        if (!g || !Number.isFinite(x)) return T(400, "INVALID_INPUT", "missing id or graph_rev");
        const P = t.patchGraph(g, i, x);
        return E({ article: P });
      } catch (i) {
        return A(i);
      }
    }],
    ["/api/kg/search", "GET", async (a) => {
      const i = I(a, "articleId") ?? I(a, "id"), g = new URL(a.url).searchParams.get("q") ?? "";
      if (!i) return T(400, "INVALID_INPUT", "missing articleId");
      try {
        return E({ graph: t.search(i, g) });
      } catch (x) {
        return A(x);
      }
    }],
    ["/api/kg/extract/start", "POST", async (a) => {
      try {
        const i = await v(a), g = String(i.articleId ?? i.id ?? "");
        return g ? (t.getArticle(g), G(e, t, g), E({ started: !0, articleId: g })) : T(400, "INVALID_INPUT", "missing articleId");
      } catch (i) {
        return A(i);
      }
    }],
    ["/api/kg/extract/status", "GET", async (a) => {
      const i = I(a, "articleId") ?? I(a, "id");
      if (!i) return T(400, "INVALID_INPUT", "missing articleId");
      try {
        return E({ progress: t.getExtractProgress(i) });
      } catch (g) {
        return A(g);
      }
    }],
    ["/api/kg/workshop-state", "GET", async () => E(t.getWorkshopState())]
  ];
  for (const [a, i, g] of u) {
    const x = Array.isArray(i) ? i : [i];
    e.effect(
      () => e.connection.fetch.register({
        path: a,
        methods: x,
        requestBody: "buffered",
        fetch: g
      }),
      `knowledge-graph: ${a}`
    );
  }
}
function nt(e) {
  return e != null ? String(e) : "";
}
const lt = "knowledge-graph", gt = ["tools", "connection", "skills", "llm"];
function D() {
  const e = y.dirname($(import.meta.url));
  return y.basename(e) === "dist" ? y.dirname(e) : y.resolve(e, "../../bundle");
}
function st() {
  return [
    y.join(D(), "shared", "graph-schema", "default-schema.json"),
    y.resolve(D(), "..", "..", "shared/graph-schema/default-schema.json")
  ].find((t) => b.existsSync(t));
}
function it(e) {
  const t = y.join(D(), "skill", "SKILL.md");
  if (!b.existsSync(t)) {
    const r = y.resolve(y.dirname($(import.meta.url)), "../../bundle/skill/SKILL.md");
    if (!b.existsSync(r)) return;
    q(e, r);
    return;
  }
  q(e, t);
}
function q(e, t) {
  const r = b.readFileSync(t, "utf8"), n = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(r);
  if (!n?.[1]) return;
  const s = {};
  for (const l of n[1].split(/\r?\n/)) {
    const o = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(l);
    o?.[1] && o[2] !== void 0 && (s[o[1]] = o[2].trim().replace(/^['"]|['"]$/g, ""));
  }
  const d = s.name, c = s.description;
  !d || !c || e.effect(
    () => e.skills.register({
      name: d,
      description: c,
      content: r.slice(n[0].length).trim(),
      path: t,
      resourceBase: { kind: "directory", path: y.dirname(t) }
    }),
    "knowledge-graph: skill"
  );
}
async function pt(e, t = {}) {
  const r = t.dataDir?.trim() || y.join(process.env.DSH_PROFILE_DIR ?? process.cwd(), "kg-workshop"), n = t.schemaPath?.trim() || st(), s = new V(r, n);
  typeof e.provide == "function" && e.provide("kgLibrary", s), e.kgLibrary = s, et(e, s), rt(e, s), it(e), e.effect(() => () => {
    e.kgLibrary === s && (e.kgLibrary = void 0);
  }, "knowledge-graph: library handle");
}
export {
  pt as apply,
  gt as inject,
  lt as name
};
