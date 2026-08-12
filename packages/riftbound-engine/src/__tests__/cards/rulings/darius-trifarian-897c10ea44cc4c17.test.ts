/**
 * Ruling 897c10ea44cc4c17 — Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might ·
 *   "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: Do I have to announce the Darius trigger to get the +2, or does it happen automatically?
 * A: Automatically. The ability has no "you may", so it is a mandatory trigger: playing your second
 *    card of the turn puts it on the Chain with no decision offered to anybody. (The rest of the
 *    ruling — that you are the accountable player and must acknowledge it before taking a new game
 *    action — is Tournament Policy 506.3, outside the game rules and outside the engine.)
 * Rules: 383 / 383.3.a (a triggered ability with no "you may" is placed on the Chain automatically;
 *        only an optional one raises an opt-in), 419.4 (playing a card is what triggers it),
 *        336–340 (it then resolves like any chain item).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DARIUS_TRIFARIAN = "ogn-027-298";

const GRUNT = { cardType: "unit", domain: "fury", energyCost: 0, might: 2, name: "Test Grunt" } as const;

/** P1's turn; Darius is on the board EXHAUSTED so the "ready me" half is visible. */
const board = () =>
  scenario()
    .resources(P1, { energy: 4, power: { fury: 4 } })
    .unit(P1, "base", DARIUS_TRIFARIAN, "darius", { exhausted: true })
    .hand(P1, GRUNT, "c1")
    .hand(P1, GRUNT, "c2")
    .hand(P1, GRUNT, "c3");

describe("Ruling 897c10ea44cc4c17 — Darius's trigger is mandatory and fires on its own", () => {
  test("the FIRST card of the turn does not trigger it", async () => {
    const game = await board().build();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.play("c1");
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("the SECOND card puts the trigger on the chain with no prompt of any kind", async () => {
    const game = await board().build();
    await game.p1.play("c1");
    await game.p1.play("c2");
    expect(game.chain().map((i) => i.cardId)).toEqual(["darius"]);
    expect(game.chain()[0]).toMatchObject({ triggered: true, controller: P1 });
    // no "you may" — the decision offered is an ordinary priority window, not a yes/no opt-in
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.decision()?.kind).not.toBe("yes-no");
  });

  test("it resolves into +2 Might this turn and a ready Darius", async () => {
    const game = await board().build();
    await game.p1.play("c1");
    await game.p1.play("c2");
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
    expect(game.chain()).toEqual([]);
  });

  test("nothing was optional about it: it fired even though P1 took no action to claim it", async () => {
    const game = await board().build();
    await game.p1.play("c1");
    await game.p1.play("c2");
    // straight to another game action; the trigger is still honoured
    await game.settle();
    await game.p1.play("c3");
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
    expect(game.violations()).toEqual([]);
  });

  test("the +2 is 'this turn' and lapses at the end of it; the ready does not come back", async () => {
    const game = await board().build();
    await game.p1.play("c1");
    await game.p1.play("c2");
    await game.settle();
    expect(game.state("darius").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("darius").might).toBe(5);
    expect(game.turnPlayer()).toBe(P2);
  });
});
