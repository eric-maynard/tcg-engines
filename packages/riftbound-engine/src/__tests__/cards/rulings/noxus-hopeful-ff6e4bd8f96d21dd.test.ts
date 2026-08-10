/**
 * Ruling ff6e4bd8f96d21dd — Noxus Hopeful (OGN-012 → ogn-012-298) · Unit · Fury · [4] · 4 Might
 *     "[Legion] — I cost [2] less. (Get the effect if you've played another card this turn.)"
 *   × Void Rush (SFD-188 → sfd-188-221) · Spell · Fury/Order · [2][rainbow] · [Action]
 *     "Reveal the top 2 cards of your Main Deck. You may banish one, then play it, reducing its cost by [2]. Draw any you
 *      didn't banish."
 *
 * Q: If Void Rush (my first card this turn) finds Noxus Hopeful, can I play it for free?
 * A: Yes. Base [4] − [2] (Void Rush) − [2] (Legion — Void Rush itself was played earlier this turn, satisfying the
 *    condition) = [0]. Costs can't go below 0.
 * Rules: 356.4/356.5 (discounts stack, floor 0), Legion (a previously played card this turn), FAQ #8943.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOXUS_HOPEFUL = "ogn-012-298";
const VOID_RUSH = "sfd-188-221";
const SKULKER = "ogn-175-298";

const pickCards = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** P1's turn with EXACTLY Void Rush's cost ([2] + one rainbow) — nothing left over. Deck top→: Noxus Hopeful, Skulker. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .hand(P1, VOID_RUSH, "vr")
    .deck(P1, [NOXUS_HOPEFUL, SKULKER], ["hopeful", "sk"]);
}

/** 1. Play Void Rush (first card this turn). 2. It resolves → the two cards are revealed and P1 may banish-and-play one. */
async function voidRushReveals(): Promise<Game> {
  const game = await board().build();
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0); // nothing played yet this turn
  await game.p1.cast("vr");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling ff6e4bd8f96d21dd — Noxus Hopeful off Void Rush costs [4] − [2] − [2] (Legion) = [0]", () => {
  test("Void Rush counts as a card played earlier this turn, so with ZERO energy left the revealed Hopeful is still offered as playable (its total cost is 0)", async () => {
    const game = await voidRushReveals();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(pickCards(d)).toContain("hopeful");
    // The [3] Skulker (3 − 2 = 1 > 0 energy) is NOT affordable and therefore not offered to play.
    expect(pickCards(d)).not.toContain("sk");
  });

  test("picking it: Hopeful is banished then played for [0] — P1's empty pool is untouched — lands in base as a 4-Might unit; the Skulker (not banished) is drawn; Void Rush to trash", async () => {
    const game = await voidRushReveals();
    await game.p1.pick("hopeful");
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "base")) {
        await game.p1.pick("base");
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.state("hopeful").might).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("sk")).toBe("hand");
    expect(game.zoneOf("vr")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without Legion's condition the same Hopeful is NOT free: played straight from hand as the FIRST card of the turn it costs the full [4] (only [2] with another card played first)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .hand(P1, NOXUS_HOPEFUL, "hopeful")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Cheap" }, "cheap")
      .build();
    expect(game.p1.can("play", "hopeful")).toBe(false); // 3 < 4, no Legion yet
    await game.p1.play("cheap");
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(true); // Legion: 4 − 2 = 2
    await game.p1.play("hopeful");
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });
});
