/** @see aiwork-editor-harness/packages/library/src/tool-def.ts — copied for bundle isolation */
export interface ParameterSpec {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'array' | 'object' | 'json'
  description?: string
  title?: string
  default?: unknown
  examples?: unknown
  enum?: readonly unknown[]
  const?: unknown
  required?: true
  items?: ParameterSpec
  properties?: Record<string, ParameterSpec>
  additionalProperties?: boolean
  oneOf?: readonly ParameterSpec[]
}

export interface ToolDefinitionLike {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render: (args: unknown, value: unknown) => { type: 'text'; text: string }[]
  }
  execute: (args: unknown, exec?: unknown) => Promise<unknown>
}

function annotations(spec: ParameterSpec): Record<string, unknown> {
  const carried: Record<string, unknown> = {}
  if (spec.description !== undefined) carried.description = spec.description
  if (spec.title !== undefined) carried.title = spec.title
  if (spec.default !== undefined) carried.default = spec.default
  if (spec.examples !== undefined) carried.examples = spec.examples
  if (spec.enum !== undefined) carried.enum = spec.enum
  if (spec.const !== undefined) carried.const = spec.const
  return carried
}

export function toJsonSchema(spec: ParameterSpec): Record<string, unknown> {
  if (spec.type === 'json') return annotations(spec)
  if (spec.oneOf !== undefined) return { ...annotations(spec), oneOf: spec.oneOf.map(toJsonSchema) }
  if (spec.type === 'object') {
    const node: Record<string, unknown> = {
      type: 'object',
      additionalProperties: spec.additionalProperties ?? false,
      ...annotations(spec),
    }
    if (spec.properties !== undefined) {
      const required = Object.entries(spec.properties)
        .filter(([, property]) => property.required === true)
        .map(([name]) => name)
      node.properties = Object.fromEntries(
        Object.entries(spec.properties).map(([name, property]) => [name, toJsonSchema(property)]),
      )
      if (required.length > 0) node.required = required
    }
    return node
  }
  if (spec.type === 'array') {
    return {
      ...(spec.items === undefined ? {} : { items: toJsonSchema(spec.items) }),
      type: 'array',
      ...annotations(spec),
    }
  }
  return { ...(spec.type === undefined ? {} : { type: spec.type }), ...annotations(spec) }
}

export function parameterRoot(parameters: Record<string, ParameterSpec>): Record<string, unknown> {
  const required = Object.entries(parameters)
    .filter(([, property]) => property.required === true)
    .map(([name]) => name)
  const root: Record<string, unknown> = {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(parameters).map(([name, property]) => [name, toJsonSchema(property)]),
    ),
  }
  if (required.length > 0) root.required = required
  return root
}

function renderJson(value: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value ?? null, null, 2) }]
}

export function defineJsonTool(spec: {
  name: string
  description: string
  parameters: Record<string, ParameterSpec>
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>
}): ToolDefinitionLike {
  return {
    name: spec.name,
    description: spec.description,
    parameters: parameterRoot(spec.parameters),
    output: { schema: {}, render: (_args, value) => renderJson(value) },
    execute: async (args: unknown) => spec.execute((args ?? {}) as Record<string, unknown>),
  }
}