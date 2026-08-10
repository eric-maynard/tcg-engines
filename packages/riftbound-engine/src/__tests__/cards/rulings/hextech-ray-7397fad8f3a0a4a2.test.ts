/**
 * Ruling 7397fad8f3a0a4a2 — Hextech Ray (OGN-009 → ogn-009-298) · Action · [1][fury] · "Deal 3 to a unit at a battlefield."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · [2] · "Move up to 2 friendly units to base."
 *
 * Q: The unit targeted by Hextech Ray is Flashed to base in response. Does it still take damage, or does the spell fizzle?
 * A: Neither "fizzle" nor damage: the Ray still RESOLVES (goes to trash, cost stays paid) but its target is re-checked on
 *    resolution; a unit in base is no longer "a unit at a battlefield", so it resolves with no effect and takes no damage.
 * Rules: 355.11 / 359.3.e (target legality re-checked at resolution → instructions ignored), 340.1 (LIFO), no fizzle rule.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const FLASH = "ogs-011-024";

/** P1's turn 3. P2 holds bf1 with a 2-Might Scout (would die to 3). P1: Ray + [1][fury]. P2: Flash + [2][chaos]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 3, name: "Anchor" }, "anchor") // keeps bf1 held so control is not the story here
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, FLASH, "flash");
}

async function rayAtScout(game: Game): Promise<void> {
  await game.p1.cast("ray", { targets: "scout" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, targets: ["scout"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 7397fad8f3a0a4a2 — Hextech Ray at a unit that Flashes home resolves with no effect", () => {
  test("baseline: unanswered, the Ray deals 3 and kills the 2-Might Scout", async () => {
    const game = await board().build();
    await rayAtScout(game);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash");
  });

  test("Flash IS a legal response; LIFO moves the Scout to base first, then the Ray resolves (to trash, cost still spent) dealing NOTHING — the Scout is undamaged in base", async () => {
    const game = await board().build();
    await rayAtScout(game);
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["scout"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "flash"]);
    // Resolve Flash only.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "flash"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("scout")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]); // the Ray is still there — it does not "fizzle" off the chain
    // Now the Ray resolves.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash"); // it resolved
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // nothing refunded
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("anchor").damage).toBe(0); // no retargeting either
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
