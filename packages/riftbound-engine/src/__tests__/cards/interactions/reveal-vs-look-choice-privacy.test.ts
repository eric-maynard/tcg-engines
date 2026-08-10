/**
 * Mechanism: privacy of a `reveal-and-pick` prompt — Void Rush (sfd-188-221)
 * versus [Predict] on Scryer's Bloom (unl-136-219).
 *
 *   Void Rush — Spell (Action) · Fury/Order · 2 + [rainbow]
 *     "Reveal the top 2 cards of your Main Deck. You may banish one, then play it, reducing its
 *      cost by [2]. Draw any you didn't banish."
 *   Scryer's Bloom — Gear · Chaos · 1 — "Kill this, [1], [Exhaust]: [Predict 2], then draw 1. Gain 1 XP."
 *
 * Rules: 424.1 (a REVEAL presents the cards to every player, so their identity is public and goes on
 * the shared public-reveal record); 128.4 / 419 / 421 (LOOKING at cards — [Predict], "look at the top
 * N" — is private: nobody else learns what was seen or what was chosen).
 *
 * The prompt shape is the same `reveal-and-pick` for both, so the privacy flag has to be DERIVED from
 * the effect rather than hard-coded: a public reveal's prompt is visible to the opponent, a look's is not.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_RUSH = "sfd-188-221";
const SCRYERS_BLOOM = "unl-136-219";
const A = { abilities: [], cardType: "spell", domain: "chaos", energyCost: 9, name: "Card A" } as const;
const B = { abilities: [], cardType: "spell", domain: "chaos", energyCost: 9, name: "Card B" } as const;

/** Pass priority until a non-action decision (the reveal/look pick) is up. */
async function drainToPick(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("reveal-and-pick privacy — a public REVEAL is visible to the opponent, a private LOOK is not", () => {
  test("Void Rush reveals: P2's view of the pending pick records the revealed cards publicly (424.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .deck(P1, [A, B], ["zq1", "zq2"])
      .hand(P1, VOID_RUSH, "vr")
      .build();
    await game.p1.cast("vr");
    await drainToPick(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const seen = JSON.stringify(game.view(P2).decision);
    const revealed = (game.gameState as { publicReveals?: { cardIds: readonly string[] }[] }).publicReveals ?? [];
    expect(revealed.flatMap((r) => [...r.cardIds]).toSorted()).toEqual(["zq1", "zq2"]);
    expect(seen).toBeDefined();
  });

  test("Predict 2 looks: P2's view of the pending pick carries no card identity (128.4)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .gear(P1, SCRYERS_BLOOM, "bloom")
      .deck(P1, [A, B], ["zq1", "zq2"])
      .build();
    await game.p1.activate("bloom");
    await drainToPick(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const seen = JSON.stringify(game.view(P2).decision);
    expect(seen).not.toContain("zq1");
    expect(seen).not.toContain("zq2");
    expect(seen).not.toContain("Card A");
    // rule 419 / 421 — looking is not revealing: nothing lands on the public record either.
    const revealed = (game.gameState as { publicReveals?: { cardIds: readonly string[] }[] }).publicReveals ?? [];
    expect(revealed.flatMap((r) => [...r.cardIds])).toEqual([]);
  });

  test("the looker still sees their own Predict prompt in full", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .gear(P1, SCRYERS_BLOOM, "bloom")
      .deck(P1, [A, B], ["zq1", "zq2"])
      .build();
    await game.p1.activate("bloom");
    await drainToPick(game);
    const mine = JSON.stringify(game.view(P1).decision);
    expect(mine).toContain("zq1");
    expect(mine).toContain("zq2");
  });
});
