/**
 * Ruling 5c99c1a40f2dd273 — Falling Star (OGN-029 → ogn-029-298) · Spell · [2][fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction · [1] · "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: Can I play Falling Star, pass priority, have my opponent pass too, and THEN put Stupefy on that same chain?
 * A: No. Two consecutive passes resolve the top item (Falling Star) — there is no window left on that chain. To get Stupefy
 *    in first, HOLD priority: after playing Falling Star you have priority (337.1.c.3) and may play the Reaction right away
 *    (Falling Star → Stupefy), then pass; Stupefy resolves first (LIFO), then Falling Star.
 * Rules: 337.1.c.3 (player who added the newest item gets priority), 338–340 (all pass → top item resolves, LIFO).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const STUPEFY = "ogn-095-298";

/** P1's turn with [3] + fury×2 (Falling Star + Stupefy). P2 has X (4) and Y (3) at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "X" }, "X")
    .unit(P2, "bf1", { might: 3, name: "Y" }, "Y")
    .hand(P1, FALLING_STAR, "fs")
    .hand(P1, STUPEFY, "stupefy");
}

describe("Ruling 5c99c1a40f2dd273 — no Stupefy after both players passed on Falling Star; hold priority instead", () => {
  test("pass / pass: Falling Star resolves at once (X takes 3 and survives at 4 Might, Y dies) — the chain is EMPTY, so a Stupefy now would only start a brand-new chain", async () => {
    const game = await board().build();
    await game.p1.cast("fs", { targets: ["X", "Y"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fs"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 holds priority first
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority(); // both passed in succession → top item resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.state("X")).toMatchObject({ damage: 3, might: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("Y")).toBe("trash");
    // "You missed your chance": we are back in the open main phase; Stupefy is castable only as the start of a NEW chain.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.cast("stupefy", { targets: "X" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy"]); // Falling Star is long gone from it
  });

  test("holding priority: right after Falling Star P1 still has priority and may add Stupefy on top → chain [Falling Star, Stupefy]", async () => {
    const game = await board().build();
    await game.p1.cast("fs", { targets: ["X", "Y"] });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "stupefy")).toBe(true);
    await game.p1.cast("stupefy", { targets: "X" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fs", "stupefy"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("…then LIFO: Stupefy resolves first (X → 3 Might, P1 draws 1) while Falling Star waits; Falling Star then resolves and its 3 now kills X (and Y)", async () => {
    const game = await board().build();
    await game.p1.cast("fs", { targets: ["X", "Y"] });
    await game.p1.cast("stupefy", { targets: "X" });
    const hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // Stupefy (newest) resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["fs"]);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("X")).toMatchObject({ damage: 0, might: 3 });
    expect(game.p1.hand()).toHaveLength(hand + 1);
    for (let i = 0; i < 2 && game.chain().length > 0; i++) {
      await game.acting().passPriority(); // Falling Star resolves
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.zoneOf("X")).toBe("trash"); // 3 damage on a 3-Might unit
    expect(game.zoneOf("Y")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
