/**
 * Ruling f2ae6dc455c9381a — Ember Monk (OGN-167 → ogn-167-298) · Unit · Chaos · 4 · 4 Might
 *   "When you play a card from [Hidden], give me +2 [Might] this turn."
 *   × Consult the Past (OGN-083 → ogn-083-298) · Spell · Mind · 4 · [Hidden] [Reaction] "Draw 2."
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   (Raging Firebrand OGN-031 is only name-dropped as an edge case; not part of the scenario.)
 *
 * Q: Ember Monk is at a battlefield; I play Consult the Past from hidden there, opponent Defies it. Does the Monk get +2?
 * A: No. A spell is only "played" once it resolves; Defy counters Consult the Past before it resolves, so it was never
 *    played and Ember Monk's trigger condition is never met — no +2, and (of course) no Draw 2.
 * Rules: 359.3.e.10 / 419.4.a ("when you play a spell" fires on resolution), 425.1 (countered spell doesn't resolve), 811.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EMBER_MONK = "ogn-167-298";
const CONSULT = "ogn-083-298";
const DEFY = "ogn-045-298";

/** P1's turn 3. P1 holds bf1 with Ember Monk; Consult the Past was hidden there on an earlier turn. P2: Defy + 1 + [calm]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", EMBER_MONK, "monk")
    .facedown(P1, "bf1", CONSULT, "consult")
    .hand(P2, DEFY, "defy");
}

describe("Ruling f2ae6dc455c9381a — a Defied Consult the Past was never 'played', so Ember Monk gets nothing", () => {
  test("flipping Consult the Past from hidden puts it on the chain for [0]; Ember Monk has NOT triggered yet (spells are 'played' on resolution)", async () => {
    const game = await board().build();
    expect(game.p1.can("reveal", "consult")).toBe(true);
    await game.p1.reveal("consult");
    expect(game.zoneOf("consult")).toBe("chain");
    expect(game.chain().map((c) => c.cardId)).toEqual(["consult"]);
    expect(game.chain().some((c) => c.cardId === "monk")).toBe(false);
    expect(game.state("monk").might).toBe(4);
  });

  test("P2 Defies it: Consult is countered to the trash, P1 draws nothing, Ember Monk's trigger never fires — still 4 Might", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.reveal("consult");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "consult" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore); // no Draw 2
    expect(game.state("monk")).toMatchObject({ might: 4, mightModifier: 0, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — not countered: Consult resolves (Draw 2), THEN Ember Monk's trigger goes on the chain and gives it +2 this turn (6 Might)", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.reveal("consult");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Consult resolves
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 2);
    // The Monk's trigger is now a chain item (or already resolved if auto-settled); settle it through.
    await game.settle();
    expect(game.state("monk").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("monk").might).toBe(4); // "this turn"
  });
});
