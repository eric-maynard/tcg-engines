/**
 * Interaction: Swain's three-types-this-turn ledger, what counts as a "non-token gear", and whether
 * the ledger survives a turn boundary or a Bo3 game boundary.
 *   Swain, Visionary       (ven-173-166) · Champion Unit · Mind · 6 + [mind] · 6 Might —
 *     "[Vision] When I conquer, if you've played a non-token unit, a non-token gear, and a spell this
 *      turn, you score 1 point."
 *   Bottled Constellation  (ven-067-166) · Gear · Mind · 10 + [mind][mind] —
 *     "At the start of your Main Phase, you may kill 3 other friendly units and/or gear to score 1 point."
 *   Cleave                 (ogn-004-298) · Fury spell — the spell leg.
 *   Wages of Pain          (sfd-070-221) · Mind spell — "Deal 3 to a unit at a battlefield. Play a
 *     Gold gear token exhausted." — the spell leg whose ONLY gear is a token.
 *
 * Question: on one turn P1 plays Swain's three legs and conquers with Swain.
 *   YES  — is the extra point scored, and does the board agree the condition was met?
 *   NO a — a gear that was played on a PREVIOUS turn: what happens to the trigger, and is a point scored?
 *   NO b — a Gold gear TOKEN: does it fail "non-token gear"?
 *   NO c — does game 1's played-this-turn ledger leak into game 2 through "Continue to game 2"?
 *
 * Rules: 469.1 (Conquer = gaining control of a battlefield you have not yet Scored this turn),
 * 466.5.d (establishing Control results in a Conquer under that condition), 470 (a player may Score
 * once per battlefield per turn — the cap is on the SCORE, not on other points), 194.1.c (points
 * gained because a spell / triggered / activated ability said so are not Scored points, so they are
 * not capped by 470), 486.6 (Best of 3: players reset the game state between games), 355.8 (valid
 * choices for all targets before an ability goes on the chain), 358.3.a (an instruction that cannot
 * be performed is skipped on resolution — the item is still played and still resolves) and,
 * decisively for the NO sides, 383.2.a.1 (a conditional statement placed IMMEDIATELY after the
 * trigger condition is part of the TRIGGER CONDITION, so the ability is placed on the chain only
 * when it holds).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { concedeGame, voteContinue } from "../../../../../../apps/riftbound-app/server/match";
import { matchSummary } from "../../../../../../apps/riftbound-app/server/match-state";
import { createGameFromDecks, finalizePregame } from "../../../../../../apps/riftbound-app/server/pregame";
import type { GameSession } from "../../../../../../apps/riftbound-app/server/state";

const SWAIN = "ven-173-166";
const BOTTLED_CONSTELLATION = "ven-067-166";
const CLEAVE = "ogn-004-298";
const WAGES_OF_PAIN = "sfd-070-221";

const CHEAP_UNIT = { cardType: "unit", domain: "mind", energyCost: 1, might: 1, name: "Raven Acolyte" } as const;
const CHEAP_GEAR = { abilities: [], cardType: "gear", domain: "mind", energyCost: 1, name: "Raven Idol" } as const;

interface LedgerState {
  cardsPlayedThisTurn?: Record<string, number>;
  cardsPlayedIdsThisTurn?: Record<string, readonly string[]>;
}

/**
 * P1 has Swain ready in base, a second body to conquer with, and the three "legs" in hand. bf1 is
 * empty and nominally P2's (so walking in establishes Control); bf2 holds a wall Wages of Pain can
 * point at.
 */
function board() {
  return scenario()
    .victoryScore(8)
    .resources(P1, { energy: 20, power: { calm: 3, mind: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", SWAIN, "swain")
    .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
    .hand(P1, CHEAP_UNIT, "u")
    .hand(P1, CHEAP_GEAR, "g")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, WAGES_OF_PAIN, "wages");
}

/** Walk `unit` into the empty bf1 and stop with the conquer trigger sitting on the chain. */
async function conquerAndHold(game: Game, unit: string): Promise<void> {
  await game.p1.move(unit, "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
}

const ledger = (game: Game): readonly string[] => ((game.gameState as unknown as LedgerState).cardsPlayedIdsThisTurn?.[P1] ?? []);

describe("Swain's three-types ledger × Bottled Constellation × a Bo3 reset", () => {
  // ---- 1 / 2: the YES side ----------------------------------------------------------------------

  test("Swain is playable for 6 + [mind] and his conquer line rides on the card (466.5.d, 469.1)", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).hand(P1, SWAIN, "swain").build();
    expect(game.p1.can("play", "swain")).toBe(true);
    await game.p1.play("swain");
    expect(game.zoneOf("swain")).toBe("base");
    expect(game.state("swain").rulesText).toMatch(/When I conquer/);
  });

  test("YES: unit + gear + spell all played this turn → the conquer trigger is listed on the chain, and the conquer is worth 2 (469.1 score + 194.1.c ability point)", async () => {
    const game = await board().build();
    await game.p1.play("u");
    await game.settle({ policy: "first" });
    await game.p1.play("g");
    await game.settle({ policy: "first" });
    await game.p1.cast("cleave", { targets: "swain" });
    await game.settle({ policy: "first" });
    expect(ledger(game)).toEqual(["u", "g", "cleave"]);

    await conquerAndHold(game, "swain");
    // Control established → the battlefield is scored (469.1) and Swain's trigger is on the chain.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "swain", controller: P1, name: "Swain, Visionary", triggered: true })]);

    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(2); // the HUD ticks a second time, on resolution
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("470 caps the SCORE, not Swain's point: walking a second unit onto the same battlefield the same turn adds nothing", async () => {
    const game = await board().build();
    for (const [alias, act] of [["u", () => game.p1.play("u")], ["g", () => game.p1.play("g")], ["cleave", () => game.p1.cast("cleave", { targets: "swain" })]] as const) {
      await act();
      await game.settle({ policy: "first" });
      expect(game.zoneOf(alias)).not.toBe("hand");
    }
    await conquerAndHold(game, "swain");
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(2);

    // bf1 is already P1's and already Scored this turn: a second arrival scores nothing at all.
    await game.p1.move("runner", "bf1");
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(2);
  });

  // ---- 3: NO (a) — the gear was played on a previous turn ----------------------------------------

  test("NO (a): a gear already on the board (played an earlier turn) is not 'played this turn' — nothing reaches the chain and the conquer is worth exactly 1", async () => {
    // RULING-CONFLICT: one might expect the trigger to go on the chain and fizzle on resolution
    // (358.3.a). Rule 383.2.a.1 says otherwise, and the engine follows it: an "if …" clause placed
    // IMMEDIATELY after the trigger condition is part of the TRIGGER CONDITION, not the effect, so
    // the ability "will only be placed on the chain if" the clause holds when the condition is
    // fulfilled (the CR's Sona, Harmonious example; contrast Loose Cannon, whose "if" comes later and
    // therefore is part of the effect). Swain's "if you've played …" is immediately after "When I
    // conquer", so an unmet ledger means no chain item at all — the HUD tick is the conquer's alone.
    const game = await board().gear(P1, CHEAP_GEAR, "oldGear").build();
    await game.p1.play("u");
    await game.settle({ policy: "first" });
    await game.p1.cast("cleave", { targets: "swain" });
    await game.settle({ policy: "first" });
    expect(game.p1.gear()).toContain("oldGear"); // it IS in play…
    expect(ledger(game)).toEqual(["u", "cleave"]); // …but not in this turn's ledger

    await conquerAndHold(game, "swain");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.chain()).toEqual([]); // 383.2.a.1 — the condition was never fulfilled
    expect(game.p1.points()).toBe(1);
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("NO (a) control: playing that same gear THIS turn instead flips the same board to 2", async () => {
    const game = await board().build();
    for (const act of [() => game.p1.play("u"), () => game.p1.play("g"), () => game.p1.cast("cleave", { targets: "swain" })]) {
      await act();
      await game.settle({ policy: "first" });
    }
    await conquerAndHold(game, "swain");
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(2);
  });

  // ---- 4: NO (b) — a Gold gear TOKEN is not a "non-token gear" -----------------------------------

  test("NO (b): Wages of Pain supplies the spell leg and a Gold gear TOKEN — the token fails 'non-token gear', so the conquer is worth exactly 1", async () => {
    const game = await board().build();
    await game.p1.play("u");
    await game.settle({ policy: "first" });
    await game.p1.cast("wages", { targets: "wall" });
    await game.settle({ policy: "first" });

    const gold = game.p1.gear().find((id) => game.state(id).name === "Gold");
    expect(gold).toBeDefined();
    expect(game.state(gold as string).isToken).toBe(true);
    expect(game.state(gold as string).cardType).toBe("gear");
    expect(game.state("wall").damage).toBe(3);
    expect(ledger(game)).toEqual(["u", "wages"]); // the token's arrival is not a "play" by P1 of a card

    await conquerAndHold(game, "swain");
    // Same 383.2.a.1 shape as NO (a): the unmet leg keeps the ability off the chain entirely.
    expect(game.chain()).toEqual([]);
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(1);
  });

  test("NO (b) control: adding one real (non-token) gear on top of the same turn restores the bonus", async () => {
    const game = await board().build();
    for (const act of [() => game.p1.play("u"), () => game.p1.cast("wages", { targets: "wall" }), () => game.p1.play("g")]) {
      await act();
      await game.settle({ policy: "first" });
    }
    await conquerAndHold(game, "swain");
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(2);
  });

  // ---- 5: "this turn" resets at the turn boundary and again between games ------------------------

  test("'this turn' is emptied at every turn boundary: all three legs played, the turn goes around, and the next conquer is worth 1", async () => {
    const game = await board().build();
    for (const act of [() => game.p1.play("u"), () => game.p1.play("g"), () => game.p1.cast("cleave", { targets: "swain" })]) {
      await act();
      await game.settle({ policy: "first" });
    }
    expect(ledger(game)).toHaveLength(3);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(ledger(game)).toEqual([]);

    await conquerAndHold(game, "swain");
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(1);
  });

  test("NO (c): 'Continue to game 2' resets the whole game state (486.6) — the played-this-turn ledger, points and XP all start empty, while the MATCH score persists", async () => {
    const gameId = "swain-ledger-bo3";
    const session: GameSession = createGameFromDecks(
      { ...buildDefaultDeck(), sideboardCardIds: [] },
      { ...buildDefaultDeck("calm", "mind"), sideboardCardIds: [] },
      gameId,
      { firstPlayer: P1, gameMode: "match", names: { [P1]: "Alice", [P2]: "Bob" }, sandbox: false },
    );
    // Walk the pregame into a live game 1.
    for (let i = 0; i < 10 && session.pregame; i++) {
      const pg = session.pregame;
      if (pg.phase === "battlefield_select") {
        for (const seat of [P1, P2]) {
          if (!pg.battlefieldSelections[seat]) {
            const free = (pg.battlefieldOptions[seat] ?? []).find((id) => !(pg.battlefieldExcluded?.[seat] ?? []).includes(id));
            (session.pregame as { battlefieldSelections: Record<string, string> }).battlefieldSelections[seat] = free as string;
          }
        }
        pg.mulliganComplete.add(P1);
        pg.mulliganComplete.add(P2);
        finalizePregame(session);
      } else {
        pg.mulliganComplete.add(P1);
        pg.mulliganComplete.add(P2);
        finalizePregame(session);
      }
    }
    expect(session.engine.getState().status).toBe("playing");

    // Game 1 ends with a dirty ledger, XP and points on the board.
    session.engine.applyPatches([
      { op: "replace", path: ["cardsPlayedThisTurn"], value: { [P1]: 2, [P2]: 1 } },
      { op: "replace", path: ["cardsPlayedIdsThisTurn"], value: { [P1]: ["g1-unit", "g1-gear"] } },
      { op: "replace", path: ["xpGainedThisTurn"], value: { [P1]: 3, [P2]: 0 } },
    ]);
    const dirty = session.engine.getState() as unknown as LedgerState;
    expect(dirty.cardsPlayedIdsThisTurn?.[P1]).toHaveLength(2);

    concedeGame(session, gameId, P2);
    expect(matchSummary(session).score).toEqual({ [P1]: 1, [P2]: 0 });
    voteContinue(session, gameId, P1);
    voteContinue(session, gameId, P2);
    expect(session.gameNumber).toBe(2);

    const g2 = session.engine.getState() as unknown as LedgerState & { players?: Record<string, { victoryPoints?: number; xp?: number }> };
    // The ledger Swain reads is empty: two-of-three in game 2 cannot borrow game 1's third leg.
    expect(Object.values(g2.cardsPlayedIdsThisTurn ?? {}).flat()).toEqual([]);
    expect(Object.values(g2.cardsPlayedThisTurn ?? {}).filter((n) => n !== 0)).toEqual([]);
    for (const seat of [P1, P2]) {
      expect(g2.players?.[seat]?.victoryPoints ?? 0).toBe(0);
      expect(g2.players?.[seat]?.xp ?? 0).toBe(0);
    }
    // …but the MATCH score is not part of the game state and survives.
    expect(matchSummary(session).score).toEqual({ [P1]: 1, [P2]: 0 });
    expect(matchSummary(session).decided).toBe(false);
  });

  // ---- 6: the Constellation's start-of-Main-Phase option is always declinable --------------------

  test("Bottled Constellation's start-of-Main-Phase kill is offered as a declinable 'you may', never taken for me (355.8 / 358.3.a)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .gear(P1, BOTTLED_CONSTELLATION, "bottle")
      .unit(P1, "base", SWAIN, "swain")
      .unit(P1, "base", { might: 1, name: "A" }, "a")
      .gear(P1, CHEAP_GEAR, "trinket")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect((d as { soleOption?: true }).soleOption).toBeUndefined(); // a real question, not a confirm

    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("swain")).toBe("base");
    expect(game.zoneOf("a")).toBe("base");
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("accepting it kills exactly three OTHER friendly permanents and scores a non-Conquer point (194.1.c) — Swain himself is a legal choice", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .gear(P1, BOTTLED_CONSTELLATION, "bottle")
      .unit(P1, "base", SWAIN, "swain")
      .unit(P1, "base", { might: 1, name: "A" }, "a")
      .gear(P1, CHEAP_GEAR, "trinket")
      .build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.p1.pick("swain", "a", "trinket");
    await game.settle();
    expect(game.zoneOf("swain")).toBe("trash");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.zoneOf("bottle")).toBe("base"); // "3 OTHER" — never itself
    expect(game.p1.points()).toBe(1);
  });
});
