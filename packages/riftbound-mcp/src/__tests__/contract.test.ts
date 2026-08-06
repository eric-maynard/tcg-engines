/**
 * Contract test: every engine move id is either reachable through the MCP
 * surface (enumerable player decisions → `act` / a named verb tool) or
 * explicitly listed as intentionally internal. Fails when the engine gains a
 * move nobody classified.
 */

import { describe, expect, test } from "bun:test";
import { riftboundMoves } from "@tcg/riftbound";
import { createServer, ENUMERABLE_MOVES, INTERNAL_MOVES } from "../index";

describe("engine move coverage", () => {
  const engineMoveIds = Object.keys(riftboundMoves).sort();
  const enumerable = engineMoveIds.filter(
    (id) =>
      typeof (riftboundMoves as Record<string, { enumerator?: unknown }>)[id]?.enumerator ===
      "function",
  );

  test("every engine move is classified exactly once", () => {
    const covered = new Set(Object.keys(ENUMERABLE_MOVES));
    const internal = new Set(Object.keys(INTERNAL_MOVES));
    const unclassified = engineMoveIds.filter((id) => !covered.has(id) && !internal.has(id));
    expect(unclassified).toEqual([]);
    const both = engineMoveIds.filter((id) => covered.has(id) && internal.has(id));
    expect(both).toEqual([]);
    const stale = [...covered, ...internal].filter((id) => !engineMoveIds.includes(id));
    expect(stale).toEqual([]);
  });

  test("every enumerable (player-decision) move is reachable via act / a verb tool; internal moves have no enumerator", () => {
    expect(enumerable.length).toBeGreaterThanOrEqual(20);
    for (const id of enumerable) {
      expect(
        ENUMERABLE_MOVES[id],
        `enumerable move ${id} must be in ENUMERABLE_MOVES`,
      ).toBeDefined();
      expect(ENUMERABLE_MOVES[id]?.via).toContain("act");
    }
    for (const id of Object.keys(INTERNAL_MOVES)) {
      expect(
        enumerable,
        `internal move ${id} unexpectedly has an enumerator — expose it`,
      ).not.toContain(id);
    }
  });

  test("named convenience tools referenced by the coverage table exist", () => {
    const { server } = createServer();
    const names = new Set(server.listTools().map((t) => t.name));
    for (const [id, cov] of Object.entries(ENUMERABLE_MOVES)) {
      if (cov.tool) {
        expect(names.has(cov.tool), `${id} → tool ${cov.tool}`).toBe(true);
      }
    }
    expect(names.has("act")).toBe(true);
  });
});
