/**
 * Interaction: Scorn of the Moon (unl-197-219) · Legend · Mind/Chaos
 *     "[Reaction][>] [Exhaust]: [Add] [1]. Spend this Energy only during showdowns.
 *      (Abilities that add resources can't be reacted to.)"
 *   × Threshold of the Gray (ven-166-166) · Battlefield
 *     "When combat starts here, the attacker and defender each [Add] [1]."
 *
 * Rules: 167 / 316.3 / 317.2.d (the Rune Pool empties ONLY at the start of each player's Main Phase and
 * in the end-of-turn Expiration Step — every player's pool, not just the turn player's), 341 / 316.8
 * (nothing about ending a showdown or a combat empties a pool), 316.8.b.1 (moving onto an EMPTY
 * battlefield stages a Non-Combat Showdown — still "a showdown"), 429.2 (Add abilities resolve as soon
 * as they are finalized, no chain item, Focus does not pass), 444.1 (paying = removing from the pool),
 * 166.1 (added Energy goes to the controller's pool).
 *
 * Board: P1's turn, both pools 0. P1's legend is a ready Scorn of the Moon. bf1 = a LIVE Threshold of
 * the Gray held by P2 with a 2-Might defender; bf2 is empty and uncontrolled. P1 has a ready 3-Might
 * attacker and a ready 1-Might scout in base; hand = 1-cost unit, 2-cost unit, 1-cost [Action] spell,
 * 2-cost [Action] spell (all pip-less "draw 1"s). P2 holds a 1-cost [Reaction] spell.
 *
 * Line: P1 standard-moves the attacker to bf1 (combat starts → Threshold Adds [1] to P1 AND P2), then
 * with Focus exhausts Scorn (+[1] showdown-only), spends nothing, everyone passes, 3 kills 2, P1 conquers.
 *
 * Q/Expected:
 *  (a) Neither pool is emptied when the showdown/combat ends: P1.energy()==2 (1 free + 1 showdown-only),
 *      P2.energy()==1. Both Adds resolved at once with no chain item.
 *  (b) Back in Neutral Open with energy()==2 only the 1-cost unit and the 1-cost spell are enumerated —
 *      the 2-costs would need Scorn's showdown-only energy. Playing the 1-cost unit debits the FREE
 *      energy: energy()==1 remains and nothing costing ≥1 is playable outside a showdown.
 *  (c) Moving the scout onto empty bf2 opens a Non-Combat Showdown with P1 holding Focus: the 2-cost
 *      [Action] spell IS now enumerated (the 2-cost unit is not — no Action timing); Threshold does not
 *      trigger. Passing instead conquers bf2 and the pool still reads 2.
 *  (d) P2's [1] is ordinary energy for the rest of P1's turn (spendable on a Reaction when P2 has
 *      Focus/priority) and is lost in P1's Expiration Step (317.2.d) — already 0 during P2's Beginning
 *      Phase, before 316.3 would empty it again. P1's leftover showdown-only [1] is likewise gone and
 *      leaves no earmark behind on P1's next turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SCORN = "unl-197-219";
const THRESHOLD = "ven-166-166";

const DRAW_ONE = { amount: 1, type: "draw" };
const UNIT_1 = { cardType: "unit", energyCost: 1, might: 1, name: "One-Drop" };
const UNIT_2 = { cardType: "unit", energyCost: 2, might: 2, name: "Two-Drop" };
const ACTION_1 = { abilities: [{ effect: DRAW_ONE, timing: "action", type: "spell" }], cardType: "spell", energyCost: 1, name: "Cheap Trick", timing: "action" };
const ACTION_2 = { abilities: [{ effect: DRAW_ONE, timing: "action", type: "spell" }], cardType: "spell", energyCost: 2, name: "Pricey Trick", timing: "action" };
const REACTION_1 = { abilities: [{ effect: DRAW_ONE, timing: "reaction", type: "spell" }], cardType: "spell", energyCost: 1, name: "Snap Trick", timing: "reaction" };
/** A P2 unit whose only job is to put a trigger on the chain at the start of P2's Beginning Phase, so the test can look at the pools BEFORE P2's Main Phase (316.3) empties them. */
const DAWN_WATCHER = {
  abilities: [{ effect: DRAW_ONE, trigger: { event: "beginning-phase", on: "controller" }, type: "triggered" }],
  cardType: "unit",
  might: 1,
  name: "Dawn Watcher",
};

function board() {
  return scenario()
    .legend(P1, SCORN, "scorn")
    .battlefield("bf1", { controller: P2, def: THRESHOLD, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "defender")
    .unit(P1, "base", { might: 3, name: "Attacker" }, "attacker")
    .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, UNIT_1, "unit1")
    .hand(P1, UNIT_2, "unit2")
    .hand(P1, ACTION_1, "spell1")
    .hand(P1, ACTION_2, "spell2")
    .hand(P2, REACTION_1, "p2react");
}

/** The scripted line: attack bf1, exhaust Scorn with Focus, spend nothing, let combat resolve. */
async function attackAddAndConquer(game: Game): Promise<void> {
  await game.p1.move("attacker", "bf1");
  await game.p1.activate("scorn");
  const r = await game.settle();
  expect(r.reason).toBe("open");
}

const playableKeys = (game: Game, seat: "p1" | "p2" = "p1") =>
  game[seat]
    .legal()
    .filter((o) => o.verb === "play" || o.verb === "cast")
    .map((o) => o.card as string)
    .sort();

describe("Scorn of the Moon × Threshold of the Gray — floating energy outlives the showdown", () => {
  // ── (a) the Adds and the end of combat ───────────────────────────────────────────────────────

  test("(a) moving onto Threshold starts combat: attacker AND defender each get [1] immediately — no chain item, P1 (attacker) holds Focus (429.2, 166.1)", async () => {
    const game = await board().build();
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    await game.p1.move("attacker", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(1);
    expect(game.p2.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("attacker").combatRole).toBe("attacker");
    expect(game.state("defender").combatRole).toBe("defender");
  });

  test("(a) with Focus P1 exhausts Scorn: +[1] at once, no chain item, Focus does not pass (429.2.a); pool now reads 2", async () => {
    const game = await board().build();
    await game.p1.move("attacker", "bf1");
    expect(game.p1.can("activate", "scorn")).toBe(true);
    await game.p1.activate("scorn");
    expect(game.state("scorn").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(2);
    expect(game.p2.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(a) everyone passes, 3 kills 2, P1 conquers bf1 — and NEITHER pool is emptied by the showdown/combat ending: P1 2, P2 1 (167 / 316.3 / 317.2.d are the only empties)", async () => {
    const game = await board().build();
    await attackAddAndConquer(game);
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.locationOf("attacker")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active) ?? false).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.p2.energy()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) what the 2 energy buys in Neutral Open ───────────────────────────────────────────────

  test("(b) Neutral Open, energy()==2: only the 1-cost unit and the 1-cost Action spell are enumerated; the 2-costs would need Scorn's showdown-only energy and are absent / rejected", async () => {
    const game = await board().build();
    await attackAddAndConquer(game);
    expect(game.p1.energy()).toBe(2);
    expect(playableKeys(game)).toEqual(["spell1", "unit1"]);
    expect(game.p1.can("play", "unit1")).toBe(true);
    expect(game.p1.can("cast", "spell1")).toBe(true);
    expect(game.p1.can("play", "unit2")).toBe(false);
    expect(game.p1.can("cast", "spell2")).toBe(false);
    await expect(game.p1.play("unit2", { to: "base" })).rejects.toThrow();
    await expect(game.p1.cast("spell2")).rejects.toThrow();
    expect(game.p1.energy()).toBe(2); // nothing was paid on spec
  });

  test("(b) playing the 1-cost unit debits the UNRESTRICTED energy (444.1): energy()==1 is the showdown-only point, so nothing costing ≥1 is playable outside a showdown", async () => {
    const game = await board().build();
    await attackAddAndConquer(game);
    await game.p1.play("unit1", { to: "base" });
    await game.settle();
    expect(game.zoneOf("unit1")).toBe("base");
    expect(game.p1.energy()).toBe(1);
    expect(playableKeys(game)).toEqual([]);
    expect(game.p1.can("cast", "spell1")).toBe(false);
    await expect(game.p1.cast("spell1")).rejects.toThrow();
  });

  // ── (c) a NON-combat showdown satisfies "during showdowns" ───────────────────────────────────

  test("(c) moving the scout onto empty bf2 opens a Non-Combat Showdown with P1 holding Focus (316.8.b.1); Threshold does not trigger (no combat, not 'here') — pools unchanged, chain empty", async () => {
    const game = await board().build();
    await attackAddAndConquer(game);
    await game.p1.move("scout", "bf2");
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bf2", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(2);
    expect(game.p2.energy()).toBe(1);
    expect(game.state("scout").combatRole).not.toBe("attacker");
  });

  test("(c) inside that showdown the 2-cost [Action] spell IS enumerated (both energies spendable), the 1-cost spell too; the 2-cost UNIT is not (no Action/Reaction timing)", async () => {
    const game = await board().build();
    await attackAddAndConquer(game);
    await game.p1.move("scout", "bf2");
    expect(playableKeys(game)).toEqual(["spell1", "spell2"]);
    expect(game.p1.can("cast", "spell2")).toBe(true);
    expect(game.p1.can("play", "unit2")).toBe(false);
    expect(game.p1.can("play", "unit1")).toBe(false);
  });

  test("(c) casting the 2-cost spell there spends BOTH points (free + showdown-only): energy()==0, spell resolves (draw 1) and is trashed", async () => {
    const game = await board().build();
    await attackAddAndConquer(game);
    await game.p1.move("scout", "bf2");
    const hand = game.p1.hand().length;
    await game.p1.cast("spell2");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spell2", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("spell2")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.p1.energy()).toBe(0);
  });

  test("(c) if P1 just passes instead, P1 conquers bf2 (2 points) and the pool STILL reads 2 afterwards; P2 still 1", async () => {
    const game = await board().build();
    await attackAddAndConquer(game);
    await game.p1.move("scout", "bf2");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.p2.energy()).toBe(1);
  });

  // ── (d) P2's Threshold energy: usable during P1's turn, gone at end of turn ─────────────────

  test("(d) P2's [1] is ordinary energy during P1's turn: when Focus reaches P2 in the bf2 showdown, P2's 1-cost Reaction spell is enumerated and castable with it", async () => {
    const game = await board().build();
    await attackAddAndConquer(game);
    await game.p1.move("scout", "bf2");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.energy()).toBe(1);
    expect(playableKeys(game, "p2")).toEqual(["p2react"]);
    const hand = game.p2.hand().length;
    await game.p2.cast("p2react");
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("p2react")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand - 1 + 1);
    expect(game.p1.energy()).toBe(2); // P1's pool untouched by P2's spend
  });

  test("(d) end of P1's turn empties EACH player's pool (317.2.d): during P2's Beginning Phase — before 316.3 could apply — P1 and P2 both read 0; P2's Main Phase then opens at 0", async () => {
    const game = await board().unit(P2, "base", DAWN_WATCHER, "dawn").build();
    await attackAddAndConquer(game);
    expect(game.p1.energy()).toBe(2);
    expect(game.p2.energy()).toBe(1);
    await game.p1.endTurn();
    // Paused in P2's Beginning Phase on the Dawn Watcher trigger.
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dawn", triggered: true })]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
    expect(game.p1.energy()).toBe(0);
  });

  test("(d) P1's unspent showdown-only [1] leaves no earmark behind: on P1's NEXT turn 2 freshly tapped energy plays the 2-cost unit in Neutral Open", async () => {
    const game = await board().build();
    await attackAddAndConquer(game);
    await game.p1.play("unit1", { to: "base" }); // burn the free point; the showdown-only one floats
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    await game.advanceToTurnOf(P2);
    expect(game.p1.energy()).toBe(0);
    await game.advanceToTurnOf(P1);
    expect(game.p1.energy()).toBe(0);
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "unit2")).toBe(true);
    await game.p1.play("unit2", { to: "base" });
    await game.settle();
    expect(game.zoneOf("unit2")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
