/**
 * Viktor, Innovator — ogn-117-298 · Champion Unit · Mind · 4 energy + 1 [mind] · 3 Might
 *
 *   When you play a card on an opponent's turn, play a 1 [Might] Recruit unit
 *   token in your base.
 *
 * Rules: 180–185 (tokens), 813 (a Reaction spell is how you play a card on the
 * opponent's turn), 383 (triggered abilities).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-117-298";
const SMOKE_SCREEN = "ogn-093-298"; // [Reaction] Give a unit -4 Might this turn (2 energy + 1 mind)
const CLEAVE = "ogn-004-298"; // [Action] spell the opponent casts on their turn (1 energy)

const tokensIn = (ids: readonly string[]) => ids.filter((id) => id.startsWith("token-"));

/** P2's turn; P1 has Viktor at `where` and a Smoke Screen in hand; P2 opens a chain with Cleave. */
function oppTurn(where: "base" | "bf1") {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .resources(P2, { energy: 1 })
    .unit(P1, where, CARD, "viktor")
    .unit(P2, "base", { might: 6 }, "foe")
    .hand(P2, CLEAVE, "cleave")
    .hand(P1, SMOKE_SCREEN, "ss");
}

describe("Viktor, Innovator (ogn-117-298)", () => {
  test("costs 4 energy + 1 mind; a 3-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, CARD, "viktor").build();
    await game.p1.play("viktor");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("viktor")).toBe("base");
    expect(game.state("viktor").might).toBe(3);
    const noMind = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "viktor").build();
    expect(noMind.p1.can("play", "viktor")).toBe(false);
  });

  test("playing a card (a Reaction) on the opponent's turn creates one 1-Might Recruit unit token in your base", async () => {
    const game = await oppTurn("base").build();
    await game.p2.cast("cleave", { targets: "foe" });
    await game.p2.passPriority();
    await game.p1.cast("ss", { targets: "foe" });
    await game.settle();
    const tokens = tokensIn(game.p1.base());
    expect(tokens).toHaveLength(1);
    const t = game.state(tokens[0] as string);
    expect(t).toMatchObject({ cardType: "unit", controller: P1, isToken: true, might: 1, name: "Recruit", owner: P1 });
    expect(tokensIn(game.p2.base())).toHaveLength(0);
  });

  test("the token is played to your BASE even when Viktor is at a battlefield", async () => {
    const game = await oppTurn("bf1").build();
    await game.p2.cast("cleave", { targets: "foe" });
    await game.p2.passPriority();
    await game.p1.cast("ss", { targets: "foe" });
    await game.settle();
    expect(tokensIn(game.p1.base())).toHaveLength(1);
    expect(tokensIn(game.cardsAt("bf1"))).toHaveLength(0);
  });

  test("only on an OPPONENT's turn: playing a card on your own turn creates no token", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .unit(P1, "base", CARD, "viktor")
      .unit(P2, "base", { might: 6 }, "foe")
      .hand(P1, SMOKE_SCREEN, "ss")
      .build();
    await game.p1.cast("ss", { targets: "foe" });
    await game.settle();
    expect(game.p1.base()).toEqual(["viktor"]);
  });

  test("only when YOU play a card: the opponent playing cards on their turn creates no token", async () => {
    const game = await oppTurn("base").build();
    await game.p2.cast("cleave", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.p1.base()).toEqual(["viktor"]);
    expect(tokensIn(game.p2.base())).toHaveLength(0);
  });
});
