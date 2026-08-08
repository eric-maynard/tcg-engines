/**
 * Shadow Order Disciple — ven-095-166 · Unit · Chaos · 2 energy · 2 Might
 *
 *   When I move, you may [Burn 1] to give me +1 [Might] this turn.
 *   (To Burn 1, put the top card of your Main Deck into your trash.)
 *
 * Head-judge notes (the tricky spots this file pins down):
 *  1. "When I move" is ANY move of this unit (446.1): base→battlefield, battlefield→base, and being
 *     moved by an OPPONENT's Charm on their turn — the trigger is still controlled (and the "you may"
 *     answered) by the Disciple's controller. Other units moving is irrelevant. There is no
 *     "first time each turn": a second move the same turn (Twilight Step) triggers again and stacks.
 *  2. "[Burn 1] to …" is a cost within instructions right after "you may" (383.3.b): Burn exactly the
 *     TOP card of your Main Deck; declining burns nothing and gives nothing. With an EMPTY Main Deck the
 *     cost cannot be paid (cf. 414.4/416.3/422.3) — no +1, and no Burn Out point for the opponent.
 *  3. Moves don't use the chain but the trigger does (446.3.c / 383.3); on an attack the pending
 *     combat only opens once the chain is empty (460), so the +1 lands BEFORE combat damage: a 2-vs-2
 *     trade becomes a 3-vs-2 win. Declined, it is the plain trade.
 *  4. "+1 [Might] this turn" expires at end of turn (across game.advanceTurn()).
 *  5. Engine status: the effect parsed as `{type:"raw"}` — the trigger and the opt-in prompt exist,
 *     but accepting does nothing (no burn, no Might) → BUG tests below.
 */

import { describe, expect, test } from "bun:test";
import type { Game, YesNoDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-095-166";
const UNIT = "ogn-175-298"; // Shipyard Skulker — deck fodder with a known identity
const SPELL = "ogn-004-298"; // Cleave — deck fodder
const CHARM = "ogn-043-298"; // Calm spell · 1 + [calm] · Move an enemy unit.
const TWILIGHT_STEP = "ven-105-166"; // Chaos spell · 2 + [chaos] · Move a unit with 3 [Might] or less.

function board(opts: { foe?: number } = {}) {
  const b = scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: opts.foe === undefined ? null : P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", CARD, "sod")
    .unit(P1, "base", { might: 2, name: "Other" }, "other")
    .deck(P1, [UNIT, SPELL, UNIT], ["top", "d2", "d3"])
    .deck(P2, [UNIT, UNIT], ["theirTop", "their2"]);
  return opts.foe === undefined ? b : b.unit(P2, "bf1", { might: opts.foe, name: "Sentry" }, "foe");
}

/** Drain priority; whenever the Disciple's "you may" is asked of P1, answer it. Stops at an open state. */
async function answerMay(game: Game, accept: boolean): Promise<YesNoDecision | undefined> {
  let asked: YesNoDecision | undefined;
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      asked = d;
      await (accept ? game.p1.yes() : game.p1.no());
      continue;
    }
    if (r.reason !== "unanswered") {
      break;
    }
  }
  return asked;
}

describe("Shadow Order Disciple (ven-095-166)", () => {
  test("registry payload should be an optional self-move trigger whose effect is 'burn 1 (cost) → +1 Might this turn to self', not a raw string", async () => {
    // Expected: a structured effect (cost burn 1 / modify-might +1 turn self). Actual: `{type:"raw", text:"[Burn 1] to give me …"}`.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 2, might: 2, name: "Shadow Order Disciple" });
    const abilities = def?.abilities as { type: string; optional?: boolean; trigger?: unknown; effect: { type: string } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ optional: true, trigger: { event: "move", on: "self" }, type: "triggered" });
    expect(abilities[0]?.effect.type).not.toBe("raw");
    expect(JSON.stringify(abilities[0])).toMatch(/"burn"|"mill"/);
    expect(JSON.stringify(abilities[0]?.effect)).toContain('"modify-might"');
  });

  test("cost: 2 energy, no power; enters the base exhausted as a 2-Might unit; playing is not moving (no trigger); 1 energy is one short", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "sod").build();
    await game.p1.play("sod");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("sod")).toBe("base");
    expect(game.state("sod")).toMatchObject({ isExhausted: true, might: 2 });
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
    expect((await scenario().resources(P1, { energy: 1, power: { chaos: 2 } }).hand(P1, CARD, "sod").build()).p1.can("play", "sod")).toBe(false);
  });

  test("moving puts ONE triggered item (controller P1) on the chain; P2 gets priority; the 'you may' is P1's to answer and nothing is burned before that", async () => {
    const game = await board().build();
    await game.p1.move("sod", "bf2");
    expect(game.locationOf("sod")).toBe("bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sod", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("top")).toBe("mainDeck");
    const asked = await answerMay(game, false);
    expect(asked).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("accepting burns exactly the TOP card of the Main Deck (top → trash, d2 now on top) and makes the Disciple 3 Might", async () => {
    // Expected: 440.1 — "top" moves deck→trash, deck shrinks by one, +1 Might. Actual: raw no-op.
    const game = await board().build();
    const size = game.p1.deck().length;
    await game.p1.move("sod", "bf2");
    await answerMay(game, true);
    expect(game.zoneOf("top")).toBe("trash");
    expect(game.p1.trash()).toEqual(["top"]);
    expect(game.p1.deck()).toHaveLength(size - 1);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.state("sod")).toMatchObject({ baseMight: 2, might: 3 });
    expect(game.state("other").might).toBe(2); // "me" only
    expect(game.p2.trash()).toEqual([]); // YOU burn, never the opponent
  });

  test("declining: nothing burned, still 2 Might, and the Disciple still conquers the open battlefield for 1 point", async () => {
    const game = await board().build();
    await game.p1.move("sod", "bf2");
    await answerMay(game, false);
    expect(game.zoneOf("top")).toBe("mainDeck");
    expect(game.p1.trash()).toEqual([]);
    expect(game.state("sod").might).toBe(2);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'+1 [Might] this turn' — 3 Might for the rest of the turn, back to 2 once the turn ends", async () => {
    const game = await board().build();
    await game.p1.move("sod", "bf2");
    await answerMay(game, true);
    expect(game.state("sod").might).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sod").might).toBe(2);
    expect(game.zoneOf("top")).toBe("trash"); // the burn is permanent
  });

  test("460 — on an attack the +1 lands before combat: 2-Might Disciple burns to 3, kills the 2-Might Sentry, survives and conquers", async () => {
    const game = await board({ foe: 2 }).build();
    await game.p1.move("sod", "bf1");
    // 401.1 / 323.13 — the move trigger makes this a Closed State: the Combat is only Staged
    // (no designation yet) and begins once the trigger has resolved.
    expect(game.state("sod").combatRole).toBeNull();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    await answerMay(game, true);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("sod")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toEqual(["top"]);
  });

  test("negative space — the same attack DECLINED is a plain 2-vs-2 trade: both die, bf1 is left uncontrolled, no point, no burn", async () => {
    const game = await board({ foe: 2 }).build();
    await game.p1.move("sod", "bf1");
    await answerMay(game, false);
    await game.settle();
    expect(game.zoneOf("sod")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("top")).toBe("mainDeck");
  });

  test("negative space — ANOTHER friendly unit or an ENEMY unit moving triggers nothing", async () => {
    const game = await board().build();
    await game.p1.move("other", "bf2");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    const enemy = await scenario().active(P2).battlefield("bf1").unit(P1, "base", CARD, "sod").unit(P2, "base", { might: 2 }, "foe").build();
    await enemy.p2.move("foe", "bf1");
    expect(enemy.chain()).toHaveLength(0);
    await enemy.settle();
    expect(enemy.state("sod").might).toBe(2);
  });

  test("moved by the OPPONENT's Charm on their turn is still 'When I move': the trigger is P1's (controller) and P1 is the one asked", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1, power: { calm: 1 } }).hand(P2, CHARM, "charm").build();
    await game.p2.cast("charm", { targets: "sod" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("battlefield-bf2");
    }
    let asked: YesNoDecision | undefined;
    for (let i = 0; i < 8 && !asked; i++) {
      await game.settle();
      const d = game.decision();
      if (d?.kind === "yes-no") {
        asked = d;
      }
    }
    expect(game.locationOf("sod")).toBe("bf2");
    expect(asked).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sod" } });
    await game.p1.no();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
  });

  test("Charm-moved on the opponent's turn and accepted → P1 (not P2) burns their top card and the Disciple is 3 Might during P2's turn", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1, power: { calm: 1 } }).hand(P2, CHARM, "charm").build();
    await game.p2.cast("charm", { targets: "sod" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("battlefield-bf2");
    }
    await answerMay(game, true);
    expect(game.p1.trash()).toEqual(["top"]);
    expect(game.p2.trash()).toEqual(["charm"]);
    expect(game.state("sod").might).toBe(3);
  });

  test("no 'first time' limit: a second move the same turn (Twilight Step, bf2 → bf1) puts the trigger on the chain again", async () => {
    const game = await board().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, TWILIGHT_STEP, "step").build();
    await game.p1.move("sod", "bf2");
    await answerMay(game, false);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    await game.p1.cast("step", { targets: "sod" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf1");
    // rule 355.4: the destination is chosen as Twilight Step is played; the move happens at resolution,
    // so pass the priority window before checking the location and the re-triggered ability.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("sod")).toBe("bf1");
    expect(game.chain()).toEqual(expect.arrayContaining([expect.objectContaining({ cardId: "sod", triggered: true })]));
    const asked = await answerMay(game, false);
    expect(asked?.seat).toBe(P1);
  });

  test("two accepted moves in one turn stack: burn 2 cards total (top, d2) and the Disciple is 4 Might", async () => {
    const game = await board().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, TWILIGHT_STEP, "step").build();
    await game.p1.move("sod", "bf2");
    await answerMay(game, true);
    await game.p1.cast("step", { targets: "sod" });
    await game.settle();
    await game.p1.pick("battlefield-bf1");
    await answerMay(game, true);
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["top", "d2", "step"]));
    expect(game.state("sod").might).toBe(4);
  });

  test("empty Main Deck — the Burn cost cannot be paid: 'yes' must not be acceptable, no +1, and P2 gains no Burn Out point", async () => {
    // Expected: canAccept false (or no prompt at all). Actual: the opt-in is offered with canAccept true.
    const game = await scenario().fillDecks(false).battlefield("bf2").unit(P1, "base", CARD, "sod").build();
    expect(game.p1.deck()).toEqual([]);
    await game.p1.move("sod", "bf2");
    let asked: YesNoDecision | undefined;
    for (let i = 0; i < 8 && !asked; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (d?.kind === "yes-no") {
        asked = d;
      } else if (r.reason !== "unanswered") {
        break;
      }
    }
    expect(asked === undefined || asked.canAccept === false).toBe(true);
    if (asked) {
      await game.p1.no();
    }
    await game.settle();
    expect(game.state("sod").might).toBe(2);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(1); // still conquered bf2
  });
});
