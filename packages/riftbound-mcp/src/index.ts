/**
 * @tcg/riftbound-mcp — MCP server exposing the Riftbound agent harness.
 *
 *   createServer()  → { server: McpServer, manager: GameManager }
 *   serveStdio(server)  (bin.ts)
 */

import { GameManager } from "./game-manager";
import { McpServer } from "./mcp-lite";
import { Mutex } from "./mutex";
import { defineResources } from "./resources";
import { defineTools } from "./tools";

export const SERVER_NAME = "riftbound-mcp";
export const SERVER_VERSION = "0.1.0";

export const INSTRUCTIONS = [
  "Riftbound TCG headless play via the agent harness.",
  "1) create_game (default goldfish: you are player-1, the bot passes/ends its turns).",
  '2) describe_state {gameId, seat:"p1"} to see the board; current_decision / list_legal_actions for exactly what you may do (stable option keys + accepted args).',
  "3) Act with the named verbs (tap_rune → play_card / move_units / activate_ability → pass_priority → end_turn) or the generic act {answer}. Every response carries seq, the next decision and a `next` hint; prompts (pick / yes-no / integer) are answered with act.",
  "4) settle drains priority passes and automatic procedures; advance_turn ends the turn and comes back to your next main phase.",
  "Costs are paid from your rune pool: tap runes for energy, recycle runes for power. Card ids are instance ids (e.g. player-1-main-3-ogn-004-298); card_text explains any card.",
].join(" ");

export interface CreatedServer {
  server: McpServer;
  manager: GameManager;
  mutex: Mutex;
}

export function createServer(opts: { manager?: GameManager } = {}): CreatedServer {
  const manager = opts.manager ?? new GameManager();
  const mutex = new Mutex();
  const server = new McpServer({
    instructions: INSTRUCTIONS,
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  for (const t of defineTools({ manager, mutex })) {
    server.tool(t);
  }
  for (const r of defineResources()) {
    server.resource(r);
  }
  return { manager, mutex, server };
}

export { GameManager } from "./game-manager";
export type { CreateGameOptions, DeckRequest, GameMode, ManagedGame } from "./game-manager";
export { McpServer, serveStdio, RpcError, RPC_ERRORS, PROTOCOL_VERSION } from "./mcp-lite";
export type {
  JsonRpcRequest,
  JsonRpcResponse,
  ToolResult,
  ToolSpec,
  ResourceSpec,
} from "./mcp-lite";
export { ENUMERABLE_MOVES, INTERNAL_MOVES, movesSchemaDocument } from "./move-schemas";
export { defineTools } from "./tools";
export { defineResources } from "./resources";
export { Mutex } from "./mutex";
