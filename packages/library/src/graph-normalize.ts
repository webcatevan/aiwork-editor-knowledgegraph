export type GraphNode = {
  id: string
  name?: string
  label?: string
  type?: string
  aliases?: string[]
  description?: string
  [key: string]: unknown
}

export type GraphEdge = {
  id?: string
  source: string
  target: string
  type?: string
  label?: string
  [key: string]: unknown
}

export type GraphDoc = { nodes: GraphNode[]; edges: GraphEdge[] }

function str(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function asId(v: unknown, fallback: string): string {
  const s = str(v)
  return s || fallback
}

/** Normalize arbitrary LLM / import payload into graph_json shape. */
export function normalizeGraphPayload(raw: unknown): GraphDoc {
  let data = raw
  if (typeof data === 'string') {
    data = JSON.parse(data) as unknown
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { nodes: [], edges: [] }
  }
  const record = data as Record<string, unknown>
  if (record.data && typeof record.data === 'object') {
    data = record.data
  }
  const bag = data as Record<string, unknown>
  const nodeList = Array.isArray(bag.nodes)
    ? bag.nodes
    : Array.isArray(bag.entities)
      ? bag.entities
      : []
  const edgeList = Array.isArray(bag.edges)
    ? bag.edges
    : Array.isArray(bag.relations)
      ? bag.relations
      : []

  const nodes: GraphNode[] = []
  const seen = new Set<string>()
  for (let i = 0; i < nodeList.length; i += 1) {
    const item = nodeList[i]
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = str(row.name) || str(row.label) || str(row.title) || `节点${i + 1}`
    const id = asId(row.id, `n_${i + 1}`)
    if (seen.has(id)) continue
    seen.add(id)
    nodes.push({
      ...row,
      id,
      name,
      label: str(row.label) || name,
      type: str(row.type) || 'concept',
    })
  }

  const idIndex = new Map(nodes.map((n) => [n.id, n]))
  const nameIndex = new Map(nodes.map((n) => [str(n.name).toLowerCase(), n.id]))

  const edges: GraphEdge[] = []
  for (let i = 0; i < edgeList.length; i += 1) {
    const item = edgeList[i]
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    let source = asId(row.source ?? row.from ?? row.head, '')
    let target = asId(row.target ?? row.to ?? row.tail, '')
    if (!idIndex.has(source)) {
      const mapped = nameIndex.get(source.toLowerCase())
      if (mapped) source = mapped
    }
    if (!idIndex.has(target)) {
      const mapped = nameIndex.get(target.toLowerCase())
      if (mapped) target = mapped
    }
    if (!source || !target || !idIndex.has(source) || !idIndex.has(target)) continue
    edges.push({
      ...row,
      id: asId(row.id, `e_${i + 1}`),
      source,
      target,
      type: str(row.type) || 'related_to',
      label: str(row.label) || str(row.type) || '相关',
    })
  }
  return { nodes, edges }
}

export function mergeGraphs(parts: GraphDoc[]): GraphDoc {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const byKey = new Map<string, string>()
  const mergeNode = (node: GraphNode): void => {
    const nameKey = str(node.name).toLowerCase()
    const existingId = byKey.get(nameKey)
    if (existingId) return
    byKey.set(nameKey, node.id)
    nodes.push(node)
  }
  for (const part of parts) {
    for (const node of part.nodes) mergeNode(node)
  }
  const idRemap = new Map<string, string>()
  for (const part of parts) {
    for (const node of part.nodes) {
      const canonical = byKey.get(str(node.name).toLowerCase()) ?? node.id
      idRemap.set(node.id, canonical)
    }
  }
  const edgeKeys = new Set<string>()
  for (const part of parts) {
    for (const edge of part.edges) {
      const source = idRemap.get(edge.source) ?? edge.source
      const target = idRemap.get(edge.target) ?? edge.target
      const key = `${source}\t${target}\t${edge.type ?? ''}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      edges.push({ ...edge, source, target })
    }
  }
  return { nodes, edges }
}

export function searchSubgraph(doc: GraphDoc, query: string, limit = 40): GraphDoc {
  const q = query.trim().toLowerCase()
  if (!q) return doc
  const hit = new Set<string>()
  for (const node of doc.nodes) {
    const hay = [
      node.name,
      node.label,
      node.description,
      ...(Array.isArray(node.aliases) ? node.aliases : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (hay.includes(q)) hit.add(node.id)
  }
  if (hit.size === 0) return { nodes: [], edges: [] }
  const edges = doc.edges.filter((e) => hit.has(e.source) || hit.has(e.target))
  for (const e of edges) {
    hit.add(e.source)
    hit.add(e.target)
  }
  const nodes = doc.nodes.filter((n) => hit.has(n.id)).slice(0, limit)
  const ids = new Set(nodes.map((n) => n.id))
  return {
    nodes,
    edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  }
}