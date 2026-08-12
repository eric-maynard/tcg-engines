/**
 * Interaction: Rebuke (ogn-172-298) "[Action] Return a unit at a battlefield to its owner's hand."
 *           × Lilting Lullaby (unl-190-219) "[Reaction] Counter a spell. Its controller can't play
 *             spells this turn."
 *
 * Q: It is the OPPONENT's turn, no showdown, and their spell is pending on the Chain. You hold
 *    BOTH cards and can pay for both. Rebuke must be refused (and the refusal must SAY why —
 *    never a dead click); Lullaby, in the same hand at the same instant, must be playable. After
 *    Lullaby resolves, does the opponent's next spell click name the rider, or die silently?
 *
 * Rules:
 *   331.1.a    a loaded Chain is a Closed State — by default nothing may be played
 *   338.1.a.2  only a card that has (or will have) [Reaction] is legally timed in a Closed State
 *   159.2.a.1  [Action] extends play into showdown Open States ON TOP OF your own Open State
 *   159.2.b.2  [Reaction] may be played in any Open OR Closed State
 *   159.2.b.3  a Reaction played onto a loaded Chain goes above what is already there
 *   340.1      the Chain resolves LIFO — the newest item first
 *   054.1      a forbidding effect supersedes any permission ("can't" beats "can")
 *   339.2      a player always has Pass available; the action panel is never blank
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import type { PlayerId } from "@tcg/core";

const REBUKE = "ogn-172-298";
const LULLABY = "unl-190-219";

/** "[Action] Deal 1 to a unit." — the opponent's pending spell, and their next click. */
const ACTION_BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** "[Reaction] Deal 1 to a unit." — proves the rider beats even a legally-timed Reaction (054.1). */
const REACTION_BOLT = { ...ACTION_BOLT, name: "Test Flash", timing: "reaction" } as const;

/**
 * P2's turn. P1 holds Rebuke + Lullaby and the Power for both; P2 holds two spells.
 * `theirs`/`mine` are ordinary units at a battlefield so Rebuke has a legal object.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .unit(P2, "bf1", { might: 3, name: "Theirs" }, "theirs")
    .resources(P1, { energy: 4, power: { chaos: 2, rainbow: 2 } })
    .resources(P2, { energy: 3 })
    .hand(P1, REBUKE, "rebuke")
    .hand(P1, LULLABY, "lullaby")
    .hand(P2, ACTION_BOLT, "bolt")
    .hand(P2, ACTION_BOLT, "bolt2")
    .hand(P2, REACTION_BOLT, "flash");
}

/** P2 casts `bolt` at `mine` and hands priority over: the Chain is loaded and P1 is on the cursor. */
async function opponentSpellPending() {
  const game = await board().build();
  await game.p2.cast("bolt", { targets: "mine" });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  expect(game.chain()).toHaveLength(1);
  return game;
}

describe("Rebuke [Action] is blocked while Lilting Lullaby [Reaction] is legal, and the Lullaby rider blocks the next spell", () => {
  test("REFUSAL 1 — Chain loaded (Closed State): Rebuke is not enumerated, Lullaby is (331.1.a, 338.1.a.2, 159.2.b.2)", async () => {
    const game = await opponentSpellPending();
    const casts = game.p1.legal().filter((o) => o.verb === "cast");
    expect(casts.map((o) => o.card)).toEqual(["lullaby"]);
    expect(game.p1.can("cast", "rebuke")).toBe(false);
    expect(game.p1.can("cast", "lullaby")).toBe(true);

    // Clicking it changes NOTHING: the play is refused and the position is untouched.
    const before = game.stateHash();
    const r = await game.p1.try((p) => p.cast("rebuke", { targets: "theirs" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rebuke")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 2, rainbow: 2 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.stateHash()).toBe(before);
  });

  test("339.2 — the panel is never blank: Pass is offered alongside the one legal cast, before and after the refusal", async () => {
    const game = await opponentSpellPending();
    const d = game.decision() as ActionDecision;
    expect(d.kind).toBe("action");
    expect(d.seat).toBe(P1);
    expect(d.passKey).toBeDefined();
    expect(d.options.length).toBeGreaterThan(1);
    await game.p1.try((p) => p.cast("rebuke", { targets: "theirs" }));
    expect((game.decision() as ActionDecision).passKey).toBeDefined();
    expect(game.p1.legal().map((o) => o.verb)).toContain("passPriority");
  });

  // 331.1.a / 338.1.a.2 / 159.2.a.1 — a refused click carries the reason that refused it, so the
  // client can render it on the card. The enumerator emits the blocked card as an INVALID row
  // (`enumerateMoves(validOnly:false)`) and `playSpell.condition` names the timing on it.
  test("REFUSAL 1b — an illegally-timed [Action] is enumerated as an INVALID move whose reason names the timing (331.1.a, 338.1.a.2, 159.2.a.1)", async () => {
    const game = await opponentSpellPending();
    const rows = game.engine.enumerateMoves(P1 as PlayerId, { moveIds: ["playSpell"], validOnly: false });
    const rebukeRow = rows.find((m) => (m.params as { cardId?: string }).cardId === game.card("rebuke"));
    expect(rebukeRow).toBeDefined();
    expect(rebukeRow?.isValid).toBe(false);
    expect(String(rebukeRow?.validationError?.reason)).toMatch(/action|showdown|your turn/i);
  });

  test("REFUSAL 2 — the block is about TIMING, not the Chain: with the Chain empty on the opponent's Open main, Rebuke is still refused (159.2.a.1)", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P2);
    // P1 is not on the cursor at all in the opponent's Open State, and the [Action] is not legal
    // for them there: 159.2.a.1 extends [Action] only into SHOWDOWN Open States.
    expect(game.p1.can("cast", "rebuke")).toBe(false);
    const r = await game.p1.try((p) => p.cast("rebuke", { targets: "theirs" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rebuke")).toBe("hand");
  });

  test("YES side — the same Rebuke IS legal on the opponent's turn once a showdown is open (159.2.a.1)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .resources(P1, { energy: 4, power: { chaos: 2, rainbow: 2 } })
      .hand(P1, REBUKE, "rebuke")
      .autoProcedures(false)
      .build();
    await game.p2.move("raider", "bf1"); // opens a showdown at bf1; the mover holds Focus first
    expect(game.p1.can("cast", "rebuke")).toBe(false); // not P1's cursor yet
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "rebuke")).toBe(true);
    await game.p1.cast("rebuke", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("hand");
  });

  test("Lullaby goes ABOVE the pending spell and resolves first, countering it (159.2.b.3, 340.1)", async () => {
    const game = await opponentSpellPending();
    await game.p1.cast("lullaby", { targets: "bolt" });
    const chain = game.chain();
    expect(chain).toHaveLength(2);
    expect(chain[0]?.cardId).toBe(game.card("bolt")); // bottom — placed first
    expect(chain[1]?.cardId).toBe(game.card("lullaby")); // top — resolves first
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 2, rainbow: 0 } });

    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("lullaby")).toBe("trash");
    expect(game.state("mine").damage).toBe(0); // countered — the damage never happened
    expect(game.violations()).toEqual([]);
  });

  test("REFUSAL 3 — the rider forbids EVERY later spell of that controller this turn, [Action] and [Reaction] alike (054.1)", async () => {
    const game = await opponentSpellPending();
    await game.p1.cast("lullaby", { targets: "bolt" });
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.actingSeat()).toBe(P2);

    for (const card of ["bolt2", "flash"]) {
      expect(game.p2.can("cast", card)).toBe(false);
      const r = await game.p2.try((p) => p.cast(card, { targets: "mine" }));
      expect(r.ok).toBe(false);
      expect(game.zoneOf(card)).toBe("hand");
    }
    // The restriction is a NAMED fact of the state a client can render, keyed by seat and turn.
    expect((game.gameState as unknown as { cannotPlaySpellsThisTurn?: Record<string, number> }).cannotPlaySpellsThisTurn).toMatchObject({
      [P2]: game.turnNumber(),
    });
    // 339.2 — P2's panel is still not blank: they can act and end the turn.
    const d = game.decision() as ActionDecision;
    expect(d.seat).toBe(P2);
    expect(d.options.length).toBeGreaterThan(1);
    expect(d.endTurnKey ?? d.passKey).toBeDefined();
  });

  // 054.1 — the refusal the rider causes names the rider itself, so the player is told WHY their
  // spell will not go rather than getting a bare "condition not met".
  test("REFUSAL 3b — the rider's refusal names the restriction (054.1)", async () => {
    const game = await opponentSpellPending();
    await game.p1.cast("lullaby", { targets: "bolt" });
    await game.settle();
    const rows = game.engine.enumerateMoves(P2 as PlayerId, { moveIds: ["playSpell"], validOnly: false });
    const row = rows.find((m) => (m.params as { cardId?: string }).cardId === game.card("bolt2"));
    expect(row?.isValid).toBe(false);
    expect(String(row?.validationError?.reason)).toMatch(/spell/i);
    expect(String(row?.validationError?.reason)).toMatch(/can'?t|cannot|restrict/i);
  });

  test("the rider is 'this turn' only — next turn the same seat may cast again", async () => {
    const game = await opponentSpellPending();
    await game.p1.cast("lullaby", { targets: "bolt" });
    await game.settle();
    expect(game.p2.can("cast", "bolt2")).toBe(false);
    await game.advanceTurn(); // → P1's turn
    await game.advanceTurn(); // → P2's turn again
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.energy()).toBe(0);
    await game.p2.do("addResources", { energy: 1 });
    expect(game.p2.can("cast", "bolt2")).toBe(true);
  });
});
