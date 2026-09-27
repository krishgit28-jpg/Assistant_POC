# OpenClaw × PPTist MCP Skill Guide

> **Purpose:** This document teaches OpenClaw (or any LLM MCP client) how to effectively use the PPTist MCP Bridge to act as a real-time design assistant. It covers the tool lifecycle, prediction strategies, and non-obvious tactics.

---

## 1. Connection Lifecycle — The Critical First 3 Steps

When you first connect to the PPTist MCP server, you **MUST** do these 3 things in order:

```
Step 1: Subscribe to pptist://context/live
Step 2: Wait for notifications (do NOT predict yet)
Step 3: On first notification → read resource → send predictions
```

> [!CAUTION]
> **Never call `send_predicted_actions` before you have received and read at least one context update.** You have zero information about what the user is doing until the first notification arrives. Sending blind predictions will confuse the user.

> [!IMPORTANT]
> **Subscribe ONCE.** Do not re-subscribe on every notification. The subscription is persistent for the lifetime of your connection. You will automatically receive `notifications/resources/updated` events whenever the user acts.

---

## 2. The Reactive Loop — How to Think About Timing

```
User clicks element
       ↓
You receive notification
       ↓
You read pptist://context/live
       ↓
You analyze context (see Section 4)
       ↓
You call send_predicted_actions with 5 predictions
       ↓
(wait for next notification — do NOT poll)
```

### Key Timing Rules

| Rule | Why |
|------|-----|
| **Always re-predict on every notification** | Old predictions are auto-cleared when new context arrives. The panel will be empty until you send fresh ones. |
| **Predict fast** | The user sees "Waiting for AI..." while you're thinking. Keep analysis tight — aim for < 2 seconds. |
| **Don't skip notifications** | Every notification means the user did something. Even if the context looks similar, the `triggerAction` or `recentActions` may have changed. |
| **Use `get_current_context` only for recovery** | If you missed a notification or need to re-sync, call this tool. For normal operation, rely on the subscription. |

---

## 3. Understanding the Context Payload

When you read `pptist://context/live`, you get 4 signals. Each one tells you something different:

### `triggerAction` — What the user JUST did
| Value | Meaning |
|-------|---------|
| `setActiveElementIdList` | User clicked/selected a different element |
| `updateElement` | User modified an element (resize, move, format) |
| `addElement` | User just inserted a new element |
| `deleteElement` | User just deleted an element |
| `addSlide` / `deleteSlide` | Slide-level operation |

**Tactic:** The trigger action tells you the user's *intent momentum*. If they just `updateElement`, they're in "editing mode" — predict more formatting/style actions. If they just `addElement`, they're in "building mode" — predict alignment and positioning.

### `currentSelection` — What is selected RIGHT NOW
Contains the element(s) the user has selected, including:
- `type` (text, image, shape, line, chart, table)
- Geometry (`width`, `height`, `left`, `top`)
- Content (first 60 chars of text, fill color)

**Tactic:** The element type determines which actions are valid. Don't predict text-formatting actions for an image. Don't predict `fitToSlide` for a text box.

### `currentSlide` — The environment around the selection
Contains:
- `id`, `background` (color or type)
- `elements[]` — ALL elements on the slide with their geometry, fill colors, and text content

**Tactic:** This is where spatial intelligence lives. Use this to detect:
- **Misalignment** — elements that should be aligned but aren't
- **Low contrast** — text color too close to background color
- **Overlapping** — elements stacked on top of each other
- **Inconsistency** — elements of the same type with different sizes/styles

### `recentActions` — The behavioral pattern (last 5 actions)
Each action has `type` (format, move, select, insert, delete, align, resize, order) and `targetType`.

**Tactic:** This is your strongest signal for prediction. Patterns:

| Recent Pattern | Likely Next Actions |
|---------------|-------------------|
| Multiple `format` on `text` | More text formatting (bold, italic, color, size) |
| `move` or `resize` actions | Alignment actions (center, align left/right) |
| `insert` followed by `select` | Duplicate, position, style the new element |
| `format` → `format` → `format` | User is in a formatting spree — predict remaining format options |
| `delete` actions | User is cleaning up — predict more delete, or alignment of remaining elements |
| `align` actions | More alignment in the perpendicular axis |

---

## 4. Prediction Strategy — The 5-Action Formula

You must send exactly 1–5 predictions, ordered by confidence. Here's a tactical framework for choosing them:

### Slot Allocation Strategy

| Slot | Purpose | Confidence Range |
|------|---------|-----------------|
| **#1** | Most obvious next action based on recent pattern | 0.85 – 0.95 |
| **#2** | Second most likely from the same category | 0.70 – 0.85 |
| **#3** | A "smart suggestion" the user might not think of (contrast fix, alignment) | 0.50 – 0.70 |
| **#4** | Cross-category action (if user is formatting, suggest an alignment) | 0.35 – 0.55 |
| **#5** | A "power-user" action or cleanup action | 0.20 – 0.40 |

> [!TIP]
> **Slot #3 is where you add the most value.** Slots #1 and #2 are things the user could find themselves. Slot #3 is where you show intelligence — detecting a contrast problem, noticing misaligned elements, or suggesting a multi-step fix.

### Confidence Scoring Heuristics

```
Base confidence = 0.3

+ 0.25  if the action matches the element type (text action for text element)
+ 0.20  if the action category matches recent history pattern
+ 0.15  if spatial/visual analysis supports it (misalignment, contrast issue)
+ 0.10  if the action is a natural "next step" in a workflow
- 0.20  if the action was JUST performed (user might be undoing it)
- 0.15  if the action doesn't apply to the selected element type
```

---

## 5. Smart Multi-Step Actions — Your Secret Weapon

The `steps` array lets you compose multi-step actions that the user executes with a single click. This is extremely powerful.

### Pattern: Compound Formatting
```json
{
  "actionId": "make-heading-style",
  "label": "Apply Heading Style",
  "description": "Bold, increase font size, and center the text",
  "confidence": 0.75,
  "steps": [
    { "command": "bold" },
    { "command": "fontSizeUp" },
    { "command": "fontSizeUp" },
    { "command": "alignCenter" }
  ]
}
```

### Pattern: Fix a Visual Problem
```json
{
  "actionId": "fix-low-contrast",
  "label": "Fix Low Contrast",
  "description": "Text is hard to read against the background — change to white",
  "confidence": 0.82,
  "steps": [
    { "command": "updateElement", "args": { "id": "elem-id-here", "props": { "defaultColor": "#ffffff" } } }
  ]
}
```

### Pattern: Quick Layout Fix
```json
{
  "actionId": "center-on-slide",
  "label": "Center on Slide",
  "description": "Center both horizontally and vertically",
  "confidence": 0.60,
  "steps": [
    { "command": "alignCenter" },
    { "command": "alignVertical" }
  ]
}
```

> [!TIP]
> When using `updateElement`, you MUST include the element's `id` from `currentSelection` or `currentSlide.elements`. Never guess an ID.

---

## 6. Anti-Patterns — What NOT To Do

### ❌ Don't predict what the user just did
If `recentActions[0]` is `{ type: "format", details: { props: ["defaultColor"] } }`, do NOT predict `changeTextColor`. They just did it — predicting it again would undo their work.

### ❌ Don't send the same predictions twice
If the context hasn't meaningfully changed (same element selected, same recent actions), consider whether your predictions would be different. If not, you can still send them — the panel needs content — but vary the ordering or include a new smart suggestion.

### ❌ Don't use `updateElement` without a real `id`
Every `updateElement` step MUST reference an actual element ID from the context payload. Never fabricate an ID.

### ❌ Don't ignore the element type
If a `line` element is selected, only these actions are valid: alignment, order, duplicate, delete. Do NOT predict text formatting for a line.

### ❌ Don't make all predictions the same category
If all 5 predictions are alignment actions, you're not being helpful. Mix categories: 2 from the likely category, 1 smart suggestion, 1 cross-category, 1 wildcard.

---

## 7. Available Commands Reference

### ACTION_CATALOGUE IDs (simple, no args needed)
| Command | Applies To | What It Does |
|---------|-----------|--------------|
| `bold` | text, shape | Toggle bold |
| `italic` | text, shape | Toggle italic |
| `underline` | text, shape | Toggle underline |
| `strikethrough` | text, shape | Toggle strikethrough |
| `fontSizeUp` | text, shape | Increase font size |
| `fontSizeDown` | text, shape | Decrease font size |
| `changeTextColor` | text, shape, table | Change text color (default red, or pass `args: { color: "#hex" }`) |
| `alignLeft` | any | Align to left edge of slide |
| `alignCenter` | any | Center horizontally on slide |
| `alignRight` | any | Align to right edge of slide |
| `alignTop` | any | Align to top of slide |
| `alignVertical` | any | Center vertically on slide |
| `alignBottom` | any | Align to bottom of slide |
| `bringToFront` | any | Bring to front layer |
| `sendToBack` | any | Send to back layer |
| `bringForward` | any | Move one layer forward |
| `sendBackward` | any | Move one layer backward |
| `duplicate` | any | Duplicate the element |
| `deleteEl` | any | Delete the element |
| `flipHorizontal` | image, shape | Flip horizontally |
| `flipVertical` | image, shape | Flip vertically |
| `fitToSlide` | image | Stretch image to fill slide |
| `editChartData` | chart | Open chart data editor |
| `insertTableRow` | table | Insert row below |
| `insertTableCol` | table | Insert column to the right |
| `deleteTableRow` | table | Delete selected row |
| `deleteTableCol` | table | Delete selected column |

### Store Methods (require `args`)
| Command | Args | What It Does |
|---------|------|--------------|
| `updateElement` | `{ id: string, props: { ... } }` | Update any property of an element |
| `addElement` | Element data object | Add a new element to the slide |

---

## 8. Spatial Intelligence Recipes

These are detection patterns you should run on every context update:

### Contrast Check
```
For each text element in currentSlide.elements:
  if element.defaultColor is similar to currentSlide.background:
    → Predict "Fix Low Contrast" with updateElement to change defaultColor
```

### Alignment Detection
```
If multiple elements exist:
  Group elements by approximate left/top/center positions
  If elements are close but not exactly aligned:
    → Predict alignment action for the selected element
```

### Size Consistency
```
If multiple elements of the same type exist:
  Compare their width/height
  If the selected element differs significantly:
    → Predict updateElement to match the most common size
```

### Off-Canvas Detection
```
If selected element's left + width > slide width, or top + height > slide height:
  → Predict alignment to bring it back on-screen
```

---

## 9. Example Full Prediction Response

Given context:
- User selected a text element ("PPTist Editor") at position (100, 100)
- Recent actions: `[select text, format text (defaultColor)]`
- Slide has dark blue background (#1a1a3e)
- Text color is currently #333333 (dark on dark = low contrast)

```json
{
  "predictions": [
    {
      "actionId": "fix-low-contrast",
      "label": "Fix Low Contrast",
      "description": "Text #333 on background #1a1a3e is nearly invisible — switch to white",
      "confidence": 0.92,
      "steps": [
        { "command": "updateElement", "args": { "id": "7stmVP", "props": { "defaultColor": "#ffffff" } } }
      ]
    },
    {
      "actionId": "bold",
      "label": "Bold Text",
      "description": "Make the title text bold for emphasis",
      "confidence": 0.78,
      "steps": [{ "command": "bold" }]
    },
    {
      "actionId": "center-on-slide",
      "label": "Center on Slide",
      "description": "Center the title horizontally and vertically",
      "confidence": 0.65,
      "steps": [
        { "command": "alignCenter" },
        { "command": "alignVertical" }
      ]
    },
    {
      "actionId": "fontSizeUp",
      "label": "Increase Font Size",
      "description": "Make the title larger for better visibility",
      "confidence": 0.52,
      "steps": [
        { "command": "fontSizeUp" },
        { "command": "fontSizeUp" }
      ]
    },
    {
      "actionId": "duplicate",
      "label": "Duplicate Element",
      "description": "Create a copy of this text element",
      "confidence": 0.30,
      "steps": [{ "command": "duplicate" }]
    }
  ]
}
```

Notice how **Slot #1** is the smart suggestion (contrast fix) — this is the kind of intelligence that makes the AI assistant truly useful.
