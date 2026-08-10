/**
 * Ruling c43110ca287910ef — Darius, Trifarian (OGN-027 → ogn-027-298) · Champion Unit · Fury · 5+[fury] · 5 Might
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *   × Possession (OGN-203 → ogn-203-298) · Spell · Chaos · 8+[chaos]×3 · [Action] "Choose an enemy unit at a battlefield. Take control
 *     of it and recall it."
 *
 * Q: The opponent controls Darius; I Possess him as my FIRST card. Does Darius count Possession as my first card, so my next card triggers him?
 * A: Yes. He need not have been mine when the first card was played — when a card is played he just checks whether his (current)
 *    controller has now played their second card this turn. So Possession (1st) → my next card (2nd) triggers him under my
 *    control. By the same logic Darius can trigger off being the second card himself.
 * Rules: 383 (trigger condition evaluated by the current controller when the event happens), 419.4 (cards played this turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS_TRIFARIAN = "ogn-027-298";
const POSSESSION = "ogn-203-298";
/** A plain 2-cost unit as "my second card". */
const CHEAP_DUDE = { cardType: "unit", energyCost: 2, might: 2, name: "Cheap Dude" } as const;

/** P1's turn: [10]+[chaos]×3, Possession + Cheap Dude in hand. P2 holds bf1 with an EXHAUSTED Darius (5) and a Guard. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DARIUS_TRIFARIAN, "darius", { exhausted: true })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .hand(P1, POSSESSION, "poss")
    .hand(P1, CHEAP_DUDE, "dude");
}

const dariusItems = (game: Game) => game.chain().filter((c) => c.cardId === "darius" && c.triggered);

async function possessDarius(game: Game): Promise<void> {
  await game.p1.cast("poss", { targets: "darius" });
  await game.settle();
  expect(game.zoneOf("poss")).toBe("trash");
}

describe("Ruling c43110ca287910ef — Possession as card #1 steals Darius; card #2 then triggers him for his new controller", () => {
  test("Possession (P1's first card this turn) resolves: Darius is now CONTROLLED by P1, recalled to P1's base, still exhausted and 5 Might — no trigger yet; P1's played-card count is 1", async () => {
    const game = await board().build();
    await possessDarius(game);
    expect(game.state("darius")).toMatchObject({ controller: P1, isExhausted: true, location: "base", might: 5, owner: P2 });
    expect(game.p1.units("base")).toContain("darius");
    expect(dariusItems(game)).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
  });

  test("P1 then plays a second card (Cheap Dude): Darius's trigger goes on the chain under P1's control and resolves — +2 this turn (5 → 7) and READIED", async () => {
    const game = await board().build();
    await possessDarius(game);
    await game.p1.play("dude");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    let saw = dariusItems(game);
    for (let i = 0; i < 6 && saw.length === 0; i++) {
      const d = game.decision();
      if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
      saw = dariusItems(game);
    }
    expect(saw).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ controller: P1, isReady: true, might: 7, mightModifier: 2 });
    expect(game.locationOf("dude")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("control: P2 (the old controller) has played nothing — the trigger is P1's, and P2 playing cards on ITS turn later does not count P1's plays", async () => {
    const game = await board().build();
    await possessDarius(game);
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(0);
    await game.p1.play("dude");
    await game.settle();
    expect(dariusItems(game).every((c) => c.controller === P1)).toBe(true);
  });

  test("same logic: Darius can be the second card HIMSELF — Cheap Dude first, then Darius from hand → he triggers on his own play (7 Might, ready instead of entering exhausted)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { fury: 1 } })
      .unit(P2, "base", { might: 2, name: "Guard" }, "guard")
      .hand(P1, DARIUS_TRIFARIAN, "darius")
      .hand(P1, CHEAP_DUDE, "dude")
      .build();
    await game.p1.play("dude");
    await game.settle();
    expect(game.state("dude").isExhausted).toBe(true); // a normal first card: enters exhausted, nothing triggers
    await game.p1.play("darius");
    expect(dariusItems(game)).toHaveLength(1);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, location: "base", might: 7, mightModifier: 2 });
  });
});
