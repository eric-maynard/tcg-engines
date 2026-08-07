/**
 * sfd-062-221 — Bubble Bot · Unit · Mind · 3 · 3 Might
 *   "When you play me, ready another friendly Mech."
 *
 * rule 105.2 — "Mech" is a tag; the trigger's target filter matches printed MECH units
 * (Bubble Bot itself, Mega-Mech, Breakneck Mech) and Mech unit tokens, but never Bubble Bot itself
 * ("another").
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const BUBBLE_BOT = "sfd-062-221";
const MEGA_MECH = "ogn-088-298";

describe("sfd-062-221 — Bubble Bot", () => {
  test("readies an exhausted friendly Mech when played", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 6, power: { mind: 3, rainbow: 3 } })
      .unit(P1, "base", MEGA_MECH, "mech", { exhausted: true })
      .hand(P1, BUBBLE_BOT, "bot")
      .build();

    expect(game.state("mech").isExhausted).toBe(true);
    await game.p1.play("bot");
    await game.settle();

    expect(game.state("mech").isExhausted).toBe(false);
  });

  test("does not ready itself when no other Mech is on the board", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 6, power: { mind: 3, rainbow: 3 } })
      .hand(P1, BUBBLE_BOT, "bot")
      .build();

    await game.p1.play("bot");
    await game.settle();

    // Units enter exhausted (rule 143.4) and "another" excludes the source.
    expect(game.state("bot").isExhausted).toBe(true);
  });
});
