/**
 * Interaction: Disintegrate (ogn-005-298) · Spell (Action) · Fury · 4
 *     "Deal 3 to a unit at a battlefield. If this kills it, do this: draw 1."
 *   × Temporal Portal (sfd-078-221) · Gear · Mind · 3
 *     "[rainbow], [Exhaust]: Give the next spell you play this turn [Repeat] equal to its cost."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Position: P1's turn; Temporal Portal ready in P1's base; P1 has 8 energy + 1 [rainbow]. P2 has X (3 Might),
 * Y (5 Might) and Z (3 Might) at bf1 (P2's). P1 activates the Portal, then casts Disintegrate.
 *
 * Question: what Repeat cost is offered and paid? (a) exec 1 → X, exec 2 → Y: how many "do this: draw 1"
 * reflexive items, how many cards drawn? (b) exec 1 → X, exec 2 → Z: do X and Z die in one Cleanup, how
 * many draws? (c) as (b) but P2 has a face-up Zhonya's Hourglass in base: is Zhonya's forced onto X (hit
 * first) or does P2 choose between X and Z; how many cards does P1 draw?
 *
 * Rules: 206 (Repeat equal to its cost = printed cost → Repeat [4]); 820.1.d.1 / 820.2.a (each execution
 * chooses its own target, all declared at play), 820.3.a (played once); 387.1 / 388.1 ("do this:" = a
 * reflexive trigger → its own chain item); 359.3.e.14 / .14.b (a linked "if this kills it" rider looks at
 * the kill ITS instruction caused; a replaced kill never happened); 428.5.c (Cleanup kill attributed to
 * the damaging spell); 321 / 323.5 (lethal damage kills only in the Cleanup after the spell leaves the
 * chain — one Cleanup for both executions); 373 (one single-use replacement vs two simultaneous deaths:
 * ITS controller chooses which to apply it to); 370.1.a.1.
 * FIXER-PRIMER "Multi-execution damage vs replacements": would-die replacements are consulted ONCE, in
 * that single Cleanup — never between [Repeat] executions.
 *
 * Expected: Repeat [4] offered (one instance); paying it = 8 energy total, one chain item, two targets.
 * (a) X dies (3/3), Y lives at 3 damage → exactly ONE reflexive draw item (P1, respondable) → P1 draws 1.
 * (b) X and Z die together in the same Cleanup → two reflexive items → P1 draws 2. (c) P2 is asked which
 * death the Hourglass replaces (X or Z — not pinned to X); the saved one is healed/exhausted/recalled,
 * Hourglass → trash, the other dies; only the un-replaced kill's rider fires → P1 draws exactly 1 either way.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISINTEGRATE = "ogn-005-298";
const TEMPORAL_PORTAL = "sfd-078-221";
const ZHONYAS = "ogn-077-298";

/** P1's turn: Portal ready, 8 energy + 1 [rainbow]; P2's X(3) / Y(5) / Z(3) at bf1; optional face-up Hourglass in P2's base. */
function board(opts: { zhonyas?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 8, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .unit(P2, "bf1", { might: 3, name: "Unit X" }, "x")
    .unit(P2, "bf1", { might: 5, name: "Unit Y" }, "y")
    .unit(P2, "bf1", { might: 3, name: "Unit Z" }, "z")
    .hand(P1, DISINTEGRATE, "dis");
  return opts.zhonyas ? s.gear(P2, ZHONYAS, "zh") : s;
}

function repeatOptions(game: Game): number[] {
  const field = game.p1.option("cast", "dis")?.fields.find((f) => f.name === "repeatCount");
  return ((field?.options ?? []) as number[]).map(Number);
}

/** Activate the Portal (resolves), cast Disintegrate with Repeat paid at [first, second], both pass once → the SPELL resolves. */
async function portalDisintegrate(targets: [string, string], opts: { zhonyas?: boolean } = {}): Promise<{ game: Game; hand0: number }> {
  const game = await board(opts).build();
  await game.p1.activate("portal");
  await game.settle();
  expect(game.chain()).toEqual([]);
  const hand0 = game.p1.hand().length; // includes Disintegrate
  await game.p1.cast("dis", { repeat: 1, targets });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // 4 + Repeat [4]; [rainbow] went to the Portal
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("dis")).toBe("trash"); // the spell itself has left the chain
  return { game, hand0 };
}

/** Reflexive "do this" items Disintegrate put on the chain (P1-controlled triggered abilities sourced on the spell). */
function reflexiveItems(game: Game) {
  return game.chain().filter((i) => i.cardId === "dis" && i.controller === P1 && i.triggered);
}

describe("Disintegrate with Portal-granted Repeat — per-execution 'if this kills it' riders, one Cleanup, one Zhonya's", () => {
  // ── the Repeat grant / cost ───────────────────────────────────────────────────────────────────

  test.failing("BUG: Temporal Portal: [rainbow] + exhaust; once it resolves Disintegrate (printed cost 4) is offered exactly ONE Repeat instance (Repeat [4], 206) and each execution may name its own battlefield unit (820.2.a)", async () => {
    const game = await board().build();
    expect(repeatOptions(game)).toEqual([]); // no Repeat before the Portal
    await game.p1.activate("portal");
    expect(game.state("portal").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 8, power: { rainbow: 0 } });
    await game.settle();
    expect(repeatOptions(game)).toEqual([1]);
    const field = game.p1.option("cast", "dis")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ max: 2, min: 1 });
    const pairs = (field?.options ?? []).filter((v) => Array.isArray(v) && v.length === 2) as string[][];
    expect(pairs).toContainEqual(["x", "y"]);
    expect(pairs).toContainEqual(["x", "z"]);
    expect(pairs).toContainEqual(["x", "x"]); // the same unit twice is a legal declaration too
  });

  test("paying the Repeat makes the play cost 4 + 4 = all 8 energy; Disintegrate is played ONCE — a single chain item carrying both declared targets (820.1.d.1, 820.3.a); unpaid, it costs just 4", async () => {
    const game = await board().build();
    await game.p1.activate("portal");
    await game.settle();
    await game.p1.cast("dis", { repeat: 1, targets: ["x", "y"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dis", controller: P1, targets: ["x", "y"], triggered: false, type: "spell" })]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);

    const single = await board().build();
    await single.p1.activate("portal");
    await single.settle();
    await single.p1.cast("dis", { targets: "x" }); // Repeat is optional
    expect(single.p1.energy()).toBe(4);
    expect(single.chain()).toHaveLength(1);
  });

  // ── (a) X then Y ──────────────────────────────────────────────────────────────────────────────

  test("(a) exec 1 → X, exec 2 → Y: when the spell leaves the chain X (3 dmg ≥ 3) is dead in P2's trash and Y lives at bf1 with 3 damage (321, 323.5, 428.5.c)", async () => {
    const { game } = await portalDisintegrate(["x", "y"]);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash()).toContain("x");
    expect(game.state("y")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("z")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("(a) exactly ONE reflexive 'do this: draw 1' item is created (X's execution killed; Y's did not) — a P1-controlled triggered item on the chain, respondable, P1 has not drawn yet (387.1, 388.1, 359.3.e.14)", async () => {
    const { game, hand0 } = await portalDisintegrate(["x", "y"]);
    await game.acceptTriggerOrder(); // no-op unless a soft order offer is pending
    expect(reflexiveItems(game)).toHaveLength(1);
    expect(game.chain()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // only Disintegrate has left the hand
  });

  test("(a) it resolves: P1 draws exactly 1 (hand −Disintegrate +1); chain empty, P1's open main phase", async () => {
    const { game, hand0 } = await portalDisintegrate(["x", "y"]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) X then Z, no Hourglass ────────────────────────────────────────────────────────────────

  test("(b) exec 1 → X, exec 2 → Z: both are lethal and die TOGETHER in the single Cleanup after the spell leaves the chain — both already in P2's trash at the first observable moment, Y untouched", async () => {
    const { game } = await portalDisintegrate(["x", "z"]);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("z")).toBe("trash");
    expect(game.state("y")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toEqual(["y"]);
  });

  test("(b) two kills → TWO reflexive 'draw 1' items (one per execution's rider), both P1's; they resolve and P1 draws exactly 2", async () => {
    const { game, hand0 } = await portalDisintegrate(["x", "z"]);
    await game.acceptTriggerOrder(); // 383.3.d — same-controller simultaneous triggers: soft order offer
    expect(reflexiveItems(game)).toHaveLength(2);
    expect(game.chain()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) X then Z, P2 has ONE face-up Zhonya's Hourglass ───────────────────────────────────────

  test("(c) with one Hourglass: the would-die replacement is consulted ONCE at that Cleanup where X and Z die simultaneously → P2 (its controller) is asked WHICH death it replaces, offered both X and Z — not pinned to X because X was hit first (373)", async () => {
    const { game } = await portalDisintegrate(["x", "z"], { zhonyas: true });
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, semantics: "replacement-assign", source: { cardId: "zh" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["x", "z"]);
    // While P2 decides, both lethal units are still on the battlefield with their 3 damage; the Hourglass is intact.
    expect(game.state("x")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("z")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.actingSeat()).toBe(P2);
    expect((await game.p1.try((p) => p.pick("x"))).ok).toBe(false); // P2's choice, not P1's
  });

  test("(c) P2 saves Z: Hourglass killed instead (P2's trash); Z healed, exhausted, recalled to P2's base; X dies to P2's trash; Y untouched", async () => {
    const { game } = await portalDisintegrate(["x", "z"], { zhonyas: true });
    await game.p2.pick("z");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("z")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["x", "zh"]);
    expect(game.state("y")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toEqual(["y"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected: X's death was NOT replaced, so Disintegrate killed X (428.5.c) and exec 1's "if this
  // kills it, do this: draw 1" fires → one reflexive item → P1 draws exactly 1; only Z's rider (replaced
  // kill, 370.1.a.1 / 359.3.e.14.b) yields nothing. Actual: once the die batch goes through the Hourglass's
  // replacement-assign prompt, NO reflexive item is created for the un-replaced kill either — P1 draws 0.
  test.failing("BUG: (c) P2 saves Z → exactly ONE reflexive draw (for X, the un-replaced kill); Z's replaced death yields none — P1 draws exactly 1 (359.3.e.14 / .14.b, 370.1.a.1)", async () => {
    const { game, hand0 } = await portalDisintegrate(["x", "z"], { zhonyas: true });
    await game.p2.pick("z");
    await game.acceptTriggerOrder();
    expect(reflexiveItems(game)).toHaveLength(1);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });

  test("(c′) symmetric — P2 saves X instead: X healed/exhausted/recalled to base, Z dies, Hourglass in the trash", async () => {
    const { game } = await portalDisintegrate(["x", "z"], { zhonyas: true });
    await game.p2.pick("x");
    await game.settle();
    expect(game.state("x")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("z")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // BUG — same defect as above, mirrored: Z's un-replaced kill should still draw P1 one card. Actual: 0.
  test.failing("BUG: (c′) P2 saves X → Z's kill still happened, so P1 draws exactly 1 (not 0, not 2)", async () => {
    const { game, hand0 } = await portalDisintegrate(["x", "z"], { zhonyas: true });
    await game.p2.pick("x");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });

  test("(c) contrast — Hourglass present but only ONE death (exec 1 → Y, exec 2 → X): no prompt (a single event, mandatory replacement); X is saved, Y lives at 3 damage, and P1 draws NOTHING — the only kill was replaced (370.1.a.1, 359.3.e.14.b)", async () => {
    const { game, hand0 } = await portalDisintegrate(["y", "x"], { zhonyas: true });
    expect(game.decision()?.kind).toBe("action"); // nothing to ask P2
    await game.settle();
    expect(game.state("x")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("y")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
    expect(game.violations()).toEqual([]);
  });
});
