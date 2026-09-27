# PPTist MCP Bridge Integration

This document outlines the architecture, configuration, and implementation of the Model Context Protocol (MCP) bridge built into PPTist to support predictive AI features (via OpenClaw or other LLM MCP clients).

## Architecture Overview

Since PPTist runs in a browser (which cannot speak raw MCP `stdio`), we use a lightweight Node.js "bridge" server. 

The architecture consists of three parts:
1. **PPTist Browser Frontend:** A Pinia watcher (`CommunicationTriggers.ts`) detects user actions and POSTs a compressed context payload over HTTP.
2. **MCP Bridge Server:** A Node.js process (`mcp-server/`) that runs alongside the frontend. It receives HTTP POSTs from the browser, stores the state, and exposes it over MCP `stdio`.
3. **OpenClaw (MCP Client):** The LLM connects to the bridge via `stdio`, subscribes to context updates, and receives notifications in real-time.

```text
┌─────────────────┐       HTTP fetch()        ┌─────────────────┐       stdio        ┌──────────────┐
│   Browser Tab   │  ──────────────────────►  │  MCP Server     │  ◄──────────────   │   OpenClaw   │
│   (PPTist app)  │   POST localhost:3100     │  (Node.js)      │   MCP protocol     │   (LLM)      │
└─────────────────┘                           └─────────────────┘                    └──────────────┘
```

## Push-Based Notification Flow

We utilize MCP's Resource Subscription pattern so the LLM doesn't have to poll for data:
1. OpenClaw subscribes to the `pptist://context/live` resource **once** upon startup.
2. The user clicks or edits something in the browser.
3. The browser POSTs the data to `http://localhost:3100/context`.
4. The MCP server stores the latest payload and instantly sends a `notifications/resources/updated` MCP event to OpenClaw.
5. OpenClaw receives the notification, fetches the updated resource, and predicts the next action.

## Serialized Payload Context

To save tokens and optimize LLM speed, the payload sent to the LLM is heavily compressed.

**Example Payload received by OpenClaw:**
```json
{
  "triggerAction": "setActiveElementIdList",
  "currentSelection": [
    {
      "id": "7stmVP",
      "type": "text",
      "width": 200,
      "height": 50,
      "left": 100,
      "top": 100,
      "content": "PPTist Editor",
      "defaultFontName": "Arial",
      "defaultColor": "#000000"
    }
  ],
  "currentSlide": {
    "id": "test-slide-1",
    "elementCount": 7,
    "elementTypes": { "shape": 2, "text": 4, "line": 1 }
  },
  "recentActions": [
    {
      "type": "format",
      "targetType": "text",
      "targetId": "7stmVP",
      "details": { "props": ["defaultColor"] }
    }
  ]
}
```
*Note: `currentSlide` intentionally ignores `slidesStore.slides` to only send data for the actively viewed slide.*

## How to Run

For local development or testing without OpenClaw, you need two terminals.

**Terminal 1 (Vite Frontend):**
```bash
npm run dev
```

**Terminal 2 (MCP Server manually):**
```bash
cd mcp-server
npm run dev
```

### Running with OpenClaw
OpenClaw will automatically spawn the MCP server. Configure OpenClaw's MCP client with the following:

**Development Configuration:**
* **Command:** `npx`
* **Args:** `["tsx", "/Users/krishnavaghosh/Documents/POC/PPTist/mcp-server/src/index.ts"]`

**Production Configuration (Recommended):**
*(Run `npm run build` inside `mcp-server/` first)*
* **Command:** `node`
* **Args:** `["/Users/krishnavaghosh/Documents/POC/PPTist/mcp-server/dist/index.js"]`

## Troubleshooting

### `Error: listen EADDRINUSE: address already in use :::3100`
This happens if an old instance of the MCP server crashed or didn't shut down cleanly, leaving a zombie process holding port 3100.
**Fix:** Find and kill the process:
```bash
lsof -i :3100
# Look at the PID in the output, then run:
kill -9 <PID>
```
