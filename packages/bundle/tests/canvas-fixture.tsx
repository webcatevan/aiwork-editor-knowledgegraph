import { useState, type ReactNode } from 'react'
import { GraphCanvas } from '../../client/src/client/GraphCanvas.tsx'
import { relationsFor } from '../../client/src/client/relations.mjs'
import type { GraphDoc } from '../../client/src/client/api.ts'

export const sampleGraph: GraphDoc = {
  nodes: [
    { id: 'a', name: '甲' },
    { id: 'b', name: '乙' },
    { id: 'c', name: '丙' },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b', label: '导致' },
    { id: 'e2', source: 'a', target: 'c', type: 'part_of' },
  ],
}

export function CanvasFixture(): ReactNode {
  const [selectedId, setSelectedId] = useState('')
  const relations = relationsFor(sampleGraph, selectedId)
  return (
    <div>
      <GraphCanvas graph={sampleGraph} selectedId={selectedId} onSelect={setSelectedId} />
      <ul id="rels">
        {relations.map((item) => (
          <li key={item.key}>{item.relation} {item.name}</li>
        ))}
      </ul>
    </div>
  )
}
