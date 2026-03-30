# canvas-mcp

MCP server for Canvas LMS. Exposes courses, modules, files, assignments, and announcements.

Supports two modes:
- **HTTP** — for Claude.ai custom connectors (remote MCP)
- **stdio** — for Claude Desktop (local MCP)

## Setup

1. **Generate an API token**: Canvas → Account → Settings → Approved Integrations → New Access Token.

2. **Install & build:**
   ```bash
   npm install
   npm run build
   ```

3. **Deploy to Firebase (Cloud):**
   ```bash
   firebase deploy --only functions
   ```

---

## Remote Connector (Claude.ai)

The remote MCP server is **100% stateless**. You do not need to set any environment variables related to Canvas. The server uses a mock OAuth 2.0 flow to accept your Canvas credentials directly from the Claude UI securely.

### Connecting to Claude.ai

Configure the custom connector in Claude.ai (**Settings** ➔ **MCP** ➔ **Add Custom Connector**):

1. **Connector URL:** `https://<YOUR_PROJECT_ID>.web.app/mcp`
2. **OAuth Client ID:** Enter your Canvas Base URL (e.g., `https://canvas.kau.se`)
3. **OAuth Client Secret:** Enter your Canvas API Token

> [!TIP]
> The server automatically handles discovery and token exchange. You do not need to manually configure separate authorize or token endpoints in the Claude UI if using the Custom Connector flow.

---

## Available Tools

| Tool | Description |
|---|---|
| `get_courses` | List all active enrolled courses |
| `get_modules` | List modules + items for a course |
| `get_file_url` | Get download URL for a file by `content_id` |
| `read_file_content` | **(NEW)** Download and parse content from `.pdf`, `.docx`, `.xlsx`, `.pptx` |
| `get_module_items` | List items in a specific module |
| `get_assignments` | List assignments with due dates |
| `get_announcements` | List recent course announcements |

---

## AI Agent Documentation
For AI agents or developers looking to maintain or expand this project, refer to:
- `documentation/canvas_mcp_skill/SKILL.md`: A comprehensive guide on architecture, auth flow, and parsing protocols.
