/**
 * Interaction: a Reflection token minted with NOTHING left to copy — a bare 0 [Might] unit — and the
 * "to a minimum of 1 [Might]" floor pointed at it.
 *
 *   Deceiver        (unl-199-219) Legend · LeBlanc · Mind/Order
 *     "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit
 *      token there. It becomes a copy of another unit there. Give it [Temporary]."
 *   Reflection      (unl-t06)     0 [M] domainless unit token
 *   Orb of Regret   (ogn-090-298) Gear · 1 — "[Exhaust]: Give a unit -1 [Might] this turn, to a
 *      minimum of 1 [Might]."
 *   Gust            (ogn-169-298) [Reaction] · 1 [chaos] — "Return a unit at a battlefield with
 *      3 [Might] or less to its owner's hand."  (the opponent's way to empty the battlefield)
 *
 * Rules: 383.3.b.1 (discard + exhaust is the trigger's BASE cost, paid at finalization) ·
 * 358.3.a (an impossible instruction is SKIPPED on resolution — nothing is rolled back) ·
 * 187.6 (a 0 [M] Reflection is a domainless unit token with 0 Might) · 185.3.a.2 (the copy is an
 * applied Layer that APPENDS copyable traits, cost included, on top of that 0-Might base) ·
 * 477.1.b/477.1.b.1 (copy effects live in the trait layer; "another unit there" = another than the
 * Reflection itself) · 142.4.b + 143.2.a (lethal damage is a NON-ZERO amount ≥ Might — a 0 [M] unit
 * needs at least 1 damage marked to be killed) · 816 ([Temporary]).
 *
 * Q: fire the Deceiver trigger and then leave the battlefield empty of every other unit before it
 *    resolves. Does the ability refuse before the discard and exhaust are paid, or does it resolve
 *    and leave a bare 0 [Might] Reflection on the board? If the token stays: is a 0-Might unit
 *    immediately dead, does it contribute 0 to combat, can it hold the battlefield by itself?
 *    Then the floor question a judge actually gets asked: does Orb of Regret's "to a minimum of
 *    1 [Might]" RAISE a 0-Might unit to 1, or does it merely cap the reduction and leave it at 0?
 *
 * Note on the premise: "another unit there" is another than the REFLECTION (rule 477.1.b.1's own
 * Deceiver example), so the CONQUERING unit is a perfectly legal copy source — the contrast test at
 * the bottom shows the token taking its traits. The only honest way to reach "no another unit there"
 * is to remove every other unit between finalization and resolution, which is what Gust does here.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";
const ORB = "ogn-090-298";
const GUST = "ogn-169-298";
const FODDER = "ogn-175-298"; // Shipyard Skulker — the card discarded for the base cost
const TOKEN = "token-reflection-1";

/**
 * P1's turn. Deceiver in the legend zone, an OPEN bf1 to walk into (conquering fires the trigger),
 * a 3-Might Walker in base, one card in hand to discard, an Orb of Regret in play, and P2 holding
 * a Gust with the runes to cast it.
 */
function board() {
  return scenario()
    .legend(P1, DECEIVER, "leblanc")
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
    .hand(P1, FODDER, "fodder")
    .gear(P1, ORB, "orb")
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .hand(P2, GUST, "gust");
}

/** Pass focus/priority until a non-action prompt or an open main phase. */
async function untilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** Conquer bf1 with the Walker and take the Deceiver offer, paying discard + exhaust at finalization. */
async function conqueredAndAccepted(extra?: (b: ReturnType<typeof board>) => ReturnType<typeof board>): Promise<Game> {
  const game = await (extra ? extra(board()) : board()).build();
  await game.p1.move("walker", "bf1");
  await untilPrompt(game);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
  await game.p1.pick("fodder");
  return game;
}

/** …then P2 Gusts the Walker off bf1 before the trigger resolves, so nothing else is "there". */
async function aloneAtResolution(): Promise<Game> {
  const game = await conqueredAndAccepted();
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("gust", { targets: "walker" });
  await game.settle();
  return game;
}

describe("Deceiver × Reflection alone at the battlefield × Orb of Regret's minimum", () => {
  test("the base cost is NOT rolled back when the copy has no source: discard in the trash, Deceiver exhausted, token still created (383.3.b.1, 358.3.a)", async () => {
    const game = await aloneAtResolution();
    expect(game.zoneOf("walker")).toBe("hand"); // Gust resolved first (LIFO)
    expect(game.p1.hand()).toEqual(["walker"]); // the discard is gone for good
    expect(game.p1.trash()).toContain("fodder");
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.p1.units("bf1")).toEqual([TOKEN]);
    expect(game.violations()).toEqual([]);
  });

  test("the copy instruction is SKIPPED (358.3.a), leaving a bare ready 0 [Might] Reflection with [Temporary] (187.6, 816)", async () => {
    const game = await aloneAtResolution();
    const tok = game.state(TOKEN);
    expect(tok.name).toBe("Reflection");
    expect(tok.isToken).toBe(true);
    expect(tok.baseMight).toBe(0);
    expect(tok.might).toBe(0); // contributes 0 to combat
    expect(tok.domains).toEqual([]); // 187.6 — domainless
    expect(tok.isReady).toBe(true); // 184.1 — "a READY Reflection"
    expect(tok.keywords).toContain("Temporary");
    expect(tok.controller).toBe(P1);
    expect(tok.location).toBe("bf1");
  });

  test("a 0 [Might] unit is NOT dead: lethal damage is a NON-ZERO amount ≥ Might (142.4.b, 143.2.a) — it survives at 0 damage", async () => {
    const game = await aloneAtResolution();
    expect(game.state(TOKEN).damage).toBe(0);
    expect(game.zoneOf(TOKEN)).toBe("battlefield-bf1");
    expect(game.has(TOKEN)).toBe(true);
  });

  test("the lone 0-Might token still HOLDS the battlefield — control is about presence, not Might", async () => {
    const game = await aloneAtResolution();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.units("bf1")).toEqual([TOKEN]);
    expect(game.p1.points()).toBe(1); // the conquer already scored; the token is what keeps bf1
  });

  test("Orb of Regret's 'to a minimum of 1 [Might]' CAPS the reduction — it does not RAISE the 0-Might token to 1", async () => {
    const game = await aloneAtResolution();
    await game.p1.activate("orb", 0, { answers: [TOKEN] });
    await game.settle();
    const tok = game.state(TOKEN);
    expect(tok.might).toBe(0); // NOT 1 — the floor bounds the penalty, it does not set Might
    expect(tok.mightModifier).toBe(0); // the -1 is simply not applied
    expect(game.state("orb").isExhausted).toBe(true); // the activation cost was still paid
  });

  test("the same Orb DOES take an ordinary 3-Might unit to 2 (the floor only bites at 1)", async () => {
    const game = await conqueredAndAccepted();
    await game.settle();
    await game.p1.activate("orb", 0, { answers: ["walker"] });
    await game.settle();
    expect(game.state("walker").might).toBe(2);
  });

  test("[Temporary] kills the lone token at the start of P1's next Beginning Phase, BEFORE scoring — it never holds bf1 for a point (816, 186.1)", async () => {
    const game = await aloneAtResolution();
    await game.advanceTurn(); // → P2's turn
    await game.advanceTurn(); // → P1's Beginning Phase: Temporary, then scoring
    expect(game.has(TOKEN)).toBe(false);
    expect(game.zoneOf(TOKEN)).toBe("gone"); // 186.1 — a token that leaves the board ceases to exist
    expect(game.p1.points()).toBe(1); // no hold point: it died before scoring
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("CONTRAST — with another unit still there at resolution the copy applies and the token takes its Might (185.3.a.2, 477.1.b)", async () => {
    const game = await conqueredAndAccepted(); // P2 never Gusts: the Walker is still at bf1
    await game.settle();
    const tok = game.state(TOKEN);
    expect(tok.name).toBe("Walker");
    expect(tok.might).toBe(3);
    expect(tok.keywords).toContain("Temporary"); // 477.2.a — the granted keyword rides on the copy
    expect(game.state("walker").keywords).not.toContain("Temporary"); // the source is untouched
  });
});
