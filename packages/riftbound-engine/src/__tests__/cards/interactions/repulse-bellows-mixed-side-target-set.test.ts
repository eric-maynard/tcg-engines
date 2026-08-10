/**
 * Interaction: Repulse (unl-106-219) · Spell · Body · 1+[body] · [Reaction]
 *     "Choose a friendly unit at a battlefield. Counter an enemy spell or ability that chooses it and no other friendly unit."
 *   × Bellows Breath (sfd-080-221) · Spell · Mind · 1+[mind] · [Action] · [Repeat] [1][mind]
 *     "Deal 1 to up to three units at the same location."
 *   × Not So Fast (sfd-045-221) · Spell · Calm · 2+[calm] · [Reaction]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   (+ Ravenbloom Student ogn-103-298 as P1's unit A: "When you play a spell, give me +1 [Might] this turn." — 425.1.b probe)
 *
 * Rules: 740.1.a/b + 355.9.b ("friendly"/"enemy" are read from Repulse's controller P2), 355.8 (a spell
 * with no legal choice cannot be played — it is not OFFERED, rather than fizzling), 820.3 / 820.3.a (a
 * Repeat spell is ONE chain item whose choices span every execution), 425.1.a / .a.1 (a countered card does
 * nothing and goes to trash), 425.1.b (it was not "played" for play-triggers), 425.1.c/.c.1 (no refund,
 * additional costs included), 340.1 (LIFO).
 *
 * Board: P1's turn. P2 holds bf1 with 1-Might X and Y, bf2 with Z, and has H1/H2 in base; P1 moves A
 * (Ravenbloom Student) into bf1 → combat showdown, P1 has Focus and casts Bellows Breath (Action) there.
 * Question / expected — for each Bellows finalization: is Repulse offered (via X)? Is NSF? Outcome if countered:
 *   (i)   X only            ⇒ Repulse offered, NSF offered; countered ⇒ X undamaged, Bellows → P1 trash, no refund.
 *   (ii)  X + Y             ⇒ Repulse NOT offered (another P2-friendly unit chosen); NSF offered, counters the
 *                              whole item — X and Y both undamaged.
 *   (iii) X + P1's A        ⇒ A is ENEMY to P2 ⇒ Repulse offered; counters everything — neither X nor A hit.
 *   (iv)  Repeat: X then Z  ⇒ one item choosing X and Z ⇒ Repulse NOT offered; NSF offered, removes both
 *                              executions; the Repeat [1][mind] is not refunded either.
 *   (v)   H1 + H2 in base   ⇒ Repulse NOT offered (needs a friendly unit AT A BATTLEFIELD); NSF offered.
 *   Every countered line: Bellows in P1's TRASH, and Ravenbloom Student gets NO +1 (425.1.b); un-countered
 *   control: it does.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REPULSE = "unl-106-219";
const BELLOWS_BREATH = "sfd-080-221";
const NOT_SO_FAST = "sfd-045-221";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/**
 * P1's turn, main phase. P1: exactly base + Repeat for Bellows (2 energy, 2 mind), Ravenbloom Student "a"
 * in base (moved into bf1 by `bellows()`). P2: 3 energy + 1 body + 1 calm (enough for EITHER counter),
 * X/Y at bf1, Z at bf2, H1/H2 in base, Repulse + Not So Fast in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .resources(P2, { energy: 3, power: { body: 1, calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "X" }, "x")
    .unit(P2, "bf1", { might: 1, name: "Y" }, "y")
    .unit(P2, "bf2", { might: 1, name: "Z" }, "z")
    .unit(P2, "base", { might: 1, name: "H1" }, "h1")
    .unit(P2, "base", { might: 1, name: "H2" }, "h2")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "a")
    .hand(P1, BELLOWS_BREATH, "bb")
    .hand(P2, REPULSE, "repulse")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** Flatten a seat's `targets` field for a cast into the set of ids offered (any role). */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** Raw target tuples offered for a cast (to check multi-target sets like ["x","z"]). */
function tuplesOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((v) => JSON.stringify(v));
}

/**
 * P1 moves A into bf1 (combat showdown, P1 holds Focus), casts Bellows Breath with the given finalization,
 * then passes priority so P2 holds it over the pending Bellows item.
 */
async function bellows(args: { targets: string[]; repeat?: number }): Promise<Game> {
  const game = await board().build();
  await game.p1.move("a", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "bb")).toBe(true); // [Action] is playable while P1 has Focus
  await game.p1.cast("bb", args.repeat ? { repeat: args.repeat, targets: args.targets } : { targets: args.targets });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bb", controller: P1, targets: args.targets })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/**
 * P2 casts Repulse protecting `unit` against chain item `item`, whichever target shape the engine offers
 * (a two-role [unit, item] tuple, or the item alone with the friendly-unit choice folded into legality).
 */
async function castRepulse(game: Game, unit: string, item: string): Promise<void> {
  const opts = game.p2.option("cast", "repulse")?.fields.find((f) => f.name === "targets")?.options ?? [];
  const twoRole = opts.some((o) => Array.isArray(o) && o.length === 2);
  if (twoRole) {
    // If the friendly-unit role is exposed, X must be the ONLY unit it offers for this item.
    const unitsForItem = opts.filter((o) => Array.isArray(o) && o[1] === item).map((o) => (o as string[])[0]);
    expect(unitsForItem).toEqual([unit]);
  }
  await game.p2.cast("repulse", { targets: twoRole ? [unit, item] : item });
}

/** Everyone passes until the chain is empty (stops before combat — the showdown's Focus comes back). */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    const d = game.decision();
    expect(d?.kind).toBe("action");
    await game.seat(d!.seat).passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Repulse × Bellows Breath (× Not So Fast) — which Bellows finalizations Repulse may answer", () => {
  // ── controls ────────────────────────────────────────────────────────────────────────────────────

  test("control: un-countered Bellows on X kills X (1 dmg ≥ 1 Might) and Ravenbloom Student gets its 'when you play a spell' +1 (2 → 3)", async () => {
    const game = await bellows({ targets: ["x"] });
    await resolveChain(game);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.state("a").might).toBe(3);
    expect(game.zoneOf("bb")).toBe("trash");
  });

  test("control: neither counter is playable in P1's Neutral Open state before anything is on the chain (Reactions need a window)", async () => {
    const game = await board().build();
    expect(game.p2.can("cast", "repulse")).toBe(false);
    expect(game.p2.can("cast", "nsf")).toBe(false);
  });

  test("Bellows' finalization menu itself: X alone, X+Y, X+A (same location bf1), H1+H2 (base) are offered; X+Z (different locations) is NOT a single-execution set but IS offered as a Repeat pair", async () => {
    const game = await board().build();
    await game.p1.move("a", "bf1");
    const tuples = tuplesOffered(game, "p1", "bb");
    expect(tuples).toContain(JSON.stringify(["x"]));
    expect(tuples).toContain(JSON.stringify(["x", "y"]));
    expect(tuples).toContain(JSON.stringify(["x", "a"]));
    expect(tuples).toContain(JSON.stringify(["h1", "h2"]));
    expect(tuples).toContain(JSON.stringify(["x", "z"])); // Repeat: execution 1 → X @bf1, execution 2 → Z @bf2
    // …but only as the Repeat line: every variant naming X and Z carries repeatCount 1 (not "at the same location" otherwise),
    // whereas X+Y fits in a single execution.
    const variants = game.p1.option("cast", "bb")?.variants ?? [];
    const xz = variants.filter((v) => JSON.stringify(v.params.targets) === JSON.stringify(["x", "z"]));
    expect(xz.length).toBeGreaterThan(0);
    expect(xz.every((v) => v.params.repeatCount === 1)).toBe(true);
    expect(variants.some((v) => JSON.stringify(v.params.targets) === JSON.stringify(["x", "y"]) && !v.params.repeatCount)).toBe(true);
  });

  // ── (i) X only ─────────────────────────────────────────────────────────────────────────────────

  test("(i) Bellows → X only: Repulse IS offered against Bellows (via X), and so is Not So Fast", async () => {
    const game = await bellows({ targets: ["x"] });
    expect(game.p2.can("cast", "repulse")).toBe(true);
    expect(targetsOffered(game, "p2", "repulse")).toContain("bb");
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(targetsOffered(game, "p2", "nsf")).toEqual(["bb"]);
  });

  test("(i) Repulse resolves first (LIFO) and counters Bellows: X takes 0 and stays, Bellows → P1's TRASH (not hand), Repulse → P2's trash, P1's 1+[mind] NOT refunded, P2 paid 1+[body]", async () => {
    const game = await bellows({ targets: ["x"] });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } }); // base cost paid, repeat not bought
    await castRepulse(game, "x", "bb");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { body: 0, calm: 1 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bb", "repulse"]);
    await resolveChain(game);
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.p1.trash()).toContain("bb");
    expect(game.p1.hand()).not.toContain("bb");
    expect(game.zoneOf("repulse")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    // Back to the showdown, P1's Focus — combat has not happened yet.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("(i) countered Bellows was not 'played' for triggers (425.1.b): Ravenbloom Student stays at 2 Might", async () => {
    const game = await bellows({ targets: ["x"] });
    await castRepulse(game, "x", "bb");
    await resolveChain(game);
    expect(game.state("a").might).toBe(2);
  });

  test("(i) Not So Fast does the same job here: counters Bellows, X undamaged, P2 paid 2+[calm]", async () => {
    const game = await bellows({ targets: ["x"] });
    await game.p2.cast("nsf", { targets: "bb" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { body: 1, calm: 0 } });
    await resolveChain(game);
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
  });

  // ── (ii) X + Y ─────────────────────────────────────────────────────────────────────────────────

  test("(ii) Bellows → X and Y (two P2-friendly units): Repulse is NOT playable at all (355.8 — no legal pair), a forced cast is refused and nothing is paid", async () => {
    const game = await bellows({ targets: ["x", "y"] });
    expect(game.p2.can("cast", "repulse")).toBe(false);
    expect(targetsOffered(game, "p2", "repulse")).toEqual([]);
    expect((await game.p2.try((p) => p.cast("repulse", { targets: "bb" }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.cast("repulse", { targets: ["x", "bb"] }))).ok).toBe(false);
    expect(game.zoneOf("repulse")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { body: 1, calm: 1 } });
    expect(game.chain()).toHaveLength(1);
  });

  test("(ii) Not So Fast IS legal (enemy spell choosing a friendly unit) and counters the WHOLE item — X and Y both undamaged and alive, Bellows → trash", async () => {
    const game = await bellows({ targets: ["x", "y"] });
    expect(game.p2.can("cast", "nsf")).toBe(true);
    await game.p2.cast("nsf", { targets: "bb" });
    await resolveChain(game);
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("y")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.state("a").might).toBe(2);
  });

  test("(ii) control: un-countered, X and Y both die", async () => {
    const game = await bellows({ targets: ["x", "y"] });
    await resolveChain(game);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("y")).toBe("trash");
  });

  // ── (iii) X + P1's own A ───────────────────────────────────────────────────────────────────────

  test("(iii) Bellows → X and P1's own A: A is ENEMY to P2, so Bellows 'chooses X and no other friendly unit' — Repulse IS offered (740.1 / 355.9.b); NSF too", async () => {
    const game = await bellows({ targets: ["x", "a"] });
    expect(game.p2.can("cast", "repulse")).toBe(true);
    expect(targetsOffered(game, "p2", "repulse")).toContain("bb");
    expect(game.p2.can("cast", "nsf")).toBe(true);
  });

  test("(iii) Repulse counters the ENTIRE spell: neither X nor P1's A is damaged; Bellows → trash; Student stays 2", async () => {
    const game = await bellows({ targets: ["x", "a"] });
    await castRepulse(game, "x", "bb");
    await resolveChain(game);
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("a")).toMatchObject({ damage: 0, might: 2, zone: "battlefield-bf1" });
    expect(game.zoneOf("bb")).toBe("trash");
  });

  test("(iii) control: un-countered, X dies and A (2 Might +1 from its own trigger) survives with 1 damage", async () => {
    const game = await bellows({ targets: ["x", "a"] });
    await resolveChain(game);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 1, might: 3, zone: "battlefield-bf1" });
  });

  // ── (iv) Repeat: X @bf1 then Z @bf2 ────────────────────────────────────────────────────────────

  test("(iv) Repeat paid (2 energy + 2 mind up front): ONE chain item whose targets are X and Z (820.3/820.3.a) — Repulse is NOT playable (two P2-friendly units), NSF is", async () => {
    const game = await bellows({ repeat: 1, targets: ["x", "z"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]?.targets).toEqual(["x", "z"]);
    expect(game.p2.can("cast", "repulse")).toBe(false);
    expect((await game.p2.try((p) => p.cast("repulse", { targets: "bb" }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.cast("repulse", { targets: ["z", "bb"] }))).ok).toBe(false);
    expect(game.zoneOf("repulse")).toBe("hand");
    expect(game.p2.can("cast", "nsf")).toBe(true);
  });

  test("(iv) NSF counters the repeated Bellows: BOTH executions are gone — X and Z undamaged; the Repeat additional cost is not refunded either (425.1.c.1); Bellows → trash", async () => {
    const game = await bellows({ repeat: 1, targets: ["x", "z"] });
    await game.p2.cast("nsf", { targets: "bb" });
    await resolveChain(game);
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("z")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.state("a").might).toBe(2);
  });

  test("(iv) control: un-countered, the two executions kill X (bf1) and Z (bf2)", async () => {
    const game = await bellows({ repeat: 1, targets: ["x", "z"] });
    await resolveChain(game);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("z")).toBe("trash");
  });

  // ── (v) targets in P2's base ───────────────────────────────────────────────────────────────────

  test("(v) Bellows → H1 + H2 in P2's BASE: Repulse is NOT playable (its friendly unit must be 'at a battlefield'), NSF (no location clause) is", async () => {
    const game = await bellows({ targets: ["h1", "h2"] });
    expect(game.p2.can("cast", "repulse")).toBe(false);
    expect((await game.p2.try((p) => p.cast("repulse", { targets: "bb" }))).ok).toBe(false);
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(targetsOffered(game, "p2", "nsf")).toEqual(["bb"]);
  });

  test("(v) even a single base target (H1 only — 'it and no other friendly unit' satisfied) gives Repulse nothing: H1 is not at a battlefield", async () => {
    const game = await bellows({ targets: ["h1"] });
    expect(game.p2.can("cast", "repulse")).toBe(false);
    expect(game.p2.can("cast", "nsf")).toBe(true);
  });

  test("(v) NSF counters it: H1 and H2 undamaged in base, Bellows → P1's trash, nothing refunded, Student stays 2", async () => {
    const game = await bellows({ targets: ["h1", "h2"] });
    await game.p2.cast("nsf", { targets: "bb" });
    await resolveChain(game);
    expect(game.state("h1")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("h2")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.state("a").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
