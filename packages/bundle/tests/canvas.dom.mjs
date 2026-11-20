#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const bundleRoot = join(here, '..')
const clientRoot = join(bundleRoot, '..', 'client')
const editorDeps = process.env.DSH_EDITOR_DEPS ?? '/Users/wenpu/projects/zhiyuan/new/aiwork/aiwork-editor'
const requireClient = createRequire(join(clientRoot, 'package.json'))
const requireEditor = createRequire(join(editorDeps, 'package.json'))
const { JSDOM } = requireEditor('jsdom')
const React = requireClient('react')
const { createRoot } = requireClient('react-dom/client')
const { act } = React

const bundled = await build({
  absWorkingDir: bundleRoot,
  entryPoints: [join(here, 'canvas-fixture.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
})
const source = bundled.outputFiles[0].text
const module = { exports: {} }
const localRequire = createRequire(join(clientRoot, 'package.json'))
new Function('exports', 'require', 'module', source)(module.exports, localRequire, module)
const { CanvasFixture } = module.exports

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://local/' })
const { window } = dom
globalThis.window = window
globalThis.document = window.document
globalThis.SVGSVGElement = window.SVGSVGElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true

window.SVGSVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) })
window.SVGSVGElement.prototype.createSVGPoint = () => {
  const point = {
    x: 0,
    y: 0,
    matrixTransform() {
      return { x: this.x, y: this.y }
    },
  }
  return point
}
window.Element.prototype.setPointerCapture = () => {}
window.Element.prototype.releasePointerCapture = () => {}
window.Element.prototype.hasPointerCapture = () => true
if (typeof window.PointerEvent !== 'function') {
  window.PointerEvent = class PointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
    }
  }
}

const root = createRoot(window.document.getElementById('root'))
await act(async () => {
  root.render(React.createElement(CanvasFixture))
})

const nodes = [...window.document.querySelectorAll('.kg-node')]
assert.equal(nodes.length, 3, 'three nodes render')

function pointer(target, type, x, y) {
  target.dispatchEvent(new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    clientX: x,
    clientY: y,
  }))
}

await act(async () => {
  pointer(nodes[0], 'pointerdown', 10, 10)
  pointer(nodes[0], 'pointerup', 10, 10)
})
const relText = window.document.getElementById('rels').textContent
assert.match(relText, /导致/)
assert.match(relText, /乙/)
assert.match(relText, /part_of/)
assert.match(relText, /丙/)

const circle = nodes[0].querySelector('circle')
const before = Number(circle.getAttribute('cx'))
await act(async () => {
  pointer(nodes[0], 'pointerdown', before, Number(circle.getAttribute('cy')))
  pointer(nodes[0], 'pointermove', 80, 90)
  pointer(nodes[0], 'pointerup', 80, 90)
})
const after = Number(window.document.querySelectorAll('.kg-node circle')[0].getAttribute('cx'))
assert.notEqual(after, before, 'drag moves the node')
assert.equal(window.document.getElementById('rels').textContent.includes('导致'), true)

console.log('PASS canvas.dom')
await act(async () => {
  root.unmount()
})
window.close()
process.exit(0)
