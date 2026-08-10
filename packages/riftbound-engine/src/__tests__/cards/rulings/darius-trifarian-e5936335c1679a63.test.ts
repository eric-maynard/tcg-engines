/**
 * Ruling e5936335c1679a63 — Darius, Trifarian (OGN-027 → ogn-027-298) · Champion Unit · Fury · 5+[fury] · 5 Might
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *   × Challenge (OGN-128 → ogn-128-298) · Spell · Body · 2+[body] · Action
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *
 * Q: Darius is on board, one card was played this turn; Challenge (the second card) makes Darius fight a 5-Might enemy —
 *    does Darius get +2 before or after the spell resolves?
 * A: After. "When you play" triggers fire once the card has finished resolving (a card is only "played" then), so the fight
 *    happens at 5 vs 5 — both die — and Darius' +2 would only come afterwards, when he is already dead.
 * Rules: 419.4.a (play triggers fire on completion/resolution), 350.1, 336–339.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const CHALLENGE = "ogn-128-298";
const FIRST_CARD = "ogn-175-298"; // Shipyard Skulker (3) — a plain unit as the turn's first card

/** P1's turn with 3 (Skulker) + 2+[body] (Challenge). Darius (5) ready in base. P2's Foe (5) at bf1 next to a 1-Might Anchor. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 1, name: "Anchor" }, "anchor")
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .hand(P1, FIRST_CARD, "first")
    .hand(P1, CHALLENGE, "challenge");
}

async function playFirstCard(game: Game): Promise<void> {
  await game.p1.play("first", { to: "base" });
  await game.settle();
  expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 0 }); // nothing yet
}

describe("Ruling e5936335c1679a63 — Darius' second-card trigger comes AFTER Challenge resolves", () => {
  test("Challenge (2nd card) goes on the chain with Darius still at 5 Might — no Darius trigger exists while the spell is pending", async () => {
    const game = await board().build();
    await playFirstCard(game);
    await game.p1.cast("challenge", { targets: ["darius", "foe"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]);
    expect(game.chain().some((c) => c.cardId === "darius")).toBe(false);
    expect(game.state("darius")).toMatchObject({ might: 5, mightModifier: 0 });
  });

  test("Challenge resolves at 5 vs 5: each deals exactly 5 to the other and BOTH die", async () => {
    const game = await board().build();
    await playFirstCard(game);
    await game.p1.cast("challenge", { targets: ["darius", "foe"] });
    await game.settle();
    const hits = (game.gameState.damageLog ?? []).filter((r) => !r.combat).map((r) => [r.target, r.amount]).sort();
    expect(hits).toEqual([
      ["darius", 5],
      ["foe", 5],
    ]);
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.zoneOf("challenge")).toBe("trash");
  });

  test("after Challenge has resolved (2 cards played this turn) Darius is already in the trash, so his +2/ready never lands on a living Darius — nothing of his is left on the chain and the turn is back in P1's open main phase", async () => {
    const game = await board().build();
    await playFirstCard(game);
    await game.p1.cast("challenge", { targets: ["darius", "foe"] });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.state("darius").mightModifier).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — had the +2 come first Darius would have survived: against a 5-Might Foe a 7-Might Darius lives (Challenge with Darius pre-buffed +2 kills only Foe)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
      .unit(P1, "base", DARIUS, "darius", { mightModifier: 2 })
      .hand(P1, CHALLENGE, "challenge")
      .build();
    expect(game.state("darius").might).toBe(7);
    await game.p1.cast("challenge", { targets: ["darius", "foe"] });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("darius")).toMatchObject({ damage: 5, zone: "base" });
  });
});
