import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { GraphDoc } from './api.js'
import { dragExceeded } from './relations.mjs'

const SIZE = 480

type Point = { x: number; y: number }

type Drag = {
  id: string
  offsetX: number
  offsetY: number
  startX: number
  startY: number
  moved: boolean
}

function layoutCircle(nodes: GraphDoc['nodes']): Map<string, Point> {
  const map = new Map<string, Point>()
  const cx = SIZE / 2
  const cy = SIZE / 2
  const r = SIZE * 0.38
  nodes.forEach((node, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2
    map.set(node.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  })
  return map
}

function svgPoint(svg: SVGSVGElement, event: { clientX: number; clientY: number }): Point {
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const local = point.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function GraphCanvas({
  graph,
  selectedId,
  onSelect,
}: {
  graph: GraphDoc
  selectedId: string
  onSelect: (id: string) => void
}): ReactNode {
  const layoutKey = graph.nodes.map((node) => node.id).join('\0')
  const layoutKeyRef = useRef(layoutKey)
  const [pos, setPos] = useState<Map<string, Point>>(() => layoutCircle(graph.nodes))
  let positions = pos
  if (layoutKeyRef.current !== layoutKey) {
    layoutKeyRef.current = layoutKey
    positions = layoutCircle(graph.nodes)
    setPos(positions)
  }
  const dragRef = useRef<Drag | null>(null)
  const related = new Set<string>()
  if (selectedId) {
    for (const edge of graph.edges) {
      if (edge.source === selectedId) related.add(edge.target)
      else if (edge.target === selectedId) related.add(edge.source)
    }
  }

  if (graph.nodes.length === 0) {
    return <div className="kg-graph-empty">—</div>
  }

  const onPointerDown = (event: ReactPointerEvent<SVGGElement>, id: string) => {
    const svg = event.currentTarget.ownerSVGElement
    const current = positions.get(id)
    if (!svg || !current) return
    const point = svgPoint(svg, event)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      id,
      offsetX: point.x - current.x,
      offsetY: point.y - current.y,
      startX: point.x,
      startY: point.y,
      moved: false,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = dragRef.current
    const svg = event.currentTarget.ownerSVGElement
    if (!drag || !svg) return
    const point = svgPoint(svg, event)
    if (dragExceeded(drag.startX, drag.startY, point.x, point.y)) drag.moved = true
    const x = clamp(point.x - drag.offsetX, 28, SIZE - 28)
    const y = clamp(point.y - drag.offsetY, 28, SIZE - 40)
    setPos((prev) => {
      const next = new Map(prev)
      next.set(drag.id, { x, y })
      return next
    })
  }

  const onPointerUp = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag && !drag.moved) onSelect(drag.id)
  }

  return (
    <svg className="kg-graph-svg" width="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {graph.edges.map((edge, i) => {
        const a = positions.get(edge.source)
        const b = positions.get(edge.target)
        if (!a || !b) return null
        const active = edge.source === selectedId || edge.target === selectedId
        return (
          <g key={edge.id ?? `e-${i}`}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={active ? 'var(--dsw-alias-primary, #2563eb)' : 'var(--dsw-alias-border-2, #94a3b8)'}
              strokeWidth={active ? 2 : 1.2}
            />
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} fontSize={9} fill="var(--dsw-alias-text-3, #64748b)">
              {(edge.label ?? edge.type ?? '').slice(0, 8)}
            </text>
          </g>
        )
      })}
      {graph.nodes.map((node) => {
        const p = positions.get(node.id)
        if (!p) return null
        const active = node.id === selectedId
        const neighbor = related.has(node.id)
        return (
          <g
            key={node.id}
            className="kg-node"
            onPointerDown={(event) => onPointerDown(event, node.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r={active ? 22 : 18}
              fill={active ? 'var(--dsw-alias-primary, #2563eb)' : neighbor ? 'var(--dsw-alias-bg-3, #dbeafe)' : 'var(--dsw-alias-bg-2, #e2e8f0)'}
              stroke={active || neighbor ? 'var(--dsw-alias-primary, #2563eb)' : 'var(--dsw-alias-border-1, #cbd5e1)'}
              strokeWidth={active ? 2 : 1}
            />
            <text
              x={p.x}
              y={p.y + 32}
              textAnchor="middle"
              fontSize={11}
              fill="var(--dsw-alias-text-1, #0f172a)"
            >
              {(node.name ?? node.label ?? node.id).slice(0, 10)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
