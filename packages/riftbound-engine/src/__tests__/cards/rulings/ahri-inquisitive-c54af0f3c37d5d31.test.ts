/**
 * Ruling c54af0f3c37d5d31 — Ahri, Inquisitive (OGN-119 → ogn-119-298) · Champion · Mind · 3 · 3 Might
 *   "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Nine-Tailed Fox (Ahri legend, ogn-255-298) · "When an enemy unit attacks a battlefield you control, give it -1 [Might]
 *     this turn, to a minimum of 1 [Might]."
 *   × Siphon Power (OGN-266 → ogn-266-298) · Reaction · 2 + [rainbow] · "Choose a battlefield. Give friendly units there
 *     +1 [Might] this turn and enemy units there -1 [Might] this turn, to a minimum of 1 [Might]."
 *   (subjects: Viktor's 1-Might Recruit tokens ogn-272-298; War Camp ogn-294 / Leona, Zealot ogn-079 / Stupefy ogn-095
 *    cited only as continuous-vs-instance contrasts)
 *
 * Q: Viktor's tokens have their Might "reduced" by the Ahri legend and by Ahri, Inquisitive ("this turn"), then Siphon
 *    Power is played. Does Ahri's effect recalculate after the cleanup and pin the tokens back to 1?
 * A: No. All three are one-shot ("instance") effects applied once for a duration, not continuous effects. On 1-Might
 *    tokens both Ahri reductions bottom out at the minimum of 1 (i.e. change nothing); Siphon Power then gives +1 → every
 *    token is 2, and stays 2 — nothing re-applies.
 * Rules: 358 (an effect with a duration is applied once when it resolves), 476–478 / 710 (Might arithmetic; "to a
 *        minimum of 1" bounds the reduction as applied), 522 (contrast: continuous statics).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI_INQUISITIVE = "ogn-119-298";
const NINE_TAILED_FOX = "ogn-255-298";
const SIPHON_POWER = "ogn-266-298";
const RECRUIT_TOKEN = "ogn-272-298";

const TOKENS = ["t1", "t2", "t3"] as const;

/** Viktor's (P2's) turn with [2] + [rainbow]. P1 = the Ahri player: Nine-Tailed Fox legend, Ahri (3) holding bf1. P2: three 1-Might Recruit tokens in base, Siphon Power in hand. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .legend(P1, NINE_TAILED_FOX, "ntf")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", AHRI_INQUISITIVE, "ahri")
    .unit(P2, "base", RECRUIT_TOKEN, "t1")
    .unit(P2, "base", RECRUIT_TOKEN, "t2")
    .unit(P2, "base", RECRUIT_TOKEN, "t3")
    .hand(P2, SIPHON_POWER, "siphon");
}

const mights = (game: Game) => TOKENS.map((t) => game.state(t).might);

/** The three tokens attack bf1; Nine-Tailed Fox (×3) and Ahri's defend trigger (aimed at t1) all resolve. Returns with P2 holding Focus. */
async function tokensAttackAndAhriResolves(): Promise<Game> {
  const game = await board().build();
  expect(mights(game)).toEqual([1, 1, 1]);
  await game.p2.move([...TOKENS], "bf1");
  // Ahri's "an enemy unit here" choice, then the trigger-order offer, then everyone passes through all four items.
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key).sort()).toEqual([...TOKENS]);
      await game.p1.pick("t1");
    } else if (d?.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Ruling c54af0f3c37d5d31 — Ahri's 'this turn' reductions are one-shot; Siphon Power afterwards leaves the tokens at 2", () => {
  test("the attack puts Nine-Tailed Fox's trigger (once per attacking token) and Ahri's defend trigger on the chain; once resolved, every 1-Might token is still exactly 1 — each reduction bottomed out at the minimum and recorded no change", async () => {
    const game = await board().build();
    await game.p2.move([...TOKENS], "bf1");
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["ahri", "ntf", "ntf", "ntf"]);
    // finish resolving them
    for (let i = 0; i < 16 && (game.chain().length > 0 || game.decision()?.kind !== "action"); i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("t1");
      } else if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action") {
        await game.seat(d.seat).passPriority();
      }
    }
    expect(mights(game)).toEqual([1, 1, 1]);
    expect(TOKENS.map((t) => game.state(t).mightModifier)).toEqual([0, 0, 0]);
    expect(game.state("ahri").might).toBe(3);
  });

  test("P2 then Siphon Powers bf1: friendly tokens +1 → ALL THREE read 2 (including t1, which took both Ahri effects); enemy Ahri 3 → 2", async () => {
    const game = await tokensAttackAndAhriResolves();
    expect(game.p2.can("cast", "siphon")).toBe(true);
    await game.p2.cast("siphon", { targets: "bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("siphon")).toBe("trash");
    expect(mights(game)).toEqual([2, 2, 2]);
    expect(game.state("ahri")).toMatchObject({ might: 2, mightModifier: -1 });
  });

  test("and they STAY 2 through the following cleanups / focus passes — Ahri's instance effects do not recalculate to drag t1 back to 1; combat then runs at 6 vs 2", async () => {
    const game = await tokensAttackAndAhriResolves();
    await game.p2.cast("siphon", { targets: "bf1" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    // another action → cleanup → still 2
    await game.acting().passFocus();
    expect(mights(game)).toEqual([2, 2, 2]);
    expect(game.state("t1").mightModifier).toBe(1);
    await game.settle();
    // 2 + 2 + 2 = 6 into a 2-Might Ahri: she dies; Ahri's 2 kills one token at most; P2 conquers bf1
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
