/**
 * Ruling 7a6b9e290c3204a9 — Piercing Light (SFD-023 → sfd-023-221) · [2][fury] "[Repeat][2][fury] Deal 2 to a unit at a battlefield,
 *   then deal 2 to up to one other unit." × Gust (OGN-169 → ogn-169-298) · Reaction · [1] "Return a unit at a battlefield with 3
 *   [Might] or less to its owner's hand." (× Traveling Merchant OGN-185 cited only as the "then" precedent.)
 *
 * Q: Piercing Light targets a battlefield unit, then a unit in a base; the battlefield unit is Gusted away before it resolves.
 *    Does the base unit still take 2?
 * A: Yes. "Then" is a timing word, not a condition on the first target still being valid; removing the first target does not
 *    invalidate the second instruction.
 * Rules: 355.5 (targets locked on play), 359.3.e.2 (target moved to a non-board zone → illegal), 359.3.e.5 (only the tied instruction is skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const GUST = "ogn-169-298";

/** P1's turn. P2 holds bf1 with Small (2); Big (5) sits in P2's base. P1: Piercing Light + [2][fury]. P2: Gust + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 5, name: "Big" }, "big")
    .hand(P1, PIERCING_LIGHT, "pl")
    .hand(P2, GUST, "gust");
}

/** P1 casts Piercing Light: Small (at bf1) first, then Big (in base); passes → P2 has priority. */
async function declared(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pl", { targets: ["small", "big"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", controller: P1, targets: ["small", "big"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 7a6b9e290c3204a9 — Gusting Piercing Light's first target does not stop the 'then' 2 to the base unit", () => {
  test("control: unanswered, Small (bf1) takes 2 and dies, then Big (base) takes 2", async () => {
    const game = await declared();
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("big")).toMatchObject({ damage: 2, zone: "base" });
  });

  test("P2 Gusts Small in response: it returns to hand (a non-board zone) while Piercing Light waits with its original choices", async () => {
    const game = await declared();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "small" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pl", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", targets: ["small", "big"] })]);
  });

  test("Piercing Light then resolves: the first 2 has no legal target (Small untouched in hand), but Big in base STILL takes 2", async () => {
    const game = await declared();
    await game.p2.cast("gust", { targets: "small" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.state("small").damage).toBe(0);
    expect(game.state("big")).toMatchObject({ damage: 2, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
