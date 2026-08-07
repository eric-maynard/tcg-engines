/**
 * Interaction: Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] … If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and
 *      recall it."
 *   × two Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   × Flurry of Blades (ogn-133-298) · Spell · Body · 1 · Reaction — "Deal 1 to all units at
 *     battlefields."
 *
 * Question: P2 (NOT the turn player) has two Sentries at bf1 and ONE face-up Hourglass in base. On
 * P1's turn P1 resolves Flurry of Blades; both Sentries take lethal damage and would die in the same
 * Cleanup. Is P2 prompted to pick WHICH Sentry the single Hourglass saves? Is exactly one saved? Does
 * only the unsaved Sentry's Deathknell draw? Contrast: a single Sentry → one event, one mandatory
 * replacement → no prompt, auto-saved, no draw.
 *
 * Rules: 370.1.a.2 (deaths from one game action — Flurry's damage → Cleanup 323.5 — are
 * simultaneous), 373 (simultaneous events are treated separately for replacement purposes; the
 * replacement's controller decides which event to apply it to first — the rule's own example is
 * exactly two friendly deaths + one Zhonya's), 373.1.a (the replacement's heal/exhaust/recall is
 * performed before the other, unmodified death), 365.1 / 369.1 (once the Hourglass is in the trash
 * its passive no longer applies), 370.1.a.1 + 808.1.d.1 (a replaced death never happened → that
 * Sentry's Deathknell does not trigger), 808.2 (the other Sentry's Deathknell draws 1), 371.2 a
 * contrario (no "may" → the single-event case is forced, no prompt).
 *
 * Expected end state (two Sentries): a DECISION for P2 (pick/order over the two Sentries); after
 * P2 picks one: that Sentry in P2's base, exhausted, 0 damage; the other Sentry in P2's trash;
 * Hourglass in P2's trash; P2's hand +1 exactly.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const FLURRY_OF_BLADES = "ogn-133-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn. P2: `n` Sentries at bf1 + one face-up Hourglass in base. P1: Flurry in hand, 1 energy. */
function board(n: 1 | 2) {
  const s = scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentryA")
    .gear(P2, ZHONYAS, "zh")
    .hand(P1, FLURRY_OF_BLADES, "flurry");
  return n === 2 ? s.unit(P2, "bf1", WATCHFUL_SENTRY, "sentryB") : s;
}

/** Which of P2's pick/order options name a card (Sentry ids). */
function offered(game: Game): string[] {
  const d = game.decision();
  if (d?.kind === "pick") {
    return d.options.map((o) => o.card ?? o.key).sort();
  }
  if (d?.kind === "order") {
    return d.items.map((o) => o.card ?? o.key).sort();
  }
  return [];
}

/** Cast Flurry, settle; if P2 is asked which death to replace, save `keep`; settle again. */
async function flurryAndSave(game: Game, keep: string): Promise<void> {
  await game.p1.cast("flurry");
  const r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.seat === P2) {
    const d = game.decision();
    if (d?.kind === "order") {
      const other = d.items.map((i) => i.key).filter((k) => k !== keep);
      await game.p2.order([keep, ...other]);
    } else {
      await game.p2.pick(keep);
    }
    await game.settle();
  }
}

describe("Zhonya's Hourglass × two simultaneous Watchful Sentry deaths (Flurry of Blades)", () => {
  // ---- contrast: ONE Sentry — a single event, a single mandatory replacement -------------------

  test("contrast (one Sentry): no prompt at all — Flurry resolves and play returns to P1's open main phase", async () => {
    const game = await board(1).build();
    await game.p1.cast("flurry");
    expect(game.p1.energy()).toBe(0);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("flurry")).toBe("trash");
  });

  test("contrast (one Sentry): the death is replaced — Hourglass killed instead (P2 trash), Sentry healed, exhausted, recalled to P2's base (370.1, 371.2)", async () => {
    const game = await board(1).build();
    await game.p1.cast("flurry");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p2.trash()).toContain("zh");
    expect(game.state("sentryA")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
    expect(game.p2.units("bf1")).toEqual([]);
  });

  test("contrast (one Sentry): the replaced death never happened — Deathknell does not trigger, P2 draws nothing (370.1.a.1, 808.1.d.1)", async () => {
    const game = await board(1).build();
    const hand0 = game.p2.hand().length;
    const deck0 = game.p2.deck().length;
    await game.p1.cast("flurry");
    await game.settle();
    expect(game.p2.hand()).toHaveLength(hand0);
    expect(game.p2.deck()).toHaveLength(deck0);
    expect(game.chain()).toEqual([]);
  });

  // ---- TWO Sentries — two simultaneous events, one replacement ---------------------------------

  test("two Sentries: Flurry deals lethal damage to both in one action (they leave bf1 together, 370.1.a.2)", async () => {
    const game = await board(2).build();
    await game.p1.cast("flurry");
    await game.settle({ policy: "first" }); // take whatever P2 prompt might appear
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.locationOf("sentryA")).not.toBe("bf1");
    expect(game.locationOf("sentryB")).not.toBe("bf1");
  });

  // Expected (373): each death is a separate event; the ONE Hourglass qualifies for both, so its
  // controller P2 — not turn player / caster P1 — must choose which event it applies to. That is a
  // decision for P2 naming the two Sentries. Actual: no prompt; the engine applies the single
  // Hourglass to BOTH deaths (both Sentries end up recalled to base).
  test("BUG: two Sentries — P2 (the Hourglass's controller, not the turn player) should be PROMPTED to choose which death the single Hourglass replaces (373)", async () => {
    const game = await board(2).build();
    await game.p1.cast("flurry");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()?.seat).toBe(P2);
    expect(["pick", "order"]).toContain(game.decision()?.kind as string);
    expect(offered(game)).toEqual(["sentryA", "sentryB"]);
  });

  // Expected: exactly ONE Sentry is saved — one Hourglass = one "kill this instead" (365.1/369.1: once
  // it is in the trash the passive is gone for the second event). Actual: both Sentries are healed,
  // exhausted and recalled to base off a single Hourglass; nothing reaches the trash but the gear.
  test("BUG: two Sentries — exactly ONE Sentry ends in P2's base and exactly ONE in P2's trash (not zero, not both saved) (373, 365.1)", async () => {
    const game = await board(2).build();
    await flurryAndSave(game, "sentryA");
    const zones = [game.zoneOf("sentryA"), game.zoneOf("sentryB")].sort();
    expect(zones).toEqual(["base", "trash"]);
    expect(game.p2.units("base")).toHaveLength(1);
  });

  test("two Sentries: the Hourglass itself is killed instead → P2's trash, no longer in P2's gear (370.1)", async () => {
    const game = await board(2).build();
    await flurryAndSave(game, "sentryA");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p2.trash()).toContain("zh");
    expect(game.p2.gear()).not.toContain("zh");
  });

  // Expected (373 + 373.1.a): P2 picks sentryA → sentryA healed (0 damage), exhausted, recalled to
  // P2's base BEFORE sentryB's unmodified death is carried out → sentryB in P2's trash.
  // Actual: no prompt; both are recalled, sentryB never dies.
  test("BUG: two Sentries — P2 picks sentryA: sentryA in base healed + exhausted, sentryB dies to P2's trash (373.1.a)", async () => {
    const game = await board(2).build();
    await flurryAndSave(game, "sentryA");
    expect(game.state("sentryA")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("sentryB")).toBe("trash");
    expect(game.p2.trash()).toContain("sentryB");
  });

  // Expected: the choice is real — picking the OTHER Sentry flips who survives. Actual: no prompt.
  test("BUG: two Sentries — P2 picks sentryB instead: sentryB is the one saved to base, sentryA is the one in the trash", async () => {
    const game = await board(2).build();
    await flurryAndSave(game, "sentryB");
    expect(game.state("sentryB")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("sentryA")).toBe("trash");
  });

  // Expected (808.2 / 808.1.d.1): only the Sentry that really died triggers Deathknell → P2 draws
  // exactly 1 (not 2 — the saved one's trigger is removed; not 0 — the unsaved one did die).
  // Actual: both deaths are replaced, so P2 draws 0.
  test("BUG: two Sentries — only the UNSAVED Sentry's Deathknell draws: P2's hand +1 exactly, deck −1, chain empty afterwards (808.2, 808.1.d.1)", async () => {
    const game = await board(2).build();
    const hand0 = game.p2.hand().length;
    const deck0 = game.p2.deck().length;
    await flurryAndSave(game, "sentryA");
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(hand0 + 1);
    expect(game.p2.deck()).toHaveLength(deck0 - 1);
  });

  test("two Sentries: whatever the engine does, P1 (caster / turn player) is never the one asked, and afterwards it is P1's open main phase again with Flurry in P1's trash", async () => {
    const game = await board(2).build();
    await game.p1.cast("flurry");
    const r = await game.settle();
    if (r.reason === "unanswered") {
      expect(game.decision()?.seat).toBe(P2); // 373: the replacement's controller orders, not P1
      await game.settle({ policy: "first" });
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.p1.trash()).toContain("flurry");
    expect(game.violations()).toEqual([]);
  });
});
