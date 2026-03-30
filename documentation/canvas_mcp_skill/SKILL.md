---
name: canvas_mcp_management
description: High-level instructions for AI agents on maintaining, extending, and deploying the Stateless Canvas MCP server.
---

# Canvas MCP AI Agent Skill

This skill allows a future AI agent to understand exactly how this codebase works, how to extend it, and how to maintain its unique stateless architecture.

## 🤖 AI Agent Behavioral Guidelines

- **Search Before Guessing**: If you are unsure about a Canvas API endpoint, a parsing library's behavior, or a Firebase error, **ALWAYS** prioritize using your `search_web` or `perplexity_ask` tools. Never make up API structures or code patterns.
- **Reference Official Docs**: For Canvas API changes, refer to the [official Canvas LMS API documentation](https://developerdocs.instructure.com/services/canvas).
- **Verify Imports**: Because this is an ESM project using legacy CJS libraries, verify any new imports by checking the `node_modules` structure or using a scratch script (`node -e ...`).

## 🏗️ Architecture Overview

The server is a **Stateless Express App** exported as a **Firebase Gen 2 HTTPS Function**.

- **Statelessness**: No environment variables for Canvas credentials are stored on the server.
- **Dynamic Client**: Every request to the `/mcp` endpoint must include an Authorization Bearer token which encodes the Canvas `baseUrl` and `apiToken`.
- **Firebase Hosting**: Used to map a custom domain (or `.web.app` domain) directly to the function to avoid path-stripping issues.

## 🔐 Auth Logic (The "Magic")

The server implements a mock OAuth 2.0 flow to trick Claude.ai into "logging in" to your Canvas.

1. **`/authorize`**: Accepts dummy `client_id` (used purely for identification) and returns a code.
2. **`/token`**: Takes the `client_id` (Canvas Base URL) and `client_secret` (Canvas API Token) and packs them into a Base64 JSON string.
3. **`/mcp`**: Decodes that token to instantiate a `CanvasClient` on the fly for every single MCP tool call.

## 🚀 Detailed Setup Guide

### 1. Claude.ai Integration

To connect this server to Claude, follow these steps in the Claude.ai interface:

1.  Navigate to **Settings** ➔ **MCP**.
2.  Select **Add Custom Connector**.
3.  **Connector URL**: `https://YOUR_PROJECT_ID.web.app/mcp` (Always use the Hosting URL, not the `.cloudfunctions.net` one).
4.  **OAuth Client ID**: Enter your Canvas Base URL (e.g., `https://canvas.kau.se`).
5.  **OAuth Client Secret**: Enter your Canvas API Access Token.

> [!IMPORTANT]
> Because this is a **stateless** proxy, Claude will automatically "discover" the auth endpoints via the server's headers. You do not need to manually configure the authorize/token URLs.

### 2. Getting Started with Firebase CLI

If you (the user) are on a new machine or haven't used Firebase before:

- **Installation**: Run `npm install -g firebase-tools` in your terminal.
- **Login**: Run `firebase login` to authenticate with your Google account.
- **Select Project**: Run `firebase use --add YOUR_PROJECT_ID` within this directory to link it to your cloud project.

## 🛠️ Modifying & Expanding

### Adding New Tools

To expand the server's capabilities:

1.  **Define the Tool**: Add a new entry to `toolDefinitions` in `src/tools.ts` using the JSON Schema format.
2.  **Add Zod Schema**: Add a corresponding `Zod` validation schema in `src/tools.ts` for safety.
3.  **Canvas Client**: Add necessary API methods to `src/canvas-client.ts`.
4.  **Handle Tool**: Add a new `case` to the `handleTool` switch statement in `src/tools.ts`.

### File Parsing Protocol

The `read_file_content` tool is the most complex. It uses:

- `pdf-parse`: For PDFs.
- `xlsx`: For Excel (converts to CSV for table readability).
- `officeparser`: For Word (`.docx`) and PowerPoint (`.pptx`).

> [!CAUTION]
> If adding new parsing libraries, ensure they are 100% Pure JavaScript (Node.js) compatible. Firebase Functions do not have system binaries like `unzip` or `pdftotext` available in standard environments.

## ⚠️ Troubleshooting Tips

- **404 "Page Not Found"**: Usually means the Firebase Hosting rewrite isn't working. Ensure `firebase.json` has the `"source": "**", "function": "api"` rule.
- **Unauthorized (401)**: Claude isn't sending the Bearer token. Try "re-authorizing" the connector by deleting and re-adding it in Claude.ai.
- **Discovery Failed**: Ensure the server is returning the `WWW-Authenticate` header with absolute URLs.
- **Memory Errors**: If parsing large files fails, check the Firebase logs. You may need to increase the `memory` setting in `src/index.ts` further (e.g., to `1GiB`).

## 🧹 Maintenance Commands

- **Build**: `npm run build`
- **Deploy**: `firebase deploy --only functions`
- **Check Logs**: `firebase functions:log`
