/**
 * Ruling e0677c57547bc1dd — Kai'Sa, Evolutionary (OGN-112 → ogn-112-298) · Champion Unit · Mind · 6 Might · [Ganking]
 *     "When I conquer, you may play a spell from your trash with Energy cost less than your points without paying its
 *      Energy cost. Then recycle it."
 *
 * Q: I already scored a battlefield this turn, move my unit out of it, then send Kai'Sa to re-take it. Does her
 *    on-conquer ability trigger?
 * A: No. Conquering is a form of Scoring and you cannot Score a battlefield you already scored this turn. A showdown
 *    still begins when she moves in, and she does establish control — but no point and no "When I conquer" effects.
 * Rules: 469.1 (Conquer = gain control of a battlefield you did not yet Score this turn), 471.2.c (score abilities only
 *        when the battlefield is Scored — at most once per turn per player), 345 (showdown at an uncontrolled battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAISA_EVOLUTIONARY = "ogn-112-298";
const CLEAVE = "ogn-004-298"; // 1-cost spell waiting in the trash for Kai'Sa's ability
/** "Move a unit out of the battlefield": a 0-cost recall spell (send a friendly unit at a battlefield to base). */
const RETREAT = {
  abilities: [{ effect: { target: { controller: "friendly", location: "battlefield", type: "unit" }, type: "recall" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Retreat",
  timing: "action",
} as const;

/** P1's turn at 4 points. P2 holds bf1 (Weak 1) and bf2 (Guard 2). P1: Scout (3) + Kai'Sa (6) in base, Cleave in trash, Retreat in hand. */
function board() {
  return scenario()
    .points(P1, 4)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Weak" }, "weak")
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "base", KAISA_EVOLUTIONARY, "kaisa")
    .trash(P1, CLEAVE, "cleave")
    .hand(P1, RETREAT, "retreat");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Scout conquers bf1 (scored: 4 → 5), then Retreat pulls Scout home; bf1 lapses to nobody. */
async function scoredThenVacated(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  await game.settle();
  expect(game.zoneOf("weak")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(5); // bf1 SCORED this turn
  await game.p1.cast("retreat", { targets: "scout" });
  await game.settle();
  expect(game.locationOf("scout")).toBe("base");
  expect(game.gameState.battlefields.bf1?.controller).toBe(null); // vacated → uncontrolled
  return game;
}

describe("Ruling e0677c57547bc1dd — re-taking a battlefield you already scored this turn is not a Conquer: no point, no Kai'Sa trigger", () => {
  test("Kai'Sa moves onto the vacated, already-scored bf1: a showdown DOES still begin there (P1 has Focus first)", async () => {
    const game = await scoredThenVacated();
    await game.p1.move("kaisa", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.chain()).toEqual([]);
  });

  test("when the showdown closes she establishes control of bf1 — but P1 gains NO point (still 5) and her 'When I conquer' ability does NOT trigger (no offer, Cleave stays in the trash)", async () => {
    const game = await scoredThenVacated();
    await game.p1.move("kaisa", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(5);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // nothing asked
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control — Kai'Sa conquering a battlefield NOT yet scored this turn (bf2) scores a point and her ability DOES trigger (the 'you may play a spell from your trash' offer appears)", async () => {
    const game = await board().build();
    await game.p1.move("kaisa", "bf2");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(5);
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).not.toBe("action"); // an offer/pick from Kai'Sa's trigger is pending
    expect(d?.source?.cardId === "kaisa" || game.chain().some((c) => c.cardId === "kaisa")).toBe(true);
  });
});
