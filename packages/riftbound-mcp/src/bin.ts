#!/usr/bin/env bun
/**
 * riftbound-mcp — stdio MCP server. stdout is the protocol channel; all
 * diagnostics go to stderr.
 */

import { createServer, SERVER_NAME, SERVER_VERSION } from "./index";
import { serveStdio } from "./mcp-lite";

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  process.stderr.write(
    `${SERVER_NAME} ${SERVER_VERSION}\nUsage: riftbound-mcp   (speaks MCP JSON-RPC 2.0 over stdio; newline-delimited)\n       riftbound-mcp --list-tools\n`,
  );
  process.exit(0);
}

// The engine logs verbosely via console; keep stdout clean for JSON-RPC.
const toStderr = (...parts: unknown[]) => {
  if (process.env.RIFTBOUND_MCP_DEBUG) {
    process.stderr.write(
      `${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`,
    );
  }
};
console.log = toStderr;
console.info = toStderr;
console.warn = toStderr;
console.debug = toStderr;

const { server } = createServer();

if (args.has("--list-tools")) {
  process.stdout.write(`${JSON.stringify(server.listTools(), null, 2)}\n`);
  process.exit(0);
}

process.stderr.write(`[${SERVER_NAME}] ready on stdio (${server.listTools().length} tools)\n`);
await serveStdio(server);
