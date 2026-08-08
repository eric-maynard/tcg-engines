/**
 * MCP registration of the read-only info tools (rules / cards / per-seat public
 * game info). Game-scoped specs gain `{ gameId, seat }` and read the seat's
 * redacted view via `game.backend.view(seat)`; card tools use the manager's
 * card pool so they agree with `card_text`.
 */

import type { JsonObject, ToolResult, ToolSpec } from "./mcp-lite";
import type { ToolContext } from "./tools";
import { BadRequestError, GameNotFoundError } from "./game-manager";
import type { InfoContext, InfoToolSpec } from "./info-tools";
import { infoToolSpecs, runInfoTool } from "./info-tools";

const gameIdProp = { description: "Game id returned by create_game", type: "string" };
const seatProp = {
  description:
    'Your seat (the viewer): "player-1" ("p1") or "player-2" ("p2"). Hidden information is redacted for this seat.',
  type: "string",
};

function textResult(body: JsonObject, text: string, isError = false): ToolResult {
  return {
    content: [{ text, type: "text" }],
    isError: isError ? true : undefined,
    structuredContent: { ...body, text },
  };
}

function withGameArgs(spec: InfoToolSpec): JsonObject {
  const s = spec.input_schema as { properties?: JsonObject; required?: string[] };
  return {
    ...spec.input_schema,
    properties: { gameId: gameIdProp, seat: seatProp, ...(s.properties ?? {}) },
    required: ["gameId", "seat", ...(s.required ?? [])],
  };
}

export function defineInfoTools(
  ctx: ToolContext,
  specs: readonly InfoToolSpec[] = infoToolSpecs,
): ToolSpec[] {
  const { manager, mutex } = ctx;
  return specs.map((spec): ToolSpec => {
    if (spec.scope !== "game") {
      return {
        description: spec.description,
        handler: async (args) => {
          const pool = spec.scope === "cards" ? await manager.cardPool() : undefined;
          const ictx: InfoContext = pool ? { cards: () => pool.all() } : {};
          const r = runInfoTool(spec, ictx, args);
          return textResult(
            { ok: !r.isError, ...(r.code ? { code: r.code } : {}) },
            r.text,
            r.isError,
          );
        },
        inputSchema: spec.input_schema,
        name: spec.name,
      };
    }
    return {
      description: `${spec.description} (Needs gameId + seat; shows only what that seat may see.)`,
      handler: (args) =>
        mutex.run(async () => {
          try {
            if (typeof args.gameId !== "string") {
              throw new BadRequestError("gameId is required (call create_game or list_games)");
            }
            const m = manager.get(args.gameId);
            const seat = manager.seat(m, args.seat);
            const pool = await manager.cardPool();
            const { gameId: _g, seat: _s, ...rest } = args;
            const ictx: InfoContext = {
              cards: () => pool.all(),
              seats: m.game.seats(),
              view: (v) => m.game.backend.view(v),
              viewer: seat,
            };
            const r = runInfoTool(spec, ictx, rest);
            return textResult(
              {
                gameId: m.id,
                ok: !r.isError,
                seat,
                seq: m.game.seq,
                ...(r.code ? { code: r.code } : {}),
              },
              r.text,
              r.isError,
            );
          } catch (error) {
            const code =
              error instanceof BadRequestError || error instanceof GameNotFoundError
                ? error.code
                : "INTERNAL";
            const message = error instanceof Error ? error.message : String(error);
            return textResult({ code, error: { code, message }, ok: false }, message, true);
          }
        }),
      inputSchema: withGameArgs(spec),
      name: spec.name,
    };
  });
}
