/**
 * Interaction: Targon's Peak (ogn-289-298) · Battlefield
 *     "When you conquer here, ready up to 2 runes at the end of this turn."
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2 + [chaos] · [Action] "Move a friendly unit and ready it."
 *   × Stalwart Poro (ogn-052-298) · Unit · Calm · 2 · 2 Might · [Shield] (+1 Might while I'm a defender)
 *   (+ vanilla units: P1's X (4) and Y (2), P2's F (5).)
 *
 * Question: P1's turn. P2 controls Targon's Peak with a Stalwart Poro; battlefield B is open; P2 has a ready
 * 5-Might F in base and Ride the Wind in hand. P1's X standard-moves to the Peak, wins the combat and
 * conquers; the conquer trigger resolves for P1. Later this turn P1's Y moves to B; in that non-combat
 * showdown P2 plays Ride the Wind moving F from base to the Peak. After B resolves, combat at the Peak: F
 * kills X and P2 conquers the Peak on P1's turn. At the end of P1's turn, who readies runes from Targon's
 * Peak — P1 (no longer the controller), P2 (new controller), both, or neither?
 *
 * Rules: 190.6 / 190.6.a / 190.6.d (a battlefield's abilities are controlled by — and "you" means — its
 * controller at that moment), 191.4 / 191.4.a / 191.4.b (a change of control of an ability's source does not
 * change control of the ability or of an effect it already created), 190.4, 190.3.a.1 (arriving where you
 * don't control applies Contested), 323.9 / 323.13 (combat staged at cleanup; begins at the next Neutral
 * Open cleanup), 460 (only one showdown at a time), 466.5 / 466.5.d / 466.5.e (establish control → conquer,
 * scoring on the opponent's turn is fine once per battlefield per turn).
 *
 * Expected: BOTH, each from their own resolved trigger. P1's conquer trigger was P1's (P1 controlled the
 * Peak then) and created a delayed "ready up to 2 runes at end of this turn" effect for P1; P2's later
 * conquer trigger is P2's and creates a second one for P2. At the end of P1's turn P1 readies up to 2 of
 * P1's runes (losing the Peak does not cancel it, P2 cannot redirect it) and P2 separately readies up to 2
 * of P2's runes.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TARGONS_PEAK = "ogn-289-298";
const RIDE_THE_WIND = "ogn-173-298";
const STALWART_PORO = "ogn-052-298";

/**
 * P1's turn 2. Targon's Peak (live text) is P2's with a Stalwart Poro; bfB is open. P2: F (5) ready in
 * base, Ride the Wind in hand with exactly its cost in the pool, 3 EXHAUSTED chaos runes. P1: X (4) and
 * Y (2) in base, 3 EXHAUSTED fury runes. No rune-deck filler, so rune counts stay put.
 */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("peak", { controller: P2, def: TARGONS_PEAK, inert: false })
    .battlefield("bfB", { controller: null })
    .unit(P2, "peak", STALWART_PORO, "poro")
    .unit(P2, "base", { might: 5, name: "Vanilla F" }, "F")
    .unit(P1, "base", { might: 4, name: "Vanilla X" }, "X")
    .unit(P1, "base", { might: 2, name: "Vanilla Y" }, "Y")
    .hand(P2, RIDE_THE_WIND, "ride")
    .runes(P1, "fury", 3, { exhausted: true })
    .runes(P2, "chaos", 3, { exhausted: true })
    .fillDecks({ main: 10, runes: 0 });
}

function showdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

/** (1) X attacks the Peak; everyone passes; combat resolves and the conquer trigger resolves → P1's open main phase. */
async function xConquersPeak(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("X", "peak");
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.gameState.battlefields.peak).toMatchObject({ contested: false, controller: P1 });
  return game;
}

/** (2) …Y walks to bfB; P1 passes Focus; P2 casts Ride the Wind on F choosing the Peak; both pass → it resolves. */
async function rideIntoPeak(): Promise<Game> {
  const game = await xConquersPeak();
  await game.p1.move("Y", "bfB");
  await game.p1.passFocus();
  await game.p2.cast("ride", { targets: "F" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-peak");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ride", controller: P2, targets: ["F"] })]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("ride")).toBe("trash");
  return game;
}

/** (2) …both pass Focus at bfB → bfB closes (P1 conquers it) and the staged combat at the Peak begins. */
async function peakCombatBegins(): Promise<Game> {
  const game = await rideIntoPeak();
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

/** (2) …both pass Focus at the Peak → F kills X; P2 conquers; P2's conquer trigger resolves → P1's open main phase. */
async function peakRetaken(): Promise<Game> {
  const game = await peakCombatBegins();
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.gameState.battlefields.peak).toMatchObject({ contested: false, controller: P2 });
  return game;
}

/** Is `d` a rune-choice prompt for `seat` listing only that seat's runes? */
// rule 355.7 — "ready up to 2 runes" has no friendly qualifier, so the prompt lists EVERY rune on the
// board; a seat's own trigger is recognised by its own runes being among the options.
function isRunePromptFor(game: Game, d: Decision | null, seat: string): d is Extract<Decision, { kind: "pick" }> {
  if (d?.kind !== "pick" || d.seat !== seat || d.options.length === 0) {
    return false;
  }
  const mine = new Set(game.seat(seat).runes());
  return d.options.some((o) => mine.has(o.card ?? o.key));
}

/** The keys of `seat`'s OWN runes in a rune prompt — what a sane player picks. */
function ownRuneKeys(game: Game, d: Extract<Decision, { kind: "pick" }>, seat: string): string[] {
  const mine = new Set(game.seat(seat).runes());
  return d.options.filter((o) => mine.has(o.card ?? o.key)).map((o) => o.key);
}

/**
 * End P1's turn and walk the Ending Step by hand: every rune prompt is answered by its own seat taking 2,
 * every priority window is passed. Returns which seats were asked, in order, and stops as soon as the turn
 * has passed to P2 (before touching anything in P2's turn).
 */
async function endP1TurnAnsweringRunePrompts(game: Game): Promise<string[]> {
  const asked: string[] = [];
  await game.p1.endTurn();
  for (let i = 0; i < 24 && game.turnPlayer() === P1; i++) {
    const d = game.decision();
    if (isRunePromptFor(game, d, P1) || isRunePromptFor(game, d, P2)) {
      asked.push(d.seat);
      await game.seat(d.seat).pick(...ownRuneKeys(game, d, d.seat).slice(0, Math.min(2, d.max)));
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if ((await game.settle()).reason === "unanswered") {
      break;
    }
  }
  return asked;
}

describe("Targon's Peak conquered by P1, retaken by P2 the same turn — who readies runes at end of turn?", () => {
  // ---- (1) P1 takes the Peak ------------------------------------------------------------------------------

  test("(1) X (4) into Stalwart Poro (2 + Shield 1 = 3 as a defender): the Poro dies, X survives and is healed; P1 establishes control → conquers the Peak, +1 (466.5)", async () => {
    const game = await board().build();
    await game.p1.move("X", "peak");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "peak", focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 3 }); // Shield is live while defending
    expect(game.state("X")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("X")).toMatchObject({ damage: 0, location: "peak" });
    expect(game.gameState.battlefields.peak).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("(1) the Peak's conquer trigger is controlled by the battlefield's controller at that moment — P1 (190.6.a): it goes on the chain as P1's item and resolves creating a delayed effect for P1; nothing is chosen or readied now (355.5.b)", async () => {
    const game = await board().build();
    await game.p1.move("X", "peak");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat resolves → conquer → trigger
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p2.runes({ ready: true })).toEqual([]);
    expect(game.gameState.playerDelayedTriggers ?? []).toEqual([
      expect.objectContaining({ playerId: P1, sourceCardId: "peak", trigger: expect.objectContaining({ event: "end-of-turn" }) }),
    ]);
  });

  // ---- (2) P2 rides F into the Peak during the showdown at B --------------------------------------------------

  test("(2) Y → bfB opens a NON-combat showdown at bfB with P1's Focus; Ride the Wind ([Action]) is not castable by P2 until P2 holds Focus", async () => {
    const game = await xConquersPeak();
    await game.p1.move("Y", "bfB");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.p2.can("cast", "ride")).toBe(false);
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.p2.can("cast", "ride")).toBe(true);
  });

  test("(2) Ride the Wind targets F (P2's only unit) and offers the Peak as a destination; it resolves: F is AT the Peak and READY; F's controller does not control the Peak → P2 applies Contested (190.3.a.1); the Peak is still P1's", async () => {
    const game = await xConquersPeak();
    await game.p1.move("Y", "bfB");
    await game.p1.passFocus();
    const targets = game.p2.option("cast", "ride")?.fields.find((f) => f.name === "targets");
    expect([...new Set((targets?.options ?? []).flat() as string[])]).toEqual(["F"]);
    await game.p2.cast("ride", { targets: "F" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-peak");
    await game.p2.pick("battlefield-peak");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("F")).toMatchObject({ controller: P2, isReady: true, location: "peak" });
    expect(game.gameState.battlefields.peak).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("(2) after Ride resolves the combat at the Peak is only STAGED — bfB's showdown is still the one in progress (460, 323.9): bfB contested / showdown ongoing / uncontrolled; Peak P1's / contested by P2 / no designations yet", async () => {
    const game = await rideIntoPeak();
    expect(game.gameState.interaction?.showdownStack).toHaveLength(1);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfB", isCombatShowdown: false });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.gameState.battlefields.peak).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("F").combatRole).toBeNull();
    expect(game.state("X").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // Focus back with P1 at bfB
  });

  test("(2) bfB closes → P1 conquers bfB (+1 → 2); the Neutral Open cleanup then BEGINS the combat at the Peak (323.13) with P2 — who applied Contested — as the Attacker: F attacker, X defender, Focus P2", async () => {
    const game = await peakCombatBegins();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(2);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "peak", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.state("F").combatRole).toBe("attacker");
    expect(game.state("X").combatRole).toBe("defender");
    expect(game.turnPlayer()).toBe(P1); // all of this on P1's turn
  });

  test("(2) F 5 vs X 4: X dies, F survives with its 4 damage healed; P2 establishes control → conquers the Peak ON P1's TURN and scores (+1) (466.5.d/e); THIS conquer trigger is P2's chain item (190.6)", async () => {
    const game = await peakCombatBegins();
    await game.p2.passFocus();
    await game.p1.passFocus(); // combat resolves
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.state("F")).toMatchObject({ damage: 0, location: "peak" });
    expect(game.gameState.battlefields.peak).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p2.runes({ ready: true })).toEqual([]); // again: nothing readied now
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ---- (3) end of P1's turn -----------------------------------------------------------------------------------

  test("(3) two independent delayed 'ready up to 2 runes at end of this turn' effects now exist — P1's from the first conquer and P2's from the second (191.4.a)", async () => {
    const game = await peakRetaken();
    const delayed = game.gameState.playerDelayedTriggers ?? [];
    expect(delayed.map((t) => t.playerId).sort()).toEqual([P1, P2]);
    for (const t of delayed) {
      expect(t).toMatchObject({ sourceCardId: "peak", trigger: expect.objectContaining({ event: "end-of-turn" }) });
    }
  });

  test("(3) at the end of P1's turn P1 — who NO LONGER controls the Peak — is still asked and readies 2 of P1's OWN runes: losing the source does not cancel the effect, and P1 alone answers its own trigger (191.4.b, 392)", async () => {
    const game = await peakRetaken();
    expect(game.gameState.battlefields.peak?.controller).toBe(P2);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    const p1Runes = game.p1.runes().sort();
    let p1Offer: string[] = [];
    await game.p1.endTurn();
    for (let i = 0; i < 24 && game.turnPlayer() === P1; i++) {
      const d = game.decision();
      if (isRunePromptFor(game, d, P1)) {
        p1Offer = d.options.map((o) => o.card ?? o.key).sort();
        expect(d.max).toBe(2);
        expect(game.turnPlayer()).toBe(P1); // asked in P1's Ending Step
        await game.p1.pick(...ownRuneKeys(game, d, P1).slice(0, 2));
      } else if (isRunePromptFor(game, d, P2)) {
        await game.p2.pick(...ownRuneKeys(game, d, P2).slice(0, 2));
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else if ((await game.settle()).reason === "unanswered") {
        break;
      }
    }
    // rule 355.7 — the offer is every rune on the board (P2's included); P1's three are all there.
    expect(p1Offer).toEqual(expect.arrayContaining(p1Runes));
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2); // P2's Awaken does not touch P1's runes
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(1 + 1); // the conquer on P1's turn + Holding the Peak in P2's own Beginning Phase
  });

  test("(3) P2 is ALSO asked at the end of P1's turn (not P2's) and readies up to 2 of P2's runes from its own trigger — both players benefit, each from their own effect (190.6, 191.4.a, 317.1)", async () => {
    const game = await peakRetaken();
    expect(game.p2.runes({ ready: true })).toEqual([]);
    const asked = await endP1TurnAnsweringRunePrompts(game);
    expect(asked.sort()).toEqual([P1, P2]);
  });

  test("(3) 'No' side: P2 taking the Peak does not make P2 the 'you' of P1's already-resolved trigger — P2 answers only its OWN delayed trigger and P1's prompt still happens exactly once", async () => {
    const game = await peakRetaken();
    const asked = await endP1TurnAnsweringRunePrompts(game);
    expect(asked.filter((s) => s === P1)).toEqual([P1]);
    expect(asked.filter((s) => s === P2)).toEqual([P2]); // its own trigger, not a second bite at P1's
    expect(game.violations()).toEqual([]);
  });
});
