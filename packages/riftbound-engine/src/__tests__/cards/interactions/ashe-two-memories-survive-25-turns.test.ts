/**
 * Interaction: Ashe, Focused (unl-169-219) "When you play me, choose an opponent. They reveal their
 *   hand. Choose a card revealed this way and banish it. When they hold, return it to their hand
 *   (even if I'm no longer on the board)."
 *   × Skyfall of Areion (sfd-030-221) "[Equip] … My hold effects are also conquer effects, and vice
 *   versa."
 *
 * Question: P1 resolves Ashe twice on different turns, banishing a different card each time, and
 * both Ashes then die. P2 only ever CONQUERS — never Holds — for a long stretch of turns.
 *  (a) Do the two memories stay independent and alive with their sources gone, and does a third Ashe
 *      resolution create a THIRD memory rather than resetting or merging the earlier two?
 *  (b) On the first turn P2 finally Holds, do ALL the pending returns fire in that one Beginning
 *      Phase, and whose hand do the cards go to?
 *  (c) NO side: P2's unit wears Skyfall of Areion and P2 conquers — does that satisfy "when they hold"?
 *  (d) Does undo/redo across the Hold turn restore the memories and their linked card identities?
 *
 * Rules:
 *  - 389 / 390 — the return is a Delayed Ability generated when Ashe's play trigger resolves; it
 *    exists independently of its source, so the source dying neither cancels nor duplicates it.
 *  - 359.3.f.3.a / 359.3.f.3.b — its "it" is bound to the specific banished card at generation time,
 *    so two resolutions are two separate memories and a third resolution is a third.
 *  - 383.3.d — simultaneous triggered abilities one player controls are ordered by that player; both
 *    of these are controlled by P1 (Ashe's controller), not by the holding player.
 *  - 056 / 056.1 — the banished cards sit in their OWNER's banishment throughout.
 *  - 056.2 — a card may never be put into another player's non-board zone: they return to P2's hand.
 *  - 469.1 vs 469.2 — Conquer (gaining control) and Hold (keeping it through your Beginning Phase)
 *    are different player-level Score events; Skyfall rewrites the WEARER's effects, not the event.
 *  - 384.2 — a delayed ability triggers when its condition is met, once, and then is done.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ASHE = "unl-169-219"; // 5 + [order] · 4 Might champion
const SKYFALL = "sfd-030-221"; // Equipment · "my hold effects are also conquer effects, and vice versa"
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — the banished cards' identity does not matter

/** [Action] · free · "Deal 6 to a unit" — used only to kill P1's own Ashes. */
const ZAP6 = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Obliterate",
  rulesText: "[Action] Deal 6 to a unit.",
  timing: "action",
} as const;

const ASHE_COST = { energy: 5, power: { order: 1 } };

function board() {
  return scenario()
    .victoryScore(50) // the game must not end while the memories are being aged
    .fillDecks({ main: 60, runes: 30 }) // 25 turns of draws must not burn anyone out
    .battlefield("bf1", { controller: null })
    .resources(P1, ASHE_COST)
    .unit(P2, "base", { might: 2, name: "Holder" }, "holder")
    .hand(P2, SKULKER, "a")
    .hand(P2, SKULKER, "b")
    .hand(P2, SKULKER, "c")
    .hand(P1, ASHE, "ashe1")
    .hand(P1, ASHE, "ashe2")
    .hand(P1, ASHE, "ashe3")
    .hand(P1, ZAP6, "zap1")
    .hand(P1, ZAP6, "zap2")
    .hand(P1, ZAP6, "zap3");
}

/** Harness escape hatch: rune-by-rune payment is not what this test is about. */
async function fund(game: Game): Promise<void> {
  await game.p1.do("addResources", { energy: 5, power: { order: 1 } });
}

/** Play one Ashe, banish `victim` from P2's hand, then blow her up so her source is gone. */
async function asheBanishAndDie(game: Game, ashe: string, victim: string, zap: string): Promise<void> {
  await fund(game);
  await game.p1.play(ashe, { to: "base" });
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  await game.p1.pick(victim);
  await game.settle();
  expect(game.zoneOf(victim)).toBe("banishment");
  await game.p1.cast(zap, { targets: ashe });
  await game.settle();
  expect(game.zoneOf(ashe)).toBe("trash"); // 390 — the memory outlives its source
}

/** Advance whole turns without anyone doing anything. */
async function idle(game: Game, turns: number): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await game.advanceTurn();
  }
}

/** Advance to that seat's NEXT turn (always at least one turn forward). */
async function nextTurnOf(game: Game, seat: typeof P1 | typeof P2): Promise<void> {
  for (let guard = 0; guard < 8; guard++) {
    await game.advanceTurn();
    if (game.turnPlayer() === seat) {
      return;
    }
  }
  throw new Error(`never reached ${seat}'s turn`);
}

/** P2 walks the Holder onto bf1 on P2's own turn — a Conquer, not yet a Hold. */
async function p2Conquers(game: Game): Promise<void> {
  await nextTurnOf(game, P2);
  await game.p2.move("holder", "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
}

describe("Ashe, Focused × Skyfall of Areion — two memories that outlive their sources", () => {
  test("(a) two resolutions on different turns = two INDEPENDENT memories; both survive both Ashes dying and 25 turns in which P2 never Holds", async () => {
    const game = await board().build();
    await asheBanishAndDie(game, "ashe1", "a", "zap1");
    await game.advanceTurn(); // P1 → P2
    await game.advanceTurn(); // P2 → P1
    await asheBanishAndDie(game, "ashe2", "b", "zap2");

    expect(game.p2.banishment().sort()).toEqual(["a", "b"]);
    await idle(game, 25);
    expect(game.turnNumber()).toBeGreaterThanOrEqual(27);
    expect(game.isOver()).toBe(false);
    // Never Held ⇒ nothing returned, nothing merged, nothing lost (056/056.1).
    expect(game.p2.banishment().sort()).toEqual(["a", "b"]);
    expect(game.state("a").owner).toBe(P2);
    expect(game.state("b").owner).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) a THIRD Ashe resolution adds a third memory — it does not reset or merge the two already pending (359.3.f.3.a)", async () => {
    const game = await board().build();
    await asheBanishAndDie(game, "ashe1", "a", "zap1");
    await nextTurnOf(game, P1);
    await asheBanishAndDie(game, "ashe2", "b", "zap2");
    await nextTurnOf(game, P1);
    await asheBanishAndDie(game, "ashe3", "c", "zap3");
    expect(game.p2.banishment().sort()).toEqual(["a", "b", "c"]);

    // Now let P2 hold: all three fire, proving three live memories rather than one.
    await p2Conquers(game);
    await nextTurnOf(game, P2); // P2 keeps it through their Beginning Phase ⇒ Hold
    await game.settle();
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(game.violations()).toEqual([]);
  });

  test("(b) on P2's first Hold BOTH pending returns fire in that one Beginning Phase, are controlled by P1, and land in P2's hand (056.2)", async () => {
    const game = await board().build();
    await asheBanishAndDie(game, "ashe1", "a", "zap1");
    await nextTurnOf(game, P1);
    await asheBanishAndDie(game, "ashe2", "b", "zap2");
    await idle(game, 6);

    await p2Conquers(game); // Conquer — not yet a Hold
    expect(game.p2.banishment().sort()).toEqual(["a", "b"]);

    await nextTurnOf(game, P1);
    await game.p1.endTurn(); // step into P2's Beginning Phase, where P2 HOLDS bf1
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    const chain = game.chain();
    expect(chain).toHaveLength(2); // both memories, together, in one Beginning Phase
    expect(chain.every((i) => i.controller === P1)).toBe(true); // 383.3.d — P1's abilities, P1 orders them
    expect(chain.every((i) => i.triggered)).toBe(true);
    expect(game.p2.banishment().sort()).toEqual(["a", "b"]); // nothing has moved yet

    await game.settle();
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["a", "b"]));
    expect(game.p1.hand()).not.toContain("a"); // 056.2 — never into the other player's hand
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) 384.2: the memories are spent — a second Hold on a later turn returns nothing more", async () => {
    const game = await board().build();
    await asheBanishAndDie(game, "ashe1", "a", "zap1");
    await p2Conquers(game);
    await nextTurnOf(game, P2); // first Hold
    await game.settle();
    expect(game.p2.hand()).toContain("a");
    const handAfter = game.p2.hand().length;
    await nextTurnOf(game, P2); // second Hold
    await game.settle();
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.hand().length).toBe(handAfter + 1); // only the Draw-step card
  });

  test("(c) NO side: a CONQUER never satisfies 'when they hold' — even with Skyfall of Areion on the conquering unit (469.1 vs 469.2)", async () => {
    const game = await board().gear(P2, SKYFALL, "skyfall").build();
    await asheBanishAndDie(game, "ashe1", "a", "zap1");
    await nextTurnOf(game, P2);
    await game.p2.do("addResources", { energy: 4, power: { fury: 2 } });
    await game.p2.do("equipCard", { equipmentId: "skyfall", unitId: "holder" });
    await game.settle();
    expect(game.state("holder").attachments).toContain("skyfall");

    await game.p2.move("holder", "bf1"); // Conquer, wearing Skyfall
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBeGreaterThan(0); // the Conquer really did Score
    // Skyfall rewrites the WEARER's hold/conquer effects; Ashe keys on the PLAYER holding.
    expect(game.p2.banishment()).toEqual(["a"]);
    expect(game.chain()).toEqual([]);

    await nextTurnOf(game, P2); // now a real Hold — and only now does it return
    await game.settle();
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.hand()).toContain("a");
    expect(game.violations()).toEqual([]);
  });

  test("(d) undo/redo across the Hold turn restores both memories and their linked card identities exactly", async () => {
    const game = await board().build();
    await asheBanishAndDie(game, "ashe1", "a", "zap1");
    await nextTurnOf(game, P1);
    await asheBanishAndDie(game, "ashe2", "b", "zap2");
    await p2Conquers(game);

    const beforeHold = game.snapshotHash();
    expect(game.p2.banishment().sort()).toEqual(["a", "b"]);
    await nextTurnOf(game, P2);
    await game.settle();
    const afterHold = game.snapshotHash();
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["a", "b"]));

    // Rewind back through the whole Hold turn: both memories must be pending again, same cards.
    for (let guard = 0; guard < 60 && game.canUndo() && game.snapshotHash() !== beforeHold; guard++) {
      expect(game.undo()).toBe(true);
    }
    expect(game.snapshotHash()).toBe(beforeHold);
    expect(game.p2.banishment().sort()).toEqual(["a", "b"]);
    expect(game.state("a").owner).toBe(P2);
    expect(game.state("b").owner).toBe(P2);

    // …and replaying gets the identical position, with the same two cards returned.
    for (let guard = 0; guard < 60 && game.canRedo() && game.snapshotHash() !== afterHold; guard++) {
      expect(game.redo()).toBe(true);
    }
    expect(game.snapshotHash()).toBe(afterHold);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["a", "b"]));
    expect(game.violations()).toEqual([]);
  });
});
