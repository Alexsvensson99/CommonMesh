export type JsonSchema = {
  type: string
  description?: string
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: readonly string[]
  enum?: readonly (string | number | boolean | null)[]
  minimum?: number
  maximum?: number
  additionalProperties?: boolean
}

export type WebMCPToolAnnotations = {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
}

export type WebMCPExecutionContext = {
  signal: AbortSignal
}

export type WebMCPTool = {
  name: string
  title?: string
  description: string
  inputSchema: JsonSchema
  annotations?: WebMCPToolAnnotations
  execute: (
    input: unknown,
    context?: WebMCPExecutionContext,
  ) => unknown | Promise<unknown>
}

export type RegisteredWebMCPTool = Pick<
  WebMCPTool,
  'name' | 'title' | 'description' | 'inputSchema' | 'annotations'
>

export type WebMCPModelContext = EventTarget & {
  registerTool: (
    tool: WebMCPTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ) => void | Promise<void>
  getTools?: (options?: {
    fromOrigins?: string[]
  }) => Promise<RegisteredWebMCPTool[]>
  executeTool?: (
    tool: RegisteredWebMCPTool,
    input: string,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>
}

declare global {
  interface Document {
    modelContext?: WebMCPModelContext
  }
}
