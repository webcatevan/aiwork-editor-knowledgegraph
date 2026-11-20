#!/usr/bin/env node
import assert from 'node:assert/strict'
import { dragExceeded, relationsFor } from '../../client/src/client/relations.mjs'

const graph = {
  nodes: [
    { id: 'a', name: '甲' },
    { id: 'b', name: '乙' },
    { id: 'c', label: '丙' },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b', label: '导致' },
    { source: 'c', target: 'a', type: 'part_of' },
    { source: 'b', target: 'c', label: '位于' },
  ],
}

const related = relationsFor(graph, 'a')
assert.equal(related.length, 2)
assert.deepEqual(related.map((item) => item.name), ['乙', '丙'])
assert.deepEqual(related.map((item) => item.relation), ['导致', 'part_of'])
assert.equal(relationsFor(graph, '').length, 0)
assert.equal(relationsFor({ nodes: [], edges: [] }, 'a').length, 0)

assert.equal(dragExceeded(0, 0, 3, 0), false)
assert.equal(dragExceeded(0, 0, 5, 0), true)
assert.equal(dragExceeded(10, 10, 10, 14), false)

console.log('PASS canvas-model')
