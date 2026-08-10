/**
 * Ruling 010e7fd334b46df4 — Wages of Pain (SFD-070 → sfd-070-221)
 *   "[Hidden] [Action] Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."
 *   × Retreat (OGN-104 → ogn-104-298) "[Reaction] Return a friendly unit to its owner's hand. Its owner
 *     channels 1 rune exhausted."  × Gold token (sfd-t03).
 *
 * Q: I play Wages of Pain; my opponent Retreats the target in response. Do I still get the Gold?
 * A: Yes. Retreat resolves first (LIFO) and the unit leaves the board, so "Deal 3" has an illegal target
 *    and is ignored — but "Play a Gold gear token exhausted" is a separate instruction that does not
 *    reference the target, so it still executes.
 * Rules: 359.3.e.5 / 359.3.e.6 (only instructions that reference the illegal target are skipped),
 *        336–337 (LIFO chain resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES = "sfd-070-221";
const RETREAT = "ogn-104-298";

const golds = (game: Game, seat: "p1" | "p2") =>
  game[seat].gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");

/** P1's turn. P2's Victim (4) at P2's bf1. P1 has exactly [3] for Wages; P2 exactly [1] for Retreat. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
    .hand(P1, WAGES, "wop")
    .hand(P2, RETREAT, "retreat");
}

describe("Ruling 010e7fd334b46df4 — Wages of Pain still makes Gold when Retreat removes its target", () => {
  test("control (no response): Victim takes 3 and P1 gets one exhausted Gold token", async () => {
    const game = await board().build();
    await game.p1.cast("wop", { targets: "victim" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("victim").damage).toBe(3);
    expect(golds(game, "p1")).toHaveLength(1);
    expect(game.state(golds(game, "p1")[0] as string).isExhausted).toBe(true);
    expect(golds(game, "p2")).toHaveLength(0);
    expect(game.zoneOf("wop")).toBe("trash");
  });

  test("sequence: P2 may Retreat the targeted unit in response; Retreat sits above Wages and resolves first — Victim → P2's hand, P2 channels 1 rune exhausted, Wages still pending", async () => {
    const game = await board().build();
    const p2Runes = game.p2.runes().length;
    await game.p1.cast("wop", { targets: "victim" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "retreat")).toBe(true);
    await game.p2.cast("retreat", { targets: "victim" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["wop", "retreat"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Retreat resolves (LIFO)
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.p2.hand()).toContain("victim");
    expect(game.p2.runes()).toHaveLength(p2Runes + 1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["wop"]);
  });

  test("ruling 010e7fd334b46df4 — Wages then resolves: the damage is ignored (Victim untouched in hand) but P1 STILL gets an exhausted Gold token", async () => {
    const game = await board().build();
    await game.p1.cast("wop", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "victim" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    // Damage instruction ignored: the unit is safely in hand, undamaged, not in a trash.
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.state("victim").damage).toBe(0);
    expect(game.p2.trash()).not.toContain("victim");
    // Gold instruction executed anyway.
    expect(golds(game, "p1")).toHaveLength(1);
    expect(game.state(golds(game, "p1")[0] as string)).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
    expect(golds(game, "p2")).toHaveLength(0);
    expect(game.zoneOf("wop")).toBe("trash");
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
