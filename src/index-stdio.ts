#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CanvasClient } from "./canvas-client.js";
import { toolDefinitions, handleTool } from "./tools.js";

const baseUrl = process.env.CANVAS_BASE_URL;
const apiToken = process.env.CANVAS_API_TOKEN;

if (!baseUrl || !apiToken) {
  console.error("CANVAS_BASE_URL and CANVAS_API_TOKEN are required.");
  process.exit(1);
}

const client = new CanvasClient({ baseUrl, apiToken });

const server = new Server(
  { name: "canvas-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(
      name as Parameters<typeof handleTool>[0],
      args,
      client
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Canvas MCP server running on stdio.");
