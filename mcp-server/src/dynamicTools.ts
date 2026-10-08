/**
 * DynamicToolManager — owns the MCP tool surface across the server lifecycle.
 *
 *   bootstrap mode    : only configuration tools exist
 *                       (ingest_client_specs, register_dynamic_tool, get_server_status)
 *   operational mode  : after specs are ingested, the higher-level tools are generated
 *                       from them (send_ai_suggestions, execute_canvas_action,
 *                       get_current_context, describe_client_capabilities) and the
 *                       server emits `notifications/tools/list_changed` so clients
 *                       (OpenClaw) re-index.
 */

import { z } from 'zod'
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ClientSpecs } from '@pptist/sdk'
import { ClientSpecsSchema, getClientSpecs, getSpecsStatus, setClientSpecs } from './clientSpecs.js'
import { enqueueCommand } from './commandQueue.js'
import { buildLiveContext } from './contextView.js'
import { getStoreStatus, updateSuggestions } from './stateStore.js'

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

const BOOTSTRAP_TOOLS = ['ingest_client_specs', 'register_dynamic_tool', 'get_server_status'] as const

function text(value: unknown, pretty = false): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, pretty ? 2 : undefined) }] }
}

function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true }
}

const ArgSpecSchema = z.object({
  type: z.enum(['string', 'number', 'boolean']),
  description: z.string().optional(),
  optional: z.boolean().optional(),
})

export class DynamicToolManager {
  private generated = new Map<string, RegisteredTool>()
  private custom = new Map<string, { tool: RegisteredTool; command: string }>()

  constructor(private readonly server: McpServer) {}

  // ── Bootstrap mode ─────────────────────────────────────────────────────────

  registerBootstrapTools(): void {
    this.server.registerTool(
      'ingest_client_specs',
      {
        description:
          'BOOTSTRAP: Ingest the host app\'s specs (documentation, JSON schemas, capabilities, actions) and generate the operational tools from them. '
          + 'Normally the PPTist client pushes its specs automatically; pass `specs` to ingest them manually, or omit it to re-generate tools from the last ingested specs.',
        inputSchema: { specs: ClientSpecsSchema.optional().describe('Client specs to ingest (optional)') },
      },
      async ({ specs }): Promise<ToolResult> => {
        const toIngest = (specs as ClientSpecs | undefined) ?? getClientSpecs()
        if (!toIngest) return fail('No specs provided and none ingested yet. Waiting for the PPTist client to connect.')
        const result = this.ingest(toIngest)
        return text({ success: true, ...result })
      },
    )

    this.server.registerTool(
      'register_dynamic_tool',
      {
        description:
          'BOOTSTRAP: Register an extra tool that runs one client action. The tool enqueues `command` on the PPTist client with the given arguments. '
          + 'Example: name="center_selection", command="alignCenter".',
        inputSchema: {
          name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).describe('Tool name (letters, digits, underscore)'),
          description: z.string().describe('What the tool does'),
          command: z.string().describe('Client action id to execute (must exist in the ingested specs once ingested)'),
          args_schema: z.record(ArgSpecSchema).optional().describe('Argument spec: { argName: { type, description?, optional? } }'),
        },
      },
      async ({ name, description, command, args_schema }): Promise<ToolResult> => {
        const err = this.registerCustomTool(name, description, command, args_schema)
        return err ? fail(err) : text({ success: true, tool: name, command })
      },
    )

    this.server.registerTool(
      'get_server_status',
      { description: 'Check server mode (bootstrap/operational), client connection and ingestion status.' },
      async (): Promise<ToolResult> => {
        const status = getStoreStatus()
        return text({
          ...getSpecsStatus(),
          connected: status.hasData,
          lastUpdated: status.lastUpdated ? new Date(status.lastUpdated).toISOString() : null,
          totalUpdates: status.updateCount,
          generatedTools: [...this.generated.keys()],
          customTools: [...this.custom.keys()],
        }, true)
      },
    )
  }

  // ── Dynamic transition ─────────────────────────────────────────────────────

  /** Ingest specs, (re)generate operational tools and notify the client. */
  ingest(specs: ClientSpecs): { mode: string; tools: string[] } {
    setClientSpecs(specs)

    // Drop previously generated tools (re-ingest after a client reload / change).
    for (const tool of this.generated.values()) tool.remove()
    this.generated.clear()

    this.generateOperationalTools(specs)

    // Custom tools must still point at a command the (new) client actually exposes.
    const valid = new Set(specs.actions.map(a => a.id))
    for (const [name, entry] of [...this.custom]) {
      if (!valid.has(entry.command)) {
        entry.tool.remove()
        this.custom.delete(name)
        console.error(`[MCP] Removed dynamic tool "${name}" — command "${entry.command}" no longer exists`)
      }
    }

    this.server.sendToolListChanged()
    const tools = [...BOOTSTRAP_TOOLS, ...this.generated.keys(), ...this.custom.keys()]
    console.error(`[MCP] Ingested specs for ${specs.appName}@${specs.appVersion} — operational tools ready: ${[...this.generated.keys()].join(', ')}`)
    console.error('[MCP] Emitted notifications/tools/list_changed')
    return { mode: 'operational', tools }
  }

  private add(name: string, tool: RegisteredTool): void {
    this.generated.set(name, tool)
  }

  private generateOperationalTools(specs: ClientSpecs): void {
    const ids = specs.actions.map(a => a.id)
    const commandSchema: z.ZodTypeAny = ids.length > 0
      ? z.enum(ids as [string, ...string[]])
      : z.string()
    const actionCatalogue = specs.actions
      .map(a => `  - ${a.id}: ${a.description}${a.argsSchema ? ' (args: ' + JSON.stringify(a.argsSchema) + ')' : ''}`)
      .join('\n')
    const docs = `${specs.appName} ${specs.appVersion}. ${specs.documentation}`

    // get_current_context
    this.add('get_current_context', this.server.registerTool(
      'get_current_context',
      {
        description: 'Get the live editor context on demand (selection, slide, recent actions, merged heuristic + ML insights). For continuous updates subscribe to the pptist://context/live resource instead.',
      },
      async (): Promise<ToolResult> => {
        const ctx = await buildLiveContext()
        return ctx ? text(ctx, true) : fail('No context available yet.')
      },
    ))

    // describe_client_capabilities
    this.add('describe_client_capabilities', this.server.registerTool(
      'describe_client_capabilities',
      { description: `Return the full specs ingested from the client: documentation, JSON schemas, capabilities and actions. ${docs}` },
      async (): Promise<ToolResult> => text(getClientSpecs(), true),
    ))

    // send_ai_suggestions
    this.add('send_ai_suggestions', this.server.registerTool(
      'send_ai_suggestions',
      {
        description:
          `Push up to 5 AI suggestions back to the ${specs.appName} frontend.\n`
          + 'Each suggestion is either a sequence of commands (type: \'action_sequence\') '
          + 'or a full element state update (type: \'design_option\') for major overhauls.\n\n'
          + `${docs}\n\nAVAILABLE STEP COMMANDS:\n${actionCatalogue}`,
        inputSchema: {
          suggestions: z.array(
            z.object({
              id: z.string().describe('Unique identifier for this suggestion'),
              type: z.enum(['action_sequence', 'design_option']).describe('The type of this suggestion'),
              label: z.string().describe('Human-readable button label (e.g., "Bold Text", "Modern Dark Theme")'),
              description: z.string().describe('Short description for tooltip'),
              confidence: z.number().min(0).max(1).describe('Confidence score between 0.0 and 1.0'),
              steps: z.array(
                z.object({
                  command: commandSchema.describe('Action id to execute'),
                  args: z.record(z.unknown()).optional().describe('Optional arguments for the command'),
                }),
              ).optional().describe('Sequence of commands (required if type is action_sequence)'),
              updatedElements: z.array(
                z.object({
                  id: z.string().describe('Target element ID to update'),
                  props: z.record(z.unknown()).describe('The full set of updated properties to apply to this element'),
                }),
              ).optional().describe('Element state updates (required if type is design_option)'),
            }),
          ).min(1).max(5).describe('Array of 1–5 suggestions, ordered by confidence (highest first)'),
        },
      },
      async ({ suggestions }): Promise<ToolResult> => {
        const sorted = [...suggestions].sort((a, b) => b.confidence - a.confidence)
        updateSuggestions(sorted as Parameters<typeof updateSuggestions>[0])

        console.error(`[MCP] Stored ${sorted.length} AI suggestions:`)
        for (const p of sorted) {
          console.error(`  → ${p.id} [${p.type}] (${(p.confidence * 100).toFixed(0)}%) "${p.label}"`)
        }
        return text({
          success: true,
          message: `${sorted.length} suggestions stored and available to the frontend.`,
          suggestionIds: sorted.map(p => p.id),
        })
      },
    ))

    // execute_canvas_action
    this.add('execute_canvas_action', this.server.registerTool(
      'execute_canvas_action',
      {
        description:
          `Execute one action immediately on the live ${specs.appName} canvas through the client's ActionSupplier.\n\n`
          + `${docs}\n\nAVAILABLE COMMANDS:\n${actionCatalogue}`,
        inputSchema: {
          command: commandSchema.describe('Action id to execute'),
          args: z.record(z.unknown()).optional().describe('Optional command arguments'),
          targetId: z.string().optional().describe('Element id to select before executing'),
        },
      },
      async ({ command, args, targetId }): Promise<ToolResult> => {
        const result = await enqueueCommand(command as string, args as Record<string, unknown> | undefined, targetId as string | undefined)
        return result.ok ? text({ success: true, command }) : fail(result.error ?? 'Action failed')
      },
    ))
  }

  // ── register_dynamic_tool ──────────────────────────────────────────────────

  private registerCustomTool(
    name: string,
    description: string,
    command: string,
    argSpec?: Record<string, z.infer<typeof ArgSpecSchema>>,
  ): string | null {
    if ((BOOTSTRAP_TOOLS as readonly string[]).includes(name) || this.generated.has(name)) {
      return `Tool name "${name}" is reserved.`
    }
    const specs = getClientSpecs()
    if (specs && !specs.actions.some(a => a.id === command)) {
      return `Unknown command "${command}". Known commands: ${specs.actions.map(a => a.id).join(', ')}`
    }

    this.custom.get(name)?.tool.remove()

    const shape: z.ZodRawShape = {}
    for (const [key, spec] of Object.entries(argSpec ?? {})) {
      let field: z.ZodTypeAny = spec.type === 'number' ? z.number() : spec.type === 'boolean' ? z.boolean() : z.string()
      if (spec.description) field = field.describe(spec.description)
      shape[key] = spec.optional ? field.optional() : field
    }

    const tool = this.server.registerTool(
      name,
      { description, inputSchema: shape },
      async (args: Record<string, unknown>): Promise<ToolResult> => {
        const result = await enqueueCommand(command, Object.keys(args).length ? args : undefined)
        return result.ok ? text({ success: true, command }) : fail(result.error ?? 'Action failed')
      },
    )
    this.custom.set(name, { tool, command })
    console.error(`[MCP] Registered dynamic tool "${name}" → ${command}`)
    return null
  }
}
