/**
 * Ruling f74f4db2ea1a7cff — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *     "When you defend here, you may move a friendly unit here to base."
 *   × Shakedown (OGN-033 → ogn-033-298) Reaction [2][fury] "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *   × Flurry of Blades (OGN-133 → ogn-133-298) Reaction [1] "Deal 1 to all units at battlefields."
 *
 * Q: Holding Reaver's Row, when the opponent attacks can I retreat my unit to base at once, or must I first defend successfully?
 * A: It is a DEFEND TRIGGER on the initial combat chain (attacker triggers, then defender triggers, then the attacker gets
 *    priority). You choose its target as it goes on the chain, but it doesn't resolve yet — the attacker may respond with
 *    Reaction damage (Shakedown / Flurry). If that kills the unit first, it can't move; if the trigger resolves with the target
 *    alive, it moves to base. The units count as "in combat" while this happens.
 * Rules: 383.4.f (defend triggers), 464.2.e (initial chain order), 383.3.a / 402.2 (opt-in + target at finalization),
 *        336/343 (closed state → Reactions), 359.3.e.5 (dead target → instruction does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const SHAKEDOWN = "ogn-033-298";
const FLURRY = "ogn-133-298";

/** P2's turn. P1 holds Reaver's Row (live) with a lone Lookout (1). P2's Raider (5) in base; P2 holds Shakedown + Flurry, [3] + [fury]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "row", { might: 1, name: "Lookout" }, "lookout")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, SHAKEDOWN, "shake")
    .hand(P2, FLURRY, "flurry")
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["e1", "e2"]);
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks; P1 opts into the Row trigger (Lookout is the lone target); stop with the attacker (P2) holding priority. */
async function rowTriggerOnChainP2ToAct(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, defendingPlayer: P1, isCombatShowdown: true });
  // The "you may" and the target are decided as the trigger goes on the chain (FIN), by the DEFENDER.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
  await game.p1.yes();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("lookout");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["lookout"], triggered: true })]);
  // Nothing has moved: the item merely sits on the chain.
  expect(game.locationOf("lookout")).toBe("row");
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling f74f4db2ea1a7cff — Reaver's Row is a defend trigger the attacker can answer before it resolves", () => {
  test("no 'immediate retreat': after the attack the Row trigger is ON THE CHAIN with its chosen target, Lookout still at the Row, both units designated in combat, and the attacker (P2) gets priority", async () => {
    const game = await rowTriggerOnChainP2ToAct();
    expect(game.state("lookout").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.locationOf("lookout")).toBe("row");
  });

  test("the attacker may respond at Reaction speed: both Shakedown and Flurry of Blades are legal plays in that window", async () => {
    const game = await rowTriggerOnChainP2ToAct();
    expect(game.p2.can("cast", "flurry")).toBe(true);
    expect(game.p2.can("cast", "shake")).toBe(true);
  });

  test("Flurry of Blades in response resolves first (LIFO) and kills the 1-Might Lookout; the Row trigger then resolves with a dead target and moves nothing — Lookout is in the trash, not in base", async () => {
    const game = await rowTriggerOnChainP2ToAct();
    await game.p2.cast("flurry");
    expect(game.chain().map((c) => c.cardId)).toEqual(["row", "flurry"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flurry resolves
    expect(game.zoneOf("lookout")).toBe("trash");
    expect(game.state("raider").damage).toBe(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("lookout")).toBe("trash");
    expect(game.p1.units("base")).toEqual([]);
    // With no defender left the Raider takes the Row.
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("Shakedown in response: the 'unless' choice belongs to Lookout's controller (P1); taking the 6 kills Lookout before the Row trigger resolves, so again nothing moves to base", async () => {
    const game = await rowTriggerOnChainP2ToAct();
    await game.p2.cast("shake", { targets: "lookout" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Shakedown starts resolving → P1 decides
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const dealSix = (d as PickDecision).options.find((o) => /Deal 6/i.test(o.label));
    expect(dealSix).toBeDefined();
    await game.p1.pick((dealSix as { key: string }).key);
    expect(game.zoneOf("lookout")).toBe("trash");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p2.hand()).not.toContain("e1"); // P2 did not draw
  });

  test("unanswered, the trigger resolves and the still-alive Lookout moves to P1's base BEFORE any combat damage — it never had to 'defend successfully' first", async () => {
    const game = await rowTriggerOnChainP2ToAct();
    await game.p2.passPriority(); // both passed → Row trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("lookout")).toBe("base");
    expect(game.state("lookout").damage).toBe(0);
    // The showdown is still open (attacker has Focus); closing it hands P2 the empty Row.
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    await game.settle();
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("lookout")).toBe("base");
  });
});
