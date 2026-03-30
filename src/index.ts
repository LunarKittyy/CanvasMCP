#!/usr/bin/env node
import express from "express";
import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CanvasClient } from "./canvas-client.js";
import { toolDefinitions, handleTool } from "./tools.js";
import { onRequest } from "firebase-functions/v2/https";

const port = Number(process.env.PORT ?? 3000);

function createServer(client: CanvasClient): Server {
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

  return server;
}

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Claude discovery middleware: Intercept missing or invalid auth
app.use((req, res, next) => {
  if (req.path === "/mcp" && req.method === "POST") {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const scheme = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host") || "";
      const base = `${scheme}://${host}`;
      
      // Tell Claude where to find the OAuth endpoints
      res.set(
        "WWW-Authenticate",
        `Bearer realm="MCP", authorization_uri="${base}/authorize", token_uri="${base}/token"`
      );
      res.status(401).json({ error: "Unauthorized. Missing or invalid Bearer token." });
      return;
    }
  }
  next();
});

// OAuth: /authorize (auto-approves internally since this is a proxy for the token)
const authCodes = new Map<string, { clientId: string }>();

app.get("/authorize", (req, res) => {
  const { client_id, redirect_uri, response_type, state } = req.query;
  
  if (response_type !== "code") {
    res.status(400).json({ error: "unsupported_response_type" });
    return;
  }
  
  // We issue a dummy authorization code
  const code = randomUUID();
  authCodes.set(code, { clientId: String(client_id) });
  
  const redirectUrl = new URL(String(redirect_uri));
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", String(state));
  
  res.redirect(redirectUrl.toString());
});

// OAuth: /token (Combine the clientId (baseUrl) and clientSecret (canvasToken) into an access token)
app.post("/token", (req, res) => {
  const { grant_type, code, client_id, client_secret } = req.body;

  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
  
  const stored = authCodes.get(String(code));
  if (!stored || stored.clientId !== client_id) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }
  
  authCodes.delete(String(code));
  
  if (!client_id || !client_secret) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }
  
  // Create a stateless token containing both credentials
  const payload = JSON.stringify({ baseUrl: client_id, apiToken: client_secret });
  const access_token = Buffer.from(payload).toString('base64');

  res.json({
    token_type: "Bearer",
    access_token,
    expires_in: 31536000 // 1 year, essentially non-expiring for this basic implementation
  });
});

app.post("/mcp", async (req, res) => {
  const authHeader = req.headers.authorization!;
  const token = authHeader.split(" ")[1];
  
  let baseUrl: string;
  let apiToken: string;
  
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    baseUrl = payload.baseUrl;
    apiToken = payload.apiToken;
  } catch (err) {
    res.status(401).json({ error: "Invalid access token format." });
    return;
  }

  if (!baseUrl || !apiToken) {
    res.status(401).json({ error: "Access token missing underlying parameters." });
    return;
  }

  const client = new CanvasClient({ baseUrl, apiToken });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = createServer(client);

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "canvas-mcp", authFlow: "stateless-oauth" });
});

export const api = onRequest({
    region: "europe-north1",
    invoker: "public",
    memory: "512MiB"
}, app);

if (process.env.NODE_ENV !== "production") {
  app.listen(port, "0.0.0.0", () => {
    console.log(`Canvas MCP server listening on http://0.0.0.0:${port}/mcp`);
  });
}
