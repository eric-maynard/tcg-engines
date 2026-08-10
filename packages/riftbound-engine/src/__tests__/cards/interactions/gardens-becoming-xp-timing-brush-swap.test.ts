/**
 * Interaction: Gardens of Becoming (unl-213-219, Battlefield) 'Units here have "[Exhaust]: Gain 1 XP."'
 *   × Ride the Wind (ogn-173-298, Spell · Chaos · 2+[chaos] · Action) "Move a friendly unit and ready it."
 *   × Green Father (unl-195-219, Legend) "When you conquer or hold, you may exhaust me to replace that
 *     battlefield with a Brush battlefield token. (… It can be swapped back when scored.)"
 *
 * Question. P1's legend is Green Father. P2 controls Gardens of Becoming with a READY 2-Might unit D. On
 * P1's turn P1 plays Ride the Wind on its 4-Might X in base: X moves to the Gardens and is readied; a
 * combat follows.
 *  (a) Who has the granted "[Exhaust]: Gain 1 XP" — only the controller's D, or X too?
 *      → BOTH: the grant is an unconditional battlefield passive (170.8, no "while you control" clause);
 *        each copy is controlled by that UNIT's controller (191.4.a) — 190.6 governs the battlefield's own
 *        abilities, not abilities it grants.
 *  (b) During the combat showdown can P2 exhaust D for XP with Focus? Can P1 exhaust X?
 *      → Neither: activated abilities need the controller's turn AND a (Neutral) Open State (381,
 *        310.1.a); a Showdown is 310.3/310.4. P2: not its turn. P1: showdown in progress.
 *  (c) X kills D, P1 conquers, declines Green Father — can P1 exhaust the still-ready X for XP now?
 *      → Yes: Neutral Open on P1's turn, X ready (Ride the Wind readied it; combat does not exhaust) and at
 *        the Gardens; it uses the chain (P2 gets priority) and P1 gains 1 XP.
 *  (d) P1 instead exhausts Green Father: the Brush token is created in the Gardens' place (438.1) — same
 *      slot, same controller P1, already scored this turn (438.1.a), X does not move (652.2.b); Gardens
 *      goes to Banishment as Replaced (438.5); its continuous grant ends at once (652.2.c) so X LOSES the
 *      ability; Brush's +1 is only for Bird/Cat/Dog/Poro/Ivern (187.8). When P1 later scores at the Brush
 *      it may swap Gardens back (438.7.b) and units there regain the ability.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GARDENS = "unl-213-219";
const RIDE_THE_WIND = "ogn-173-298";
const GREEN_FATHER = "unl-195-219";

function board() {
  return scenario()
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("gardens", { controller: P2, def: GARDENS, inert: false })
    .unit(P2, "gardens", { might: 2, name: "D" }, "d")
    .unit(P1, "base", { might: 4, name: "X" }, "x")
    .hand(P1, RIDE_THE_WIND, "ride")
    .resources(P1, { energy: 2, power: { chaos: 1 } });
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** The activated-ability option `seat` currently has on `unit`, if any. */
function xpOption(game: Game, seat: "p1" | "p2", unit: string) {
  return game[seat].legal().find((o) => o.moveId === "activateAbility" && o.card === unit);
}

/** The battlefield `unit` stands on, whatever its slot key currently is. */
function battlefieldUnder(game: Game, unit: string) {
  const id = game.locationOf(unit) as string;
  return { contested: game.gameState.battlefields[id]?.contested, controller: game.gameState.battlefields[id]?.controller, id, name: game.state(id).name };
}

/** Cast Ride the Wind on X; both pass; X lands (readied) at the Gardens and the combat showdown opens with P1 holding Focus. */
async function rideIntoGardens(game: Game): Promise<void> {
  await game.p1.cast("ride", { targets: "x" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "destination") {
    await game.p1.pick("battlefield-gardens");
  }
  expect(game.locationOf("x")).toBe("gardens");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "gardens", focusPlayer: P1, isCombatShowdown: true });
}

/** …then both pass Focus: 4 v 2 kills D, P1 conquers; Green Father asks. Answer it and settle. */
async function conquerAndAnswerGreenFather(game: Game, yes: boolean): Promise<void> {
  await rideIntoGardens(game);
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("d")).toBe("trash");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gf" } });
  await (yes ? game.p1.yes() : game.p1.no());
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

describe("Gardens of Becoming × Ride the Wind × Green Father — who has the XP ability, when, and what a Brush swap does to it", () => {
  // ---------------------------------------------------------------- (a)
  test("(a) the grant is for EVERY unit here and each copy belongs to that unit's controller (170.8 / 191.4.a): P2's D offers it to P2 on P2's turn; a P1 unit parked at the P2-controlled Gardens offers it to P1 on P1's turn; neither player can use the other's unit", async () => {
    const p2Turn = await board().active(P2).build();
    expect(xpOption(p2Turn, "p2", "d")).toBeDefined();
    expect(xpOption(p2Turn, "p1", "d")).toBeUndefined();

    // P1's X sitting at the Gardens while P2 is still the battlefield's controller: X has the ability, controlled by P1.
    const parked = await scenario()
      .legend(P1, GREEN_FATHER, "gf")
      .battlefield("gardens", { controller: P2, def: GARDENS, inert: false })
      .unit(P1, "gardens", { might: 4, name: "X" }, "x")
      .unit(P2, "base", { might: 2, name: "D" }, "d")
      .build();
    expect(parked.gameState.battlefields.gardens?.controller).toBe(P2);
    expect(xpOption(parked, "p1", "x")).toBeDefined();
    expect(xpOption(parked, "p2", "x")).toBeUndefined();
  });

  test("(a) Ride the Wind resolves: X is MOVED to the Gardens and READIED, the battlefield becomes contested and a combat showdown opens (P1 = Attacker with Focus, D = Defender)", async () => {
    const game = await board().build();
    await rideIntoGardens(game);
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.state("x")).toMatchObject({ combatRole: "attacker", isReady: true, location: "gardens" });
    expect(game.state("d")).toMatchObject({ combatRole: "defender", isReady: true });
    expect(battlefieldUnder(game, "x")).toMatchObject({ contested: true, controller: P2, id: "gardens" });
  });

  // ---------------------------------------------------------------- (b)
  test("(b) inside the combat showdown NEITHER ready unit can cash in (381 / 310.1.a): P1 with Focus on its own turn is offered no activation for X; after P1 passes, P2 with Focus is offered none for D (not its turn either)", async () => {
    const game = await board().build();
    await rideIntoGardens(game);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("x").isReady).toBe(true);
    expect(xpOption(game, "p1", "x")).toBeUndefined();
    expect(game.p1.legal().some((o) => o.moveId === "activateAbility")).toBe(false);
    await expect(game.p1.activate("x", 1)).rejects.toThrow();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("d").isReady).toBe(true);
    expect(xpOption(game, "p2", "d")).toBeUndefined();
    expect(game.p2.legal().some((o) => o.moveId === "activateAbility")).toBe(false);
    await expect(game.p2.activate("d", 1)).rejects.toThrow();
    expect(game.p1.xp() + game.p2.xp()).toBe(0);
  });

  // ---------------------------------------------------------------- (c)
  test("(c) X 4 v D 2: D dies, P1 conquers the Gardens for 1 point; Green Father's 'you may exhaust me' is asked and DECLINED — the legend stays ready, the slot is still Gardens of Becoming, nothing banished", async () => {
    const game = await board().build();
    await conquerAndAnswerGreenFather(game, false);
    expect(game.p1.points()).toBe(1);
    expect(game.state("gf").isReady).toBe(true);
    expect(battlefieldUnder(game, "x")).toEqual({ contested: false, controller: P1, id: "gardens", name: "Gardens of Becoming" });
    expect(game.cardsAt("banishment")).toEqual([]);
    expect(showdown(game)).toBeUndefined();
    expect(game.chain()).toEqual([]);
  });

  test("(c) …and now, Neutral Open on P1's turn with X still READY at the Gardens (combat does not exhaust), P1 may activate X's granted ability: X exhausts as the cost, the item uses the chain (P2 gets priority), and P1 — not P2 — gains exactly 1 XP", async () => {
    const game = await board().build();
    await conquerAndAnswerGreenFather(game, false);
    expect(game.state("x")).toMatchObject({ combatRole: null, isReady: true, location: "gardens" });
    const opt = xpOption(game, "p1", "x");
    expect(opt).toBeDefined();
    await game.p1.choose(opt!.key);
    expect(game.state("x").isExhausted).toBe(true); // cost paid on activation
    expect(game.p1.xp()).toBe(0); // not yet
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, triggered: false })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
    expect(xpOption(game, "p1", "x")).toBeUndefined(); // exhausted: cannot pay again
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (d)
  test("(d) Green Father ACCEPTED: the legend exhausts and the slot X stands on is now a Brush token — same slot id, controller P1, not contested, X did not move (438.1 / 652.2.b); the printed Gardens sits in banishment as 'Replaced' (438.5); the point already scored stands and no extra point appears", async () => {
    const game = await board().build();
    await conquerAndAnswerGreenFather(game, true);
    expect(game.state("gf").isExhausted).toBe(true);
    expect(battlefieldUnder(game, "x")).toEqual({ contested: false, controller: P1, id: "gardens", name: "Brush" });
    expect(game.zoneOf("x")).toBe("battlefield-gardens");
    expect(game.cardsAt("banishment").map((id) => game.state(id).name)).toEqual(["Gardens of Becoming"]);
    expect(game.p1.points()).toBe(1);
    expect(game.battlefields()).toHaveLength(1); // replaced in place, not added
  });

  test("(d) the Gardens' continuous grant ends immediately (652.2.c): the READY X on the Brush has NO '[Exhaust]: Gain 1 XP' any more; and Brush's own +1 Might is only for Bird/Cat/Dog/Poro/Ivern (187.8) — tagless X stays 4", async () => {
    const game = await board().build();
    await conquerAndAnswerGreenFather(game, true);
    expect(game.state("x").isReady).toBe(true);
    expect(xpOption(game, "p1", "x")).toBeUndefined();
    expect(game.p1.legal().some((o) => o.moveId === "activateAbility")).toBe(false);
    await expect(game.p1.activate("x", 1)).rejects.toThrow();
    expect(game.state("x").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });

  test("(d) Gardens CAN come back (438.7.b): P1 holds the Brush at the start of its next turn (+1), declines Green Father, accepts the Brush's 'swap back' — the slot is Gardens of Becoming again under P1, banishment is empty, and the ready X there regains '[Exhaust]: Gain 1 XP' and can cash it in", async () => {
    const game = await board().build();
    await conquerAndAnswerGreenFather(game, true);
    await game.advanceTurn(); // P1 ends → P2's turn (does nothing)
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.endTurn(); // → P1's Beginning Phase: hold at the Brush
    expect(game.turnPlayer()).toBe(P1);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gf" } });
    await game.p1.no();
    await game.settle();
    const brushAsk = game.decision();
    expect(brushAsk).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(brushAsk?.source?.cardId).toBe(game.locationOf("x")); // the Brush token X is standing on
    await game.p1.yes();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2); // conquer (turn 2) + hold (now)
    expect(battlefieldUnder(game, "x")).toMatchObject({ contested: false, controller: P1, name: "Gardens of Becoming" });
    expect(game.battlefields().map((id) => game.state(id).name)).toEqual(["Gardens of Becoming"]);
    expect(game.cardsAt("banishment")).toEqual([]);
    // the grant is live again for the unit that never left the slot
    expect(game.state("x").isReady).toBe(true);
    const opt = xpOption(game, "p1", "x");
    expect(opt).toBeDefined();
    await game.p1.choose(opt!.key);
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.state("x").isExhausted).toBe(true);
  });
});
