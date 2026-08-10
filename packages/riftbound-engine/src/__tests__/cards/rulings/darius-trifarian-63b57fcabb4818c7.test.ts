/**
 * Ruling 63b57fcabb4818c7 — Darius, Trifarian (OGN-027 → ogn-027-298) · Champion Unit · Fury · [5][fury] · 5 Might
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *   × Mystic Reversal (OGN-080 → ogn-080-298) · Reaction [4][calm]×3 "Gain control of a spell. You may make new choices for it."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Wind Wall (OGN-064 → ogn-064-298) · Reaction [3][calm][calm] "Counter a spell."
 *   (+ Noxus Hopeful ogn-012-298 "[Legion] — I cost [2] less." as the Legion witness; Stupefy ogn-095-298 as the spell.)
 *
 * Q: Do countered or Mystic-Reversed spells count as "played" for Legion and for red Darius?
 * A: For TRIGGERS, no — Darius (419.4.a) needs the play to be completed by resolution, so a hard-countered or
 *    Mystic-Reversed spell takes no ordinal and the next card is again that turn's second. Legion is different:
 *    419.4.b makes non-triggered "have you played" checks read FINALIZATION, and the rulebook's example is literally
 *    "a spell countered by Defy … Legion abilities of that same player will be active". So a countered Stupefy keeps
 *    Legion live while never triggering Darius.
 * Rules: 419.4.a/.b (played-card triggers vs. non-triggered checks), 412/425 (counter), Mystic Reversal (control of the
 *        chain item changes), 819 Legion ("if you've played another card this turn"), 383 (Darius's trigger condition).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const MYSTIC_REVERSAL = "ogn-080-298";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const STUPEFY = "ogn-095-298";
const NOXUS_HOPEFUL = "ogn-012-298";

const cheap = (name: string) => ({ cardType: "unit", energyCost: 1, might: 1, name });

/**
 * P1's turn. Darius EXHAUSTED in P1's base (so "ready me" is observable) beside a 3-Might Pal; P2's 3-Might Foe at bf1.
 * P1 hand: Stupefy (1), Noxus Hopeful (4, or 2 with Legion), units A and B (1 each); energy as given.
 * P2 holds Defy, Wind Wall and Mystic Reversal with [8] + calm×6.
 */
function board(p1Energy: number) {
  return scenario()
    .resources(P1, { energy: p1Energy })
    .resources(P2, { energy: 8, power: { calm: 6 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .unit(P1, "base", { might: 3, name: "Pal" }, "pal")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P1, NOXUS_HOPEFUL, "hopeful")
    .hand(P1, cheap("A"), "a")
    .hand(P1, cheap("B"), "b")
    .hand(P2, DEFY, "defy")
    .hand(P2, WIND_WALL, "windwall")
    .hand(P2, MYSTIC_REVERSAL, "mr");
}

/** P1 casts Stupefy at the Foe and passes; P2 answers with `answer` (a counter, or Mystic Reversal keeping the choices); the chain resolves. */
async function stupefyAnswered(game: Game, answer: "defy" | "windwall" | "mr"): Promise<void> {
  await game.p1.cast("stupefy", { targets: "foe" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", answer)).toBe(true);
  if (answer === "mr") {
    await game.p2.cast("mr");
  } else {
    await game.p2.cast(answer, { targets: "stupefy" });
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy", answer]);
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.seat === P2) {
      // Mystic Reversal's "you may make new choices": keep aiming at the Foe.
      await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "foe")?.key ?? d.options[0]!.key);
    } else if (d.kind === "yes-no" && d.seat === P2) {
      await game.p2.no();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("stupefy")).toBe("trash");
  expect(game.zoneOf(answer)).toBe("trash");
}

// ── Legion ─────────────────────────────────────────────────────────────────────────────────────

describe("Ruling 63b57fcabb4818c7 — Legion: a countered / Mystic-Reversed spell is not 'another card played this turn'", () => {
  test("control: Stupefy RESOLVES as P1's first card → Legion is live: Noxus Hopeful now costs [2] and is playable with the 2 energy left", async () => {
    const game = await board(3).build();
    expect(game.state("hopeful").energyCost).toBe(4);
    expect(game.p1.can("play", "hopeful")).toBe(false); // 3 energy, no other card played yet
    await game.p1.cast("stupefy", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(2);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(true);
    await game.p1.play("hopeful");
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  // rule 419.4.b — Legion is NOT a triggered ability: it checks whether a card was FINALIZED, and the rulebook's own
  // worked example is exactly this one ("A player plays a spell, which is countered by Defy … any Legion abilities of
  // game objects controlled by that same player will be active"). Only the trigger side (419.4.a, Darius below) skips
  // the countered play. Same split as ruling 5807cc9df8627167.
  test("Stupefy countered by DEFY was still Finalized: rule 419.4.b keeps P1's Legion live — Noxus Hopeful costs [2] and is playable with the 2 energy left", async () => {
    const game = await board(3).build();
    await stupefyAnswered(game, "defy");
    expect(game.state("foe").might).toBe(3); // countered: no effect
    expect(game.p1.energy()).toBe(2);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    expect(game.p1.can("play", "hopeful")).toBe(true);
  });

  test("Stupefy countered by WIND WALL: same — Legion stays live, Hopeful playable for [2]", async () => {
    const game = await board(3).build();
    await stupefyAnswered(game, "windwall");
    expect(game.state("foe").might).toBe(3);
    expect(game.p1.energy()).toBe(2);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    expect(game.p1.can("play", "hopeful")).toBe(true);
  });

  // Expected: Mystic Reversal takes the Stupefy chain item away from P1 — it resolves for P2 (P2 draws Stupefy's card), so
  // P1 has not "played" a card for Legion. Actual: P1's played-count keeps the stolen spell and Hopeful is offered for [2].
  test("ruling 63b57fcabb4818c7 — Stupefy taken by MYSTIC REVERSAL should leave P1's Legion off; engine still discounts Noxus Hopeful", async () => {
    const game = await board(3).build();
    const p2Hand = game.p2.hand().length;
    await stupefyAnswered(game, "mr");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1); // cast MR, drew 1 off P1's Stupefy — it resolved for P2
    expect(game.p1.hand().toSorted()).toEqual(["a", "b", "hopeful"]); // P1 drew nothing
    expect(game.p1.energy()).toBe(2);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("play", "hopeful")).toBe(false);
  });
});

// ── Darius ─────────────────────────────────────────────────────────────────────────────────────

/** P1 plays unit A (first card, resolves), then Stupefy answered by `answer`. */
async function firstCardThenAnsweredStupefy(answer: "defy" | "windwall" | "mr"): Promise<Game> {
  const game = await board(4).build();
  await game.p1.play("a");
  await game.settle();
  expect(game.zoneOf("a")).toBe("base");
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 }); // first card: nothing
  await stupefyAnswered(game, answer);
  return game;
}

describe("Ruling 63b57fcabb4818c7 — Darius: the countered / reversed spell is not his 'second card'", () => {
  test("control: A then a RESOLVING Stupefy IS the second card — Darius +2 (7) and readied", async () => {
    const game = await board(4).build();
    await game.p1.play("a");
    await game.settle();
    await game.p1.cast("stupefy", { targets: "foe" });
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });

  test("A then Stupefy countered by Defy: Darius does NOT trigger — still 5, still exhausted, nothing of his on the chain", async () => {
    const game = await firstCardThenAnsweredStupefy("defy");
    expect(game.state("foe").might).toBe(3);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("A then Stupefy countered by Wind Wall: Darius does NOT trigger either", async () => {
    const game = await firstCardThenAnsweredStupefy("windwall");
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("A then Stupefy taken by Mystic Reversal (resolves under P2's control): Darius does NOT trigger for P1", async () => {
    const game = await firstCardThenAnsweredStupefy("mr");
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("since the Defied Stupefy did not take an ordinal, the NEXT card (unit B) is P1's real second card → Darius triggers: +2 (7) and readied", async () => {
    const game = await firstCardThenAnsweredStupefy("defy");
    // rule 419.4.b — the countered play still counts in the tally; what it loses (419.4.a) is its ORDINAL.
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 });
    await game.p1.play("b");
    await game.settle();
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });
});
