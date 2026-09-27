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
> **Never call `send_predicted_actions` before you have received and read at least one context update.** You have zero information about what the user is doing until the first notification arrives.

> [!IMPORTANT]
> **Subscribe ONCE.** Do not re-subscribe on every notification. The subscription is persistent. You will automatically receive `notifications/resources/updated` events whenever the user acts. Note: The frontend uses a 1.5s debounce, meaning you won't be spammed while the user is dragging something. You will only get notified when they finish moving.

---

## 2. The Reactive Loop — How to Think About Timing

```
User finishes interacting (1.5s debounce)
       ↓
You receive notification
       ↓
You read pptist://context/live
       ↓
You analyze context + insights (see Section 4)
       ↓
You call send_predicted_actions with 5 predictions
```

---

## 3. Understanding the Context Payload

When you read `pptist://context/live`, you get 5 signals. 

### `triggerAction` — What the user JUST did
Tells you the user's *intent momentum*. (e.g. `updateElement` means they are styling/editing, `addElement` means they are building).

### `currentSelection` — What is selected RIGHT NOW
Contains the element(s) the user has selected. Type determines valid actions.

### `currentSlide` — The environment around the selection
Contains `id`, `background`, and `elements[]` (ALL elements on the slide).

### `recentActions` — The behavioral pattern (last 5 actions)
Your strongest signal for prediction. If they just did 3 text formatting actions, predict more text formatting!

### `insights` (NEW) — Pre-Calculated AI Intelligence
The MCP server automatically calculates complex geometric and color math for you!
* `alignmentIssues`: Tells you if elements are off-center or misaligned by a few pixels.
* `contrastIssues`: Tells you if text color clashes with the slide background (low luminance difference).
* `fontConsistency`: Tells you if the slide is using too many different fonts or sizes.

**Tactic:** If `insights` contains an issue that applies to the `currentSelection`, your **#1 prediction** should be a multi-step action that fixes it!

---

## 4. Prediction Strategy — The 5-Action Formula

You must send exactly 1–5 predictions, ordered by confidence. Here's a tactical framework:

| Slot | Purpose | Confidence Range |
|------|---------|-----------------|
| **#1** | Most obvious next action based on recent pattern OR fixing an `insight` issue | 0.85 – 0.95 |
| **#2** | Second most likely from the same category | 0.70 – 0.85 |
| **#3** | A "smart suggestion" the user might not think of | 0.50 – 0.70 |
| **#4** | Cross-category action (if user is formatting, suggest an alignment) | 0.35 – 0.55 |
| **#5** | A "power-user" action or cleanup action | 0.20 – 0.40 |

---

## 5. Smart Multi-Step Actions — Your Secret Weapon

The `steps` array lets you compose multi-step actions that the user executes with a single click.

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

### Pattern: Fix an Insight Issue (Contrast)
```json
{
  "actionId": "fix-low-contrast",
  "label": "Fix Low Contrast",
  "description": "Text is hard to read against the background — change to white",
  "confidence": 0.92,
  "steps": [
    { "command": "updateElement", "args": { "id": "elem-id-here", "props": { "defaultColor": "#ffffff" } } }
  ]
}
```

---

## 6. Strict Valid Commands (Enum)

The `command` property is heavily strictly validated by a Zod schema. If you predict a command outside this exact list, your tool call will be rejected. 

**Allowed Commands:**
* **Formatting:** `bold`, `italic`, `underline`, `strikethrough`, `fontSizeUp`, `fontSizeDown`, `changeTextColor`
* **Alignment:** `alignLeft`, `alignCenter`, `alignRight`, `alignTop`, `alignVertical`, `alignBottom`
* **Layering:** `bringToFront`, `sendToBack`, `bringForward`, `sendBackward`
* **Operations:** `duplicate`, `deleteEl`, `flipHorizontal`, `flipVertical`, `fitToSlide`
* **Tables/Charts:** `editChartData`, `insertTableRow`, `insertTableCol`, `deleteTableRow`, `deleteTableCol`
* **Store Methods (Requires Args):** `updateElement`, `addElement`

> [!WARNING]
> Do NOT hallucinate commands. Always use `updateElement` with proper args if a specific button command doesn't exist.

---

## 7. Example Full Prediction Response

Given context:
- User selected a text element ("PPTist Editor")
- `insights` reports low contrast for this element
- Recent actions: `[select text, format text]`

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
    }
  ]
}
```
