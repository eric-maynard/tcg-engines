/**
 * Ruling 44de3011c355b1c3 — Vex, Apathetic (UNL-150 → unl-150-219) · Unit/Champion · Chaos · [4] · 4 Might
 *   "[Deflect]\nWhen an opponent plays a unit while I'm at a battlefield, [Stun] it.
 *    They can't move it this turn."
 *
 * Q: Can Vex, Apathetic's triggered ability be missed?
 * A: Yes — as a matter of TOURNAMENT policy. It is an ordinary mandatory trigger, so it is "missed" if its
 *    controller does not acknowledge it before its first observable impact; the ruling names those impacts as
 *    the unit becoming [Stun]ned and being unable to move. Tournament Rules 702.2 then let the next opponent
 *    choose whether to resolve it late or drop it, with No Penalty when it was not intentional.
 * Rules: 383 (triggered abilities are mandatory and use the chain), 423.1 ([Stun]), 350.1 (movement
 *        restriction); Tournament Rules 702.2 / 506.3.d.6-7 (missed-trigger policy — see note below).
 *
 * Note: missed-trigger policy is a HUMAN tournament-floor remedy, not a game-state rule; the engine never
 * "forgets" a trigger. What is testable here — and what the ruling's premise rests on — is that the ability is
 * a mandatory trigger whose observable impacts are exactly the Stun and the movement lock.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX_APATHETIC = "unl-150-219";
const RECRUIT = { cardType: "unit", energyCost: 2, might: 2, name: "Recruit" } as const;

describe("Ruling 44de3011c355b1c3 — Vex, Apathetic's trigger is mandatory; its observable impacts are Stun + no move", () => {
  test("opponent plays a unit while Vex is at a battlefield → the trigger fires with no opt-in, and the unit is stunned and frozen", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", VEX_APATHETIC, "vexa")
      .hand(P2, RECRUIT, "newbie")
      .build();

    await game.p2.play("newbie");

    // Mandatory: the ability is already on the chain, nobody was asked whether to use it.
    expect(game.chain()).toMatchObject([{ cardId: "vexa", triggered: true }]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain" });

    await game.settle();

    // Observable impact #1 — the unit is Stunned.
    expect(game.state("newbie").isStunned).toBe(true);
    // Observable impact #2 — its controller can't move it this turn.
    expect(game.state("newbie").grantedKeywords).toEqual([{ duration: "turn", keyword: "NoMove" }]);
    expect(game.violations()).toEqual([]);
  });

  test("Vex sitting at base is not 'at a battlefield' — nothing triggers", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", VEX_APATHETIC, "vexa")
      .hand(P2, RECRUIT, "newbie")
      .build();

    await game.p2.play("newbie");
    await game.settle();

    expect(game.state("newbie").isStunned).toBe(false);
    expect(game.state("newbie").grantedKeywords).toEqual([]);
  });

  test("Vex's own [Deflect] is untouched by all this — it still taxes enemy spells that choose her", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VEX_APATHETIC, "vexa")
      .build();

    expect(game.state("vexa").keywords).toContain("Deflect");
  });
});
