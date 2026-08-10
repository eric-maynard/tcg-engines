/**
 * Interaction: Sun Disc (ogn-021-298) × Legion Rearguard (ogn-010-298) × Pirate's Haven (ogn-143-298)
 *
 *   Sun Disc — Gear · Fury · 2 + [fury]
 *     "[Exhaust]: [Legion] — The next unit you play this turn enters ready. (Get the effect if you've played
 *      another card this turn.)"                                        — P1, ready in base (played last turn)
 *   Legion Rearguard — Unit · Fury · 2 · 2 Might
 *     "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)"   — in hand
 *   Pirate's Haven — Gear · Body · 3
 *     "When you ready a friendly unit, give it +1 [Might] this turn."  — P1, in base
 *   plus a 1-cost "Warmup" unit (played first to turn Legion on), a vanilla 2-cost "Vanilla Two", and Wallop
 *   (ogn-146-298, "Ready a unit.") as the control that Haven is live.
 *
 * Rules: 812.1.c (Legion needs ANOTHER card played this turn), 355.1.a / 805.2 (an optional additional cost may
 * always be paid if payable — no refund), 805.2.b / 805.6 (Accelerate: a delayed replacement "enters ready" — it
 * never enters exhausted and then readies), 805.6.a (so ready-keyed abilities do not trigger), 370.1.c / 370.2 /
 * 372 (a replacement applies at most once per event; two replacements wanting the same event: one applies, the
 * other finds nothing left to replace), 143.4 (units otherwise enter exhausted), 415.3.b (readied by an effect IS
 * a Ready event — the Wallop control).
 *
 * Question: Legion on, P1 exhausts Sun Disc, then plays Rearguard PAYING Accelerate, then the vanilla unit.
 * (a) two "enter ready" replacements on one unit — double application / toggle / error? Is paying even legal?
 * (b) does Haven trigger for Rearguard? (c) did Rearguard consume Sun Disc's one-shot although Accelerate alone
 * sufficed — is the vanilla unit ready or exhausted? (d) contrast: Accelerate declined; and reverse order.
 *
 * Expected: (a) legal; [1][fury] spent; Rearguard simply enters READY once, no prompt, no error. (b) no — not a
 * Ready event; Rearguard stays 2. (c) consumed: the vanilla unit is not "the next unit" → EXHAUSTED. (d) declined:
 * identical board, P1 is [1][fury] richer; reverse: vanilla eats Sun Disc → ready, accelerated Rearguard → ready;
 * Haven never triggers in any line (Wallop on an exhausted unit does trigger it: +1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SUN_DISC = "ogn-021-298";
const LEGION_REARGUARD = "ogn-010-298";
const PIRATES_HAVEN = "ogn-143-298";
const WALLOP = "ogn-146-298"; // [Action] 2 · Body — "Ready a unit."

/**
 * P1's turn 2, Neutral Open. Base: Sun Disc (ready), Pirate's Haven. Hand: Warmup (1), Legion Rearguard (2,
 * Accelerate [1][fury]), Vanilla Two (2), Wallop (2). Pool: 1 + 2 + 1 + 2 + 2 = 8 energy, 1 fury — every
 * energy/fury left over is therefore attributable to a declined Accelerate or an uncast Wallop.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 1 } })
    .gear(P1, SUN_DISC, "disc")
    .gear(P1, PIRATES_HAVEN, "haven")
    .hand(P1, { energyCost: 1, might: 1, name: "Warmup" }, "warmup")
    .hand(P1, LEGION_REARGUARD, "rg")
    .hand(P1, { energyCost: 2, might: 2, name: "Vanilla Two" }, "van")
    .hand(P1, WALLOP, "wallop");
}

/** Legion on (Warmup played → enters exhausted), then Sun Disc exhausted and its ability resolved. Pool: 7 / fury 1. */
async function discPrimed(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("warmup");
  await game.settle();
  await game.p1.activate("disc");
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.state("disc").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 7, power: { fury: 1 } });
  return game;
}

/** Play `card` (with the given Accelerate choice for Rearguard), answer a 372 ordering prompt if the engine raises one, settle. */
async function playAndSettle(game: Game, card: string, accelerate?: boolean): Promise<void> {
  await game.p1.play(card, accelerate === undefined ? {} : { accelerate });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.semantics === "replacement-order") {
    await game.p1.pick(d.options[0]?.key as string); // either order yields the same single "enters ready"
  }
  const s = await game.settle();
  expect(s.reason).toBe("open");
}

/** The main line: disc primed → Rearguard WITH Accelerate → Vanilla Two. */
async function mainLine(): Promise<Game> {
  const game = await discPrimed();
  await playAndSettle(game, "rg", true);
  await playAndSettle(game, "van");
  return game;
}

describe("setup — Legion and the [Exhaust] activation", () => {
  test("Sun Disc is NOT activatable before another card has been played this turn (812.1.c); Warmup enters EXHAUSTED (143.4) and Haven stays silent; then the Disc is activatable", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "disc")).toBe(false);
    await game.p1.play("warmup");
    await game.settle();
    expect(game.state("warmup")).toMatchObject({ isExhausted: true, might: 1, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("activate", "disc")).toBe(true);
  });

  test("activating costs only the exhaust: Disc exhausted, pool untouched, an ability item on the chain that resolves to nothing visible yet — Warmup (already in play) is not readied by it", async () => {
    const game = await board().build();
    await game.p1.play("warmup");
    await game.settle();
    await game.p1.activate("disc");
    expect(game.state("disc").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 7, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P1, triggered: false, type: "ability" })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("warmup")).toMatchObject({ isExhausted: true, might: 1 });
    expect(game.p1.can("activate", "disc")).toBe(false);
  });
});

describe("(a) Rearguard with Accelerate PAID while Sun Disc's 'next unit enters ready' is waiting", () => {
  test("paying the pointless Accelerate is legal (355.1.a, 805.2): the play offers paidAdditionalCost true|false, and choosing true spends 2 + [1][fury] → pool 4 / fury 0, no refund", async () => {
    const game = await discPrimed();
    const payField = game.p1.option("playUnit", "rg")?.fields.find((f) => f.arg === "payOptional");
    expect(payField?.options).toEqual(expect.arrayContaining([true, false]));
    await game.p1.play("rg", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 0 } });
    expect(game.zoneOf("rg")).toBe("base");
  });

  test("two replacements, one event (370.2 / 372): Rearguard simply enters READY once — no toggle back to exhausted, no error, no dangling prompt, no invariant violation", async () => {
    const game = await discPrimed();
    await playAndSettle(game, "rg", true);
    expect(game.state("rg")).toMatchObject({ isExhausted: false, isReady: true, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Pirate's Haven does not see an 'enters ready' unit (805.6 / 805.6.a)", () => {
  test("no Haven item ever hits the chain when the accelerated + Sun-Disc'd Rearguard arrives; Rearguard is exactly 2 Might, mightModifier 0", async () => {
    const game = await discPrimed();
    await game.p1.play("rg", { accelerate: true });
    expect(game.chain().some((c) => c.cardId === "haven")).toBe(false);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("rg")).toMatchObject({ isReady: true, might: 2, mightModifier: 0 });
  });

  test("control — Haven IS live: Wallop readying the exhausted Warmup is a real Ready event (415.3.b) → Haven triggers → Warmup +1 this turn", async () => {
    const game = await discPrimed();
    await game.p1.cast("wallop", { targets: "warmup" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Wallop resolves → ready → Haven pending
    expect(game.state("warmup").isReady).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "haven", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("warmup")).toMatchObject({ isReady: true, might: 2, mightModifier: 1 });
  });
});

describe("(c) Sun Disc's one-shot was CONSUMED by Rearguard even though Accelerate alone would have done the job", () => {
  test("the vanilla unit played next is not 'the next unit you play' any more → it enters EXHAUSTED (143.4); pool ends 2 / fury 0", async () => {
    const game = await mainLine();
    expect(game.state("van")).toMatchObject({ isExhausted: true, might: 2, zone: "base" });
    expect(game.state("rg")).toMatchObject({ isReady: true, might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.chain()).toEqual([]); // and still no Haven anywhere
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) contrasts", () => {
  test("Accelerate DECLINED: Rearguard still enters ready (via Sun Disc) for just 2; the vanilla unit afterwards is exhausted — identical board, P1 is [1][fury] richer (3 / fury 1)", async () => {
    const game = await discPrimed();
    await playAndSettle(game, "rg", false);
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1 } });
    expect(game.state("rg")).toMatchObject({ isReady: true, might: 2, mightModifier: 0 });
    await playAndSettle(game, "van");
    expect(game.state("van")).toMatchObject({ isExhausted: true, might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.chain()).toEqual([]);
    // Same permanents in the same states as the main line.
    const main = await mainLine();
    for (const id of ["warmup", "rg", "van", "disc"]) {
      expect(game.state(id).isReady).toBe(main.state(id).isReady);
      expect(game.state(id).might).toBe(main.state(id).might);
    }
  });

  test("REVERSE order: the vanilla unit eats Sun Disc → READY; then Rearguard with Accelerate paid → READY on its own; both ready, pool 2 / fury 0, Haven never triggered (both still 2 Might)", async () => {
    const game = await discPrimed();
    await playAndSettle(game, "van");
    expect(game.state("van")).toMatchObject({ isReady: true, might: 2, mightModifier: 0 });
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1 } });
    await playAndSettle(game, "rg", true);
    expect(game.state("rg")).toMatchObject({ isReady: true, might: 2, mightModifier: 0 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.state("warmup")).toMatchObject({ isExhausted: true, might: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("reverse order with Accelerate declined: the vanilla unit is ready (Sun Disc), Rearguard — no longer 'next', no Accelerate — enters EXHAUSTED", async () => {
    const game = await discPrimed();
    await playAndSettle(game, "van");
    await playAndSettle(game, "rg", false);
    expect(game.state("van").isReady).toBe(true);
    expect(game.state("rg")).toMatchObject({ isExhausted: true, might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
  });
});
