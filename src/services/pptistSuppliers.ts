/**
 * PPTist implementations of the SDK's ActionSupplier and SchemaSupplier.
 *
 * (The StateSupplier is `CommunicationTriggers`.) Together they let the SDK's
 * `McpBridgeClient` expose PPTist to the MCP server without any raw HTTP code here.
 */

import { useMainStore } from '@/store'
import { ACTION_CATALOGUE } from '@/services/actionRegistry'
import type { useStepExecutor } from '@/services/stepExecutor'
import type {
  ActionDescriptor,
  ActionSupplier,
  ClientSpecs,
  JsonSchema,
  SchemaSupplier,
} from '@pptist/sdk'

type StepExecutor = ReturnType<typeof useStepExecutor>

/** Store-level commands that take arguments (not part of ACTION_CATALOGUE). */
const STORE_LEVEL_ACTIONS: ActionDescriptor[] = [
  {
    id: 'updateElement',
    label: 'Update Element',
    description: 'Patch properties of an element by id (e.g. fill, left, top, width, height, defaultColor).',
    applicableTo: ['any'],
    argsSchema: {
      type: 'object',
      required: ['id', 'props'],
      properties: {
        id: { type: 'string', description: 'Element id' },
        props: { type: 'object', description: 'Element properties to overwrite' },
      },
    },
  },
  {
    id: 'addElement',
    label: 'Add Element',
    description: 'Add a new element; args is the full element object (id, type, left, top, width, height, ...).',
    applicableTo: ['any'],
    argsSchema: { type: 'object', description: 'A complete PPTist element' },
  },
  {
    id: 'updateTextContent',
    label: 'Update Text',
    description: 'Replace the HTML/text content of the selected text element.',
    applicableTo: ['text'],
    argsSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
  },
  {
    id: 'generateSubtitle',
    label: 'Add Subtitle',
    description: 'Insert a new subtitle text element.',
    applicableTo: ['text'],
    argsSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
  },
  {
    id: 'alignGroupLeft',
    label: 'Align Group Left',
    description: 'Align the active selection (group) to its left-most element.',
    applicableTo: ['any'],
  },
]

function describeActions(executor: StepExecutor): ActionDescriptor[] {
  const known = new Set(Object.keys(executor.commandMap))

  const catalogue: ActionDescriptor[] = ACTION_CATALOGUE
    .filter(a => known.has(a.id))
    .map(a => ({
      id: a.id,
      label: a.label,
      description: a.description,
      applicableTo: a.applicableTo as string[],
      ...(a.id === 'changeTextColor'
        ? { argsSchema: { type: 'object', properties: { color: { type: 'string', description: 'CSS color, e.g. #e2534d' } } } }
        : {}),
    }))

  const seen = new Set(catalogue.map(a => a.id))
  return [...catalogue, ...STORE_LEVEL_ACTIONS.filter(a => known.has(a.id) && !seen.has(a.id))]
}

/** Wraps the step executor as an ActionSupplier (no UI framework leaks out). */
export function createPPTistActionSupplier(executor: StepExecutor): ActionSupplier {
  return {
    listActions: () => describeActions(executor),

    execute(command, args, options) {
      if (!(command in executor.commandMap)) {
        return { ok: false, error: `Unknown command "${command}"` }
      }

      if (options?.targetId) {
        useMainStore().setActiveElementIdList([options.targetId])
      }

      const ok = executor.executeSteps([{ command, args }], `mcp:${command}`)
      return ok ? { ok: true } : { ok: false, error: `Command "${command}" failed to execute` }
    },
  }
}

const ELEMENT_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['id', 'type', 'left', 'top', 'width', 'height'],
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: ['text', 'image', 'shape', 'line', 'chart', 'table', 'latex', 'video', 'audio'] },
    left: { type: 'number', description: 'px from the left edge of the canvas' },
    top: { type: 'number', description: 'px from the top edge of the canvas' },
    width: { type: 'number' },
    height: { type: 'number' },
    fill: { type: 'string', description: 'Fill color' },
    content: { type: 'string', description: 'Plain text (truncated), text elements only' },
    defaultColor: { type: 'string', description: 'Text color, text elements only' },
    defaultFontName: { type: 'string' },
    defaultSize: { type: 'string' },
  },
}

/** Describes PPTist (docs, JSON schemas, capabilities) for the server's tool generation. */
export function createPPTistSchemaSupplier(actions: ActionSupplier): SchemaSupplier {
  return {
    getSpecs(): ClientSpecs {
      return {
        appName: 'PPTist',
        appVersion: '2.0.0',
        documentation:
          'PPTist is a browser-based slide editor. The canvas is a fixed viewport (default 1000 x 562.5 px, origin top-left); '
          + 'all element geometry is in canvas px. Commands act on the currently selected element(s) unless a targetId is given. '
          + 'Suggestions are either an `action_sequence` of commands or a `design_option` with full element property updates.',
        capabilities: [
          'state.push',
          'actions.execute',
          'suggestions.action_sequence',
          'suggestions.design_option',
        ],
        schemas: {
          element: ELEMENT_SCHEMA,
          slide: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              background: { type: 'string' },
              viewport: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
              elements: { type: 'array', items: ELEMENT_SCHEMA },
            },
          },
        },
        actions: actions.listActions(),
      }
    },
  }
}
