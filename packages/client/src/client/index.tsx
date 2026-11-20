import type { ReactNode } from 'react'
import { KgWorkshopPanel } from './KgWorkshopPanel.js'
import { NS, dictionaries } from './locales.js'

const PANEL_ID = 'knowledge-graph'

export const inject = ['slots', 'locale']

type Translate = (key: string) => string

interface ClientContext {
  effect(callback: () => (() => void) | void, label?: string): void
  locale: {
    register(namespace: string, dict: Record<string, Record<string, string>>): () => void
    bind(namespace: string): Translate
  }
  slots: {
    inject(slot: string, callback: () => () => void): () => void
    register(
      options: { name: string; key?: string; id?: string; order?: number; label?: () => string; locale?: string },
      component: unknown,
    ): () => void
  }
}

function KgIcon({ size = 18 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8 7.5 10 16 M16 9.5 13.5 16 M8.2 7.2 15.5 8.5" />
    </svg>
  )
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'knowledge-graph: locale')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, KgWorkshopPanel))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 4,
    label: () => t('panel'),
    locale: NS,
  }, KgIcon))
}

export { KgWorkshopPanel } from './KgWorkshopPanel.js'
export { NS } from './locales.js'