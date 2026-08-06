/**
 * Minimal MCP (Model Context Protocol) server over newline-delimited
 * JSON-RPC 2.0 on stdio: initialize · ping · tools/list · tools/call ·
 * resources/list · resources/read.
 *
 * Written in-repo because `@modelcontextprotocol/sdk` could not be added
 * through the workspace's registry install (see README › Limitations). The
 * `McpServer` surface mirrors the SDK closely enough to swap later.
 */

export const PROTOCOL_VERSION = "2025-03-26";
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: unknown };

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: JsonObject;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const RPC_ERRORS = {
  INTERNAL: -32603,
  INVALID_PARAMS: -32602,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  PARSE: -32700,
} as const;

export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

export interface ToolContent {
  type: "text";
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
  structuredContent?: JsonObject;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JsonObject;
  handler: (args: JsonObject) => Promise<ToolResult> | ToolResult;
}

export interface ResourceSpec {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
  read: () => Promise<string> | string;
}

export interface ServerInfo {
  name: string;
  version: string;
  instructions?: string;
}

/** Transport-agnostic MCP request router. */
export class McpServer {
  readonly info: ServerInfo;
  private readonly tools = new Map<string, ToolSpec>();
  private readonly resources = new Map<string, ResourceSpec>();
  initialized = false;

  constructor(info: ServerInfo) {
    this.info = info;
  }

  tool(spec: ToolSpec): this {
    if (this.tools.has(spec.name)) {
      throw new Error(`duplicate tool ${spec.name}`);
    }
    this.tools.set(spec.name, spec);
    return this;
  }

  resource(spec: ResourceSpec): this {
    this.resources.set(spec.uri, spec);
    return this;
  }

  listTools(): { name: string; description: string; inputSchema: JsonObject }[] {
    return [...this.tools.values()].map((t) => ({
      description: t.description,
      inputSchema: t.inputSchema,
      name: t.name,
    }));
  }

  listResources(): { uri: string; name: string; description?: string; mimeType: string }[] {
    return [...this.resources.values()].map((r) => ({
      description: r.description,
      mimeType: r.mimeType,
      name: r.name,
      uri: r.uri,
    }));
  }

  /** Call a tool directly (used by tests and by the JSON-RPC router). */
  async callTool(name: string, args: JsonObject = {}): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new RpcError(RPC_ERRORS.INVALID_PARAMS, `Unknown tool: ${name}`, {
        tools: [...this.tools.keys()],
      });
    }
    try {
      return await tool.handler(args ?? {});
    } catch (error) {
      if (error instanceof RpcError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            text: JSON.stringify({ error: { code: "INTERNAL", message }, ok: false }),
            type: "text",
          },
        ],
        isError: true,
      };
    }
  }

  async readResource(
    uri: string,
  ): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> {
    const r = this.resources.get(uri);
    if (!r) {
      throw new RpcError(RPC_ERRORS.INVALID_PARAMS, `Unknown resource: ${uri}`, {
        resources: [...this.resources.keys()],
      });
    }
    return { contents: [{ mimeType: r.mimeType, text: await r.read(), uri }] };
  }

  /** Route one JSON-RPC message. Returns null for notifications. */
  async handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = msg.id === undefined ? null : msg.id;
    const isNotification = msg.id === undefined;
    try {
      if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
        throw new RpcError(RPC_ERRORS.INVALID_REQUEST, "Invalid JSON-RPC request");
      }
      const result = await this.dispatch(msg.method, msg.params ?? {});
      if (isNotification) {
        return null;
      }
      return { id, jsonrpc: "2.0", result };
    } catch (error) {
      if (isNotification) {
        return null;
      }
      const e =
        error instanceof RpcError
          ? { code: error.code, data: error.data, message: error.message }
          : {
              code: RPC_ERRORS.INTERNAL,
              message: error instanceof Error ? error.message : String(error),
            };
      return { error: e, id, jsonrpc: "2.0" };
    }
  }

  private async dispatch(method: string, params: JsonObject): Promise<unknown> {
    switch (method) {
      case "initialize": {
        const requested =
          typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : PROTOCOL_VERSION;
        return {
          capabilities: {
            resources: { listChanged: false, subscribe: false },
            tools: { listChanged: false },
          },
          instructions: this.info.instructions,
          protocolVersion,
          serverInfo: { name: this.info.name, version: this.info.version },
        };
      }
      case "notifications/initialized": {
        this.initialized = true;
        return null;
      }
      case "notifications/cancelled": {
        return null;
      }
      case "ping": {
        return {};
      }
      case "tools/list": {
        return { tools: this.listTools() };
      }
      case "tools/call": {
        const name = params.name;
        if (typeof name !== "string") {
          throw new RpcError(RPC_ERRORS.INVALID_PARAMS, "tools/call requires a string `name`");
        }
        return await this.callTool(name, (params.arguments as JsonObject | undefined) ?? {});
      }
      case "resources/list": {
        return { resources: this.listResources() };
      }
      case "resources/templates/list": {
        return { resourceTemplates: [] };
      }
      case "resources/read": {
        if (typeof params.uri !== "string") {
          throw new RpcError(RPC_ERRORS.INVALID_PARAMS, "resources/read requires a string `uri`");
        }
        return await this.readResource(params.uri);
      }
      case "prompts/list": {
        return { prompts: [] };
      }
      default: {
        if (method.startsWith("notifications/")) {
          return null;
        }
        throw new RpcError(RPC_ERRORS.METHOD_NOT_FOUND, `Method not found: ${method}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// stdio transport
// ---------------------------------------------------------------------------

export interface StdioLike {
  stdin: {
    on(event: string, cb: (...args: any[]) => void): unknown;
    setEncoding?(enc: BufferEncoding): unknown;
  };
  write(line: string): void;
  log?(line: string): void;
}

/**
 * Serve `server` over newline-delimited JSON on stdin/stdout. Messages are
 * processed strictly in arrival order (one at a time) so tool calls never
 * interleave. Resolves when stdin closes.
 */
export function serveStdio(server: McpServer, io?: Partial<StdioLike>): Promise<void> {
  const stdin = io?.stdin ?? process.stdin;
  const write = io?.write ?? ((line: string) => void process.stdout.write(line));
  const log = io?.log ?? ((line: string) => void process.stderr.write(`${line}\n`));
  let buffer = "";
  let queue: Promise<void> = Promise.resolve();

  const send = (msg: JsonRpcResponse) => write(`${JSON.stringify(msg)}\n`);

  const onLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    queue = queue
      .then(async () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          send({
            error: { code: RPC_ERRORS.PARSE, message: "Parse error" },
            id: null,
            jsonrpc: "2.0",
          });
          return;
        }
        const batch = Array.isArray(parsed) ? parsed : [parsed];
        for (const m of batch) {
          const res = await server.handle(m as JsonRpcRequest);
          if (res) {
            send(res);
          }
        }
      })
      .catch((error) =>
        log(
          `[riftbound-mcp] transport error: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  };

  return new Promise((resolve) => {
    stdin.setEncoding?.("utf8");
    stdin.on("data", (chunk: Buffer | string) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        onLine(line);
        nl = buffer.indexOf("\n");
      }
    });
    stdin.on("end", () => {
      if (buffer.trim()) {
        onLine(buffer);
        buffer = "";
      }
      void queue.then(() => resolve());
    });
  });
}
