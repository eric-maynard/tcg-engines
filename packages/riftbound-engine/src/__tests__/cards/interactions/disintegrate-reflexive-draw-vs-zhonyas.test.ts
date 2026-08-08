/**
 * Interaction: Disintegrate (ogn-005-298) · Spell · Fury · 4 · Action
 *     "Deal 3 to a unit at a battlefield. If this kills it, do this: draw 1."
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Question: on P1's turn, P1 Disintegrates P2's Watchful Sentry at a battlefield.
 *   Case A (no replacement): do both P1's "do this: draw 1" and P2's Deathknell "Draw 1" go on the
 *     chain, in what order, and can they be responded to?
 *   Case B (P2 has Zhonya's Hourglass face up in base): does P1 still get the reflexive draw, and does
 *     Sentry's Deathknell fire?
 *
 * Rules: 428.5.c (a Cleanup kill is attributed to the spell that dealt the damage → "this kills it");
 * 387.2 / 387.3 / 388.1 ("do this:" = Reflexive Trigger → a NEW pending chain item, controller P1);
 * 808.1.d.2 (Deathknell becomes a pending item for P2 at the same moment); 383.3.d.1 (simultaneous
 * triggers of different controllers: Turn Player P1 adds first, then P2 → P2's item is on top and
 * resolves first, LIFO); 321.1 (cleanup during resolution). Case B: 370.1.a.1 (a replaced death = the
 * kill did not occur); 359.3.e.14.b ("If this kills it" references the kill action directly → no
 * reflexive item); 808.1.d.1 (unit not sent to trash → Deathknell removed / never fires).
 *
 * Expected A: Sentry → trash; chain after Disintegrate leaves = [P1 reflexive draw, P2 Deathknell draw]
 * (bottom→top), each a normal respondable item; P2 draws first, then P1. Net P1 +1, P2 +1.
 * Expected B: Hourglass → trash; Sentry healed, exhausted, in base; P1 draws 0; P2 draws 0.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DISINTEGRATE = "ogn-005-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const ZHONYAS = "ogn-077-298";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn with exactly 4 energy; P2's Watchful Sentry sits at bf2 (P2's battlefield). */
function board(opts: { zhonyas?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", WATCHFUL_SENTRY, "sentry")
    .unit(P2, "base", { might: 2, name: "P2 Bystander" }, "bystander")
    .hand(P1, DISINTEGRATE, "dis");
  return opts.zhonyas ? s.gear(P2, ZHONYAS, "zh") : s;
}

/** Cast Disintegrate on Sentry and let ONLY the spell resolve (both pass once). */
async function disintegrated(opts: { zhonyas?: boolean } = {}): Promise<{ game: G; p1Hand0: number; p2Hand0: number }> {
  const game = await board(opts).build();
  const p1Hand0 = game.p1.hand().length; // includes Disintegrate
  const p2Hand0 = game.p2.hand().length;
  await game.p1.cast("dis", { targets: "sentry" });
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("dis")).toBe("trash");
  await game.acceptTriggerOrder(); // no-op unless a soft same-controller order offer is pending
  return { game, p1Hand0, p2Hand0 };
}

describe("Disintegrate × Watchful Sentry × Zhonya's Hourglass — reflexive 'do this' draw vs. replaced death", () => {
  test("setup: Disintegrate costs 4 and offers only units at a battlefield (Sentry, not the base bystander)", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "dis")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toEqual(["sentry"]);
    await expect(game.p1.cast("dis", { targets: "bystander" })).rejects.toThrow();
    await game.p1.cast("dis", { targets: "sentry" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dis"]);
  });

  // ---- Case A: no replacement ---------------------------------------------------------------------

  test("A: Disintegrate deals 3 ≥ 1 Might — Sentry is killed (a kill attributed to Disintegrate, 428.5.c) and goes to P2's trash", async () => {
    const { game } = await disintegrated();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.trash()).toContain("sentry");
  });

  test("A: Sentry's Deathknell is put on the chain as a P2-controlled triggered item that can be responded to — a chain priority window is open and P2 has not drawn yet (808.1.d.2)", async () => {
    const { game, p2Hand0 } = await disintegrated();
    expect(game.chain()).toEqual(expect.arrayContaining([expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true })]));
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.p2.hand()).toHaveLength(p2Hand0);
  });

  // Expected: "If this kills it, do this: draw 1" is a Reflexive Trigger — when the kill happens a NEW
  // P1-controlled ability is added to the chain (388.1); P1 has not drawn when Disintegrate leaves the
  // chain. Actual: the engine draws for P1 inline while Disintegrate resolves; no P1 item is created.
  test("A — P1's 'do this: draw 1' becomes its own chain item controlled by P1; P1 has NOT drawn yet when Disintegrate hits the trash (387.2, 388.1)", async () => {
    const { game, p1Hand0 } = await disintegrated();
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // only Disintegrate left the hand so far
    const p1Items = game.chain().filter((c) => c.controller === P1 && c.triggered);
    expect(p1Items).toHaveLength(1);
  });

  // Expected: two simultaneous triggers with different controllers → Turn Player P1 adds theirs first,
  // then P2 (383.3.d.1): chain bottom→top = [P1 reflexive draw, P2 Deathknell]. Actual: only the
  // Deathknell item exists.
  test("A — chain order after Disintegrate resolves is [P1 reflexive draw (bottom), P2 Deathknell (top)] (383.3.d.1)", async () => {
    const { game } = await disintegrated();
    expect(game.chain()).toHaveLength(2);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    expect(game.chain()[1]).toMatchObject({ cardId: "sentry", controller: P2, triggered: true });
  });

  // Expected: LIFO — P2's Deathknell (top) resolves first: P2 +1 while P1 still +0; then P1's reflexive
  // draw resolves: P1 +1. Actual: P1 already drew during Disintegrate's resolution.
  test("A — LIFO: P2's Deathknell draw resolves BEFORE P1's reflexive draw", async () => {
    const { game, p1Hand0, p2Hand0 } = await disintegrated();
    await game.acting().passPriority();
    await game.acting().passPriority(); // top item resolves
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1);
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // P1's item still waiting underneath
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1 + 1);
  });

  test("A net result once everything settles: P1 drew 1 (hand −Disintegrate +1), P2 drew 1; Sentry and Disintegrate in their owners' trash; back to P1's open main phase", async () => {
    const { game, p1Hand0, p2Hand0 } = await disintegrated();
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1 + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("dis")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---- Case B: Zhonya's Hourglass face up in P2's base ---------------------------------------------

  test("B: Zhonya's replaces Sentry's death — the Hourglass is killed instead (trash); Sentry is healed, exhausted and recalled to P2's base (370.1.a.1)", async () => {
    const { game } = await disintegrated({ zhonyas: true });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("sentry")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
    expect(game.p2.units("bf2")).toEqual([]);
    expect(game.p2.trash()).not.toContain("sentry");
  });

  test("B: Sentry never went to the trash, so its Deathknell does not fire — no Sentry item on the chain and P2 draws 0 (808.1.d.1)", async () => {
    const { game, p2Hand0 } = await disintegrated({ zhonyas: true });
    expect(game.chain().some((c) => c.cardId === "sentry")).toBe(false);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand0);
  });

  // Expected: the death was replaced, so Disintegrate did NOT kill it (370.1.a.1); "If this kills it"
  // directly references the kill action (359.3.e.14.b) → no reflexive draw item is created and P1 draws
  // nothing. Actual: P1 draws 1 anyway.
  test("B — a replaced death is not a kill: NO reflexive 'draw 1' for P1 (370.1.a.1, 359.3.e.14.b)", async () => {
    const { game, p1Hand0 } = await disintegrated({ zhonyas: true });
    expect(game.chain().filter((c) => c.controller === P1)).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // only Disintegrate left; drew 0
  });

  test("B net board: Disintegrate and the Hourglass in their owners' trash, chain empty, P1's open main phase, no invariant violations", async () => {
    const { game } = await disintegrated({ zhonyas: true });
    await game.settle();
    expect(game.p1.trash()).toContain("dis");
    expect(game.p2.trash()).toContain("zh");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
