# PPTist - Agent Action Guide

This guide provides an overview of the APIs, state management stores, and functions available in the PPTist codebase to interact with the presentation editor. It specifies which APIs are directly available and which require wrappers (e.g., executing within the Vue component context).

## 1. Current State of the Slide
**Directly Available API:** Yes, via Pinia Stores (`useSlidesStore`).

To get the current state of the slide (including elements, background, animations), you can access the Pinia `useSlidesStore`:

```typescript
import { useSlidesStore } from '@/store'
import { storeToRefs } from 'pinia'

// Inside a Vue component or wrapper:
const slidesStore = useSlidesStore()

// Access all slides
const allSlides = slidesStore.slides

// Get current slide index
const currentIndex = slidesStore.slideIndex

// Get current active slide object (with elements)
const currentSlide = slidesStore.currentSlide

// Get current slide's animations
const animations = slidesStore.currentSlideAnimations
```
*Note: Since Pinia stores are global, you can import and use `useSlidesStore()` anywhere once the app is mounted.*

## 2. Current Selection of the Slide
**Directly Available API:** Yes, via Pinia Stores (`useMainStore`).

To get information about what elements or slides the user has currently selected:

```typescript
import { useMainStore } from '@/store'

const mainStore = useMainStore()

// Array of currently selected element IDs
const activeElementIdList = mainStore.activeElementIdList

// If a single element is selected, this is its ID
const handleElementId = mainStore.handleElementId

// Getter returning the actual PPTElement objects currently selected
const activeElements = mainStore.activeElementList

// Getter returning the single actively manipulated PPTElement object
const handleElement = mainStore.handleElement

// Array of selected slide indices (in the left thumbnail pane)
const selectedSlidesIndex = mainStore.selectedSlidesIndex
```

## 3. Tracking User Actions
**Directly Available API:** Yes, via the `actionHistory` service (`src/services/actionHistory.ts`).

To track which actions the user has recently performed (e.g., selecting, moving, formatting, inserting elements), you can use the `getHistory` function. The system automatically records these actions using Pinia `$onAction` subscriptions.

```typescript
import { getHistory, recordAction } from '@/services/actionHistory'

// Retrieve the history buffer (array of the most recent user actions, most recent first)
const recentActions = getHistory()

/* 
Example of a UserAction object in the history array:
{
  type: 'update' | 'format' | 'move' | 'select' | 'insert' | 'delete' | 'align' | 'resize' | 'order',
  targetType: 'text' | 'image' | 'shape' | 'slide' | 'unknown' | etc.,
  targetId: 'element-id',
  timestamp: 1690000000000,
  details: { props: ['fill', 'width'] } // Optional metadata
}
*/

// You can also manually record a custom action if needed:
recordAction({
  type: 'format',
  targetType: 'text',
  targetId: 'custom-id',
  details: { customProp: 'value' }
})
```

## 4. Editing or Hiding Available Menu
**Directly Available API:** Yes, via `useMainStore`.

The visibility of context menus, floating menus, and toolbars is controlled entirely by the main store state.

```typescript
const mainStore = useMainStore()

// Toggle the floating "Bubble Menu" for rich text editing
mainStore.setBubbleMenuState(false) // Hide
mainStore.setBubbleMenuState(true)  // Show

// Change the state of the right-side Toolbar (e.g., styling vs. animations)
import { ToolbarStates } from '@/types/toolbar'
mainStore.setToolbarState(ToolbarStates.SLIDE_DESIGN)
mainStore.setToolbarState(ToolbarStates.MULTI_POSITION)
```

## 5. Showing an AI Menu in its Place
**Directly Available API:** Partial (Wrapper/Component Context Required).

PPTist has a dedicated AI Menu prediction hook (`src/hooks/useAiMenu.ts`) that listens to the `handleElement` (current selection) and fetches context-aware predicted actions.

To display an AI menu, you can toggle the state and use the `useAiMenu` composable inside a component:

```typescript
// 1. Update State to show AI Dialog/Menu
const mainStore = useMainStore()
mainStore.setAIPPTDialogState(true) 
// mainStore.aiMenuPredictions holds the top-5 predicted action IDs
// mainStore.aiMenuLoading indicates prediction in progress

// 2. Inside a Vue Component (Wrapper Required)
import { useAiMenu } from '@/hooks/useAiMenu'

export default {
  setup() {
    const { aiMenuPredictions, aiMenuLoading, getActionForId, retryPrediction } = useAiMenu()
    
    // To execute a predicted action:
    const actionId = aiMenuPredictions.value[0]
    const action = getActionForId(actionId)
    if (action && action.handler) {
      action.handler()
    }
  }
}
```

## 6. Showing a Preview of the Changed Components of the Slide
**Directly Available API:** Component available, needs wrapper to render.

To show a preview of a slide (or how it would look after changes), use the existing `<ThumbnailSlide>` Vue component. It renders a scaled, read-only version of a full slide object.

*Wrapper Required:* You must mount or use this component within a Vue template.

```vue
<!-- Wrapper Component to Preview a Slide -->
<template>
  <ThumbnailSlide 
    :slide="previewSlideObject" 
    :size="400" 
    :visible="true" 
  />
</template>

<script setup lang="ts">
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index.vue'
import type { Slide } from '@/types/slides'

// Construct your modified slide state
const previewSlideObject: Slide = {
  // ... current slide state + proposed modifications
}
</script>
```

For individual element previews, you can also use `<ThumbnailElement :elementInfo="element" />`.

## 7. Real-Time Action Triggers and Interception
**Directly Available API:** Yes, via `CommunicationTriggers.ts`.

To fire custom logic instantly when the user performs specific actions (like selecting an element, deleting a slide, or modifying shapes), the `CommunicationTriggers` class is used. It safely hooks into Pinia's `$onAction` and operates without polluting the global event bus.

**Relevant Files:**
- `src/services/CommunicationTriggers.ts`: PPTist's **`StateSupplier`** — watches the stores and emits debounced `CanvasState` snapshots to subscribers (it no longer does any HTTP itself).
- `src/App.vue`: Creates the suppliers and starts the SDK `McpBridgeClient` during `onMounted`.

```typescript
import { CommunicationTriggers } from '@/services/CommunicationTriggers'

const stateSupplier = new CommunicationTriggers()

// Starts intercepting user actions (e.g., setActiveElementIdList, updateElement)
stateSupplier.startWatching()

// Subscribe to debounced snapshots (the SDK bridge does this for you)
const off = stateSupplier.subscribe(snapshot => {
  // snapshot: { trigger, selection, slide (all elements + viewport), history (last 5) }
})
```
*Note: Emissions are debounced by 1.5s so dragging/resizing doesn't spam the AI.*

## 8. MCP Server & AI Action Integration
**Directly Available API:** Yes, via the `pptist-mcp-server` (`mcp-server/src/mcpServer.ts`).

The project runs an MCP server that provides AI agents direct access to the live PPTist editor context and allows pushing AI-predicted UI actions back into the editor.

**Server lifecycle (bootstrap → operational):**
1. **Bootstrap mode** — the server exposes only configuration tools: `ingest_client_specs`, `register_dynamic_tool`, `get_server_status`.
2. **Ingest** — the PPTist `SchemaSupplier` specs arrive via `POST /specs` (or the `ingest_client_specs` tool).
3. **Operational mode** — tools are generated from the specs (`mcp-server/src/dynamicTools.ts`): `send_ai_suggestions`, `execute_canvas_action`, `get_current_context`, `describe_client_capabilities`. The server emits `notifications/tools/list_changed` so the MCP client re-indexes. Command enums are built from the ingested action list.

**Key Components:**

### A. Live Context Resource (`pptist://context/live`)
Agents should **subscribe** to the `pptist://context/live` resource. Every time the user interacts with the editor (emitted by the `StateSupplier`), the server pushes an update notification. The payload contains:
- `currentSelection` (active elements)
- `currentSlide` (the entire slide layout)
- `recentActions` (last 5 commands executed)
- `insights` — merged output of the analyzer pipeline (see D)

### B. Sending AI Suggestions (`send_ai_suggestions` Tool)
Available after ingestion. Agents can push up to 5 predictions back to the frontend. Suggestions can be of two types:
1. **`action_sequence`**: Executes a sequence of smaller commands.
2. **`design_option`**: Complete state update of the slide elements.

`execute_canvas_action` (`command`, `args?`, `targetId?`) runs one command immediately: the server queues it, the SDK bridge polls `GET /commands`, runs it through the `ActionSupplier` and reports back via `POST /commands/result`. `register_dynamic_tool` can expose any single client command as its own named tool.

**Available Step Commands for `action_sequence`** (Handled in `src/services/stepExecutor.ts`):
- **Rich Text**: `bold`, `italic`, `underline`, `strikethrough`, `fontSizeUp`, `fontSizeDown`, `changeTextColor`
- **Text Alignment / Formatting**: `textAlignLeft`, `textAlignCenter`, `textAlignRight`, `setTextSize` (requires `size` arg)
- **Canvas Alignment**: `alignLeft`, `alignCenter`, `alignRight`, `alignTop`, `alignVertical`, `alignBottom`, `alignGroupLeft`
- **Layering**: `bringToFront`, `sendToBack`, `bringForward`, `sendBackward`
- **Common**: `duplicate`, `deleteEl`
- **Image**: `flipHorizontal`, `flipVertical`, `fitToSlide`
- **Chart**: `editChartData`
- **Table**: `insertTableRow`, `insertTableCol`, `deleteTableRow`, `deleteTableCol`
- **Store-Level Operations** (requires `args`):
  - `updateElement` (requires `id` and `props`)
  - `addElement` (requires full element data object)
  - `updateTextContent` (requires `text`)
  - `generateSubtitle` (requires `text`)

### C. Supplier SDK (`packages/sdk`, import as `@pptist/sdk`)
The host app plugs into the server by implementing three interfaces from `packages/sdk/src/suppliers.ts` and handing them to `McpBridgeClient` (no hand-written HTTP):
- `StateSupplier<T>` — `getSnapshot()` / `subscribe()`; PPTist: `CommunicationTriggers`.
- `ActionSupplier<A>` — `listActions()` / `execute(command, args, { targetId })`; PPTist: `createPPTistActionSupplier` (`src/services/pptistSuppliers.ts`, wraps `useStepExecutor`).
- `SchemaSupplier` — `getSpecs()` returning docs, JSON schemas, capabilities and actions; PPTist: `createPPTistSchemaSupplier`.

The frontend resolves the SDK via the `@pptist/sdk` alias (vite + `tsconfig.app.json`); the server consumes the built package (`file:../packages/sdk`, run `npm run build:sdk` in `mcp-server`).

### D. Analyzer Pipeline (`mcp-server/src/analyzers.ts`)
`AnalyzerPipeline` runs pluggable `ContextAnalyzer` modules (`mcp-server/src/analyzerModules/`) and merges results into `insights`:
- `alignment` (nearly-aligned pairs, default ≤5px), `contrast` (luminance vs white), `fontConsistency` — heuristics, on the selection.
- `mlLayout` — `insights.ml`: per-element role (title/body/media/decoration), slide `layoutClass` and `hierarchyIssues`, from bounding boxes. Uses `onnxruntime-node` with `mcp-server/models/layout-classifier.onnx` (or `PPTIST_ONNX_MODEL`); model contract: float32 `[N,8]` features → `[N,4]` logits. If weights are missing/invalid it falls back to a mock classifier (`ml.source: "mock"`).

Verify the whole loop with `npx tsx scripts/smoke-test.ts` in `mcp-server`.
