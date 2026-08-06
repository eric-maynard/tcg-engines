/**
 * End-to-end: spawn `bun src/bin.ts` and speak JSON-RPC over stdio.
 */

import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const BIN = resolve(import.meta.dir, "../bin.ts");

async function exchange(lines: object[], expectResponses: number): Promise<any[]> {
  const proc = Bun.spawn(["bun", BIN], { stderr: "pipe", stdin: "pipe", stdout: "pipe" });
  for (const l of lines) {
    proc.stdin.write(`${JSON.stringify(l)}\n`);
  }
  await proc.stdin.flush();
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const out: any[] = [];
  const deadline = Date.now() + 60_000;
  while (out.length < expectResponses && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buf += decoder.decode(value);
    let nl = buf.indexOf("\n");
    while (nl !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        out.push(JSON.parse(line));
      }
      nl = buf.indexOf("\n");
    }
  }
  proc.stdin.end();
  proc.kill();
  await proc.exited;
  return out;
}

describe("stdio transport", () => {
  test("initialize + tools/list + a tool call round-trip over a child process", async () => {
    const responses = await exchange(
      [
        {
          id: 1,
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            capabilities: {},
            clientInfo: { name: "test", version: "0" },
            protocolVersion: "2025-03-26",
          },
        },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { id: 2, jsonrpc: "2.0", method: "tools/list" },
        {
          id: 3,
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: { name: "Cleave" }, name: "card_text" },
        },
      ],
      3,
    );
    expect(responses).toHaveLength(3);
    const [init, list, call] = responses;
    expect(init.id).toBe(1);
    expect(init.result.protocolVersion).toBe("2025-03-26");
    expect(init.result.serverInfo).toEqual({ name: "riftbound-mcp", version: "0.1.0" });
    expect(list.id).toBe(2);
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain("create_game");
    expect(call.id).toBe(3);
    expect(call.result.isError).toBeUndefined();
    expect(call.result.content[0].text).toContain("Assault 3");
  }, 90_000);
});
