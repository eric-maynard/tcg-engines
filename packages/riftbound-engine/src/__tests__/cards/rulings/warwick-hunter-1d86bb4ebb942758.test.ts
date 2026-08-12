/**
 * Ruling 1d86bb4ebb942758 — Warwick, Hunter (OGN-159 → ogn-159-298) · 6 + [body] · 5 Might
 *   "I enter ready. When I attack, kill all damaged enemy units here."
 *
 * Q: After attacking with Warwick, can I hold priority and play a Reaction spell before his attack
 *    ability resolves?
 * A: Yes. The attack trigger goes on the chain and the attacking player keeps priority; you may add
 *    a Reaction to the chain above it, and that Reaction resolves first (LIFO) — so anything it
 *    damages counts as "damaged" when Warwick's ability finally resolves.
 * Rules: 383 (triggered abilities go on the chain), 330–337 (priority; chain resolves LIFO, one item
 *        at a time), 347 (Reaction timing), 359.3 (the ability reads the board at resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";

/** [Reaction] "Deal 2 to a unit." */
const ZAP = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Zap",
  rulesText: "[Reaction] Deal 2 to a unit.",
  timing: "reaction",
} as const;

/**
 * P1's turn. P2 holds bf1 with an already-damaged 3-Might Scout and a pristine 6-Might Wall.
 * P1's ready Warwick waits in base with a Zap and exactly [1] in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout", { damage: 1 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .unit(P1, "base", WARWICK, "ww")
    .hand(P1, ZAP, "zap");
}

const chainIds = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

describe("Ruling 1d86bb4ebb942758 — Warwick's attacker keeps priority and can Reaction before the attack trigger resolves", () => {
  test("attacking puts Warwick's trigger on the chain and leaves PRIORITY with P1 (a chain context, not an automatic resolution)", async () => {
    const game = await board().build();
    await game.p1.move("ww", "bf1");
    expect(game.state("ww").combatRole).toBe("attacker");
    expect(chainIds(game)).toEqual(["ww*"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "zap")).toBe(true);
    // Nothing has been killed yet — the trigger is unresolved.
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
  });

  test("ruling: P1 holds priority and casts Zap on the undamaged Wall — it sits ABOVE Warwick's trigger on the chain", async () => {
    const game = await board().build();
    await game.p1.move("ww", "bf1");
    await game.p1.cast("zap", { targets: "wall" });
    expect(chainIds(game)).toEqual(["ww*", "zap"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("wall").damage).toBe(0); // not resolved yet
  });

  test("LIFO: the Zap resolves first (Wall now damaged), and only then Warwick's ability — which therefore kills BOTH damaged enemy units here", async () => {
    const game = await board().build();
    await game.p1.move("ww", "bf1");
    await game.p1.cast("zap", { targets: "wall" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Zap
    expect(game.zoneOf("zap")).toBe("trash");
    expect(game.state("wall").damage).toBe(2);
    expect(chainIds(game)).toEqual(["ww*"]);
    expect(game.zoneOf("scout")).toBe("battlefield-bf1"); // still alive: Warwick has not resolved
    await game.p1.passPriority();
    await game.p2.passPriority(); // Warwick's trigger
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: without the held-priority Zap only the already-damaged Scout dies — the Wall survives Warwick's trigger and the showdown opens", async () => {
    const game = await board().build();
    await game.p1.move("ww", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(1); // Zap never cast
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });
});
