/**
 * Ruling 0200c6c51e7dcecc — Possession (OGN-203 → ogn-203-298, Action, 8 + [chaos]x3)
 *   "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Rebuke (ogn-172-298, Action) "Return a unit at a battlefield to its owner's hand."
 *   × Retreat (ogn-104-298, Reaction) "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Q: Opponent Possesses my unit; then I Rebuke it, or they Retreat it — does it come back to MY hand (owner)?
 *    Does Retreat give ME the exhausted rune?
 * A: Yes to both. A returned unit always goes to its OWNER's hand regardless of who controls it or who cast the
 *    bounce; Retreat's "its owner channels 1 rune exhausted" benefits the owner, not the caster.
 * Rules: 127.1 (owner), 477.1.a (control change), 056.2 (return to hand → owner's hand), 740.1.a (friendly = controller).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const REBUKE = "ogn-172-298";
const RETREAT = "ogn-104-298";

/**
 * P1's turn. P2's vanilla Victim (3, ready) alone at P2's bf1; bf2 is empty/uncontrolled.
 * P1: Possession + Retreat in hand, 8+1 energy, 3 chaos. P2: Rebuke in hand with exactly 2 energy + 2 chaos.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { chaos: 3 } })
    .resources(P2, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "base", { might: 2, name: "P1 Own" }, "own")
    .hand(P1, POSSESSION, "poss")
    .hand(P1, RETREAT, "retreat")
    .hand(P2, REBUKE, "rebuke");
}

async function possessed(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("poss", { targets: "victim" });
  await game.settle();
  expect(game.zoneOf("poss")).toBe("trash");
  return game;
}

describe("Ruling 0200c6c51e7dcecc — a Possessed unit bounces to its OWNER; Retreat's rune goes to the owner", () => {
  test("premise: Possession resolves — Victim is in P1's base, controlled by P1 but still OWNED by P2 (477.1.a, 127.1)", async () => {
    const game = await possessed();
    expect(game.state("victim")).toMatchObject({ controller: P1, owner: P2, zone: "base", location: "base" });
    expect(game.p1.units("base")).toContain("victim");
    expect(game.p2.units()).not.toContain("victim");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
  });

  test("case Rebuke: P1 walks the possessed Victim onto empty bf2; in that showdown its OWNER P2 Rebukes it → Victim returns to P2's hand, not P1's", async () => {
    const game = await possessed();
    expect(game.state("victim").isReady).toBe(true); // a recall is not a move and does not exhaust
    await game.p1.move("victim", "bf2");
    // Non-combat showdown at bf2: P1 has Focus first, passes; P2 may now play an Action.
    expect(game.actingSeat()).toBe(P1);
    await game.p1.pass();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "rebuke")).toBe(true);
    await game.p2.cast("rebuke", { targets: "victim" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Rebuke resolves
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.p2.hand()).toContain("victim");
    expect(game.p1.hand()).not.toContain("victim");
    expect(game.state("victim")).toMatchObject({ controller: P2, owner: P2 });
    await game.settle();
    // Nobody stands at bf2 any more → P1 did not conquer it.
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("case Retreat: the CONTROLLER P1 Retreats the possessed Victim (friendly to P1) → it returns to its OWNER P2's hand", async () => {
    const game = await possessed();
    expect(game.p1.can("cast", "retreat")).toBe(true);
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("retreat", { targets: "victim" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.p2.hand()).toContain("victim");
    expect(game.p1.hand()).not.toContain("victim");
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // only Retreat left P1's hand
    expect(game.state("victim")).toMatchObject({ controller: P2, owner: P2 });
  });

  test("case Retreat: 'its OWNER channels 1 rune exhausted' → P2 (owner) gains an exhausted rune; P1 (caster/controller) channels nothing", async () => {
    const game = await possessed();
    const p1Runes = game.p1.runes().length;
    const p2Runes = game.p2.runes().length;
    const p1RuneDeck = game.p1.runeDeck().length;
    const p2RuneDeck = game.p2.runeDeck().length;
    await game.p1.cast("retreat", { targets: "victim" });
    await game.settle();
    expect(game.p2.runes()).toHaveLength(p2Runes + 1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.p2.runeDeck()).toHaveLength(p2RuneDeck - 1);
    expect(game.p1.runes()).toHaveLength(p1Runes);
    expect(game.p1.runeDeck()).toHaveLength(p1RuneDeck);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: P1 Retreating a unit P1 OWNS returns it to P1's hand and P1 channels the exhausted rune", async () => {
    const game = await possessed();
    const p1Runes = game.p1.runes().length;
    const p2Runes = game.p2.runes().length;
    await game.p1.cast("retreat", { targets: "own" });
    await game.settle();
    expect(game.p1.hand()).toContain("own");
    expect(game.p1.runes()).toHaveLength(p1Runes + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p2.runes()).toHaveLength(p2Runes);
  });
});
