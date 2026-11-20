/** Related nodes for one selected node. Empty relation means the caller supplies a label. */
export function relationsFor(graph, selectedId) {
  if (!selectedId) return []
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph?.edges) ? graph.edges : []
  return edges.flatMap((edge, index) => {
    const otherId = edge.source === selectedId ? edge.target : edge.target === selectedId ? edge.source : ''
    if (!otherId) return []
    const other = nodes.find((node) => node.id === otherId)
    return [{
      key: edge.id ?? `${edge.source}-${edge.target}-${index}`,
      otherId,
      name: other?.name || other?.label || otherId,
      relation: edge.label || edge.type || '',
    }]
  })
}

/** A pointer move past this distance is a drag, not a click. */
export function dragExceeded(startX, startY, x, y, threshold = 4) {
  const dx = x - startX
  const dy = y - startY
  return dx * dx + dy * dy > threshold * threshold
}
