/**
 * Ruling 4831236cfd53696b — Shadow (UNL-194 → unl-194-219) · Unit · Calm/Chaos · [3] · 3 Might
 *   "If you play me to a battlefield, I enter ready.
 *    [Action][>] [1][rainbow], [Exhaust]: [Stun] an enemy unit attacking here."
 *
 * Q: Can a STUNNED unit like Shadow still tap (exhaust) for its activated ability?
 * A: Yes. [Stun] only stops the unit contributing combat damage and marks it as already stunned; it puts
 *    no restriction on exhausting. A stunned but READY unit may still be exhausted to pay an ability cost.
 * Rules: 423.1 (Stun: no combat damage, can't be stunned again), 423.1.b, 406 (activated-ability costs).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHADOW = "unl-194-219";

/** P1 holds bf1 with a stunned-but-ready Shadow; P2's Raider walks in and opens a combat showdown. */
async function stunnedShadowUnderAttack() {
  const game = await scenario()
    .active(P2)
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SHADOW, "shadow", { stunned: true })
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .build();
  expect(game.state("shadow")).toMatchObject({ isStunned: true, isExhausted: false, isReady: true });
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  return game;
}

describe("Ruling 4831236cfd53696b — a stunned unit may still exhaust for an activated ability", () => {
  test("stunned Shadow pays [1][rainbow] + [Exhaust] and stuns the attacker", async () => {
    const game = await stunnedShadowUnderAttack();
    expect(game.p1.can("activate", "shadow")).toBe(true);

    await game.p1.activate("shadow", 1, { answers: ["raider"] }); // #0 is the static enter-ready clause
    await game.settle();

    expect(game.state("shadow").isExhausted).toBe(true); // the cost WAS paid despite the Stun
    expect(game.state("shadow").isStunned).toBe(true); // and it is still stunned
    expect(game.state("raider").isStunned).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("what Stun actually costs Shadow: it deals no combat damage — the Raider survives the exchange", async () => {
    const game = await stunnedShadowUnderAttack();
    await game.p1.passFocus();
    await game.settle();

    // Shadow (3 Might) is stunned ⇒ contributes 0 combat damage, so the 4-Might Raider is unharmed…
    expect(game.state("raider").damage).toBe(0);
    // …while the Raider's 4 damage kills Shadow.
    expect(game.zoneOf("shadow")).toBe("trash");
  });

  test("an already EXHAUSTED Shadow cannot pay the cost — that is exhaustion, not the Stun", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SHADOW, "shadow", { exhausted: true, stunned: true })
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();

    expect(game.p1.can("activate", "shadow")).toBe(false);
  });
});
