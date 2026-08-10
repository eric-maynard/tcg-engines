/**
 * Interaction: Jhin, Meticulous Killer (unl-089-219) · Champion Unit · Mind · 4 · 4 Might
 *     "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *      If you've spent [4] or more to play a spell this turn, you may play me for [mind]."
 *   × Vaults of Helia (unl-219-219) · Battlefield
 *     "When you hold here, your non-token units cost [1] more to play this turn."
 *   × Astral Heron (ven-044-166) · Unit · Calm · 7 · 7 Might
 *     "When you play your first card each turn, if I'm at a battlefield, your next card costs
 *      [2][rainbow][rainbow] less."
 *   (+ Concentrate unl-091-219 · Spell · Body · 5 — "Draw 2." as the qualifying first spell)
 *
 * Rules: 356.1.a ("play me for [Cost]" REPLACES the base cost), 356.1.b.3 (increases still apply to a
 * replaced/zeroed base), 356.3 (apply increases), 356.4.d / 356.4.d.1 (total-cost discounts apply after
 * component discounts — i.e. after 356.3), 356.6 (no component goes below 0), 390.4 / 391 (Heron's "your
 * next card" is a one-shot delayed effect consumed by the next play).
 *
 * Question: P1 starts the turn holding the Vaults with Astral Heron standing there. First card: Concentrate
 * (5) paid in full → Jhin's "[4] or more on a spell" is met AND Heron's next-card discount is pending. P1 now
 * plays Jhin (printed 4, no power) for the alternative cost.
 *   (a) exact total? (b) Heron in base (no discount): total? (c) decline "for [mind]" with Vaults + Heron:
 *   total? (d) no Vaults hold, alt cost, no Heron: total? (e) first spell cost only 3: alt offered at all?
 *
 * Expected: (a) [mind] replaces 4 → 0+[mind]; +[1] Vaults → [1][mind]; −[2][A][A] Heron → energy floors at 0,
 * the [mind] pip is covered → Jhin is FREE (0/0); Heron's discount is consumed. (b) [1]+[mind]. (c) 4+1−2 = 3
 * energy, 0 power. (d) 0+[mind]. (e) not offered — only the printed cost (4, +1 under Vaults = 5). Vision
 * resolves normally throughout.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JHIN = "unl-089-219";
const VAULTS = "unl-219-219";
const HERON = "ven-044-166";
const CONCENTRATE = "unl-091-219";
/** A vanilla 3-cost draw spell — too cheap to unlock Jhin's alternative cost. */
const CHEAP_SPELL = { abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }], cardType: "spell", energyCost: 3, name: "Cheap Cantrip" } as const;

interface Setup {
  /** Where Astral Heron is: alone AT the Vaults (it is the holder), in P1's base (a vanilla Holder holds), or absent. */
  readonly heron: "vaults" | "base" | "none";
  /** Is battlefield A the live Vaults of Helia (true) or a blank battlefield (false)? P1 holds it either way. */
  readonly vaults: boolean;
  /** Which spell P1 opens the turn with. */
  readonly first: "conc" | "cheap";
}

/** P2 about to end turn 2. P1 controls A (Vaults or blank) via Heron-or-Holder; Jhin + the first spell in hand. */
function board(s: Setup) {
  let b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("A", s.vaults ? { controller: P1, def: VAULTS, inert: false, owner: P1 } : { controller: P1 })
    .battlefield("B", { controller: null });
  b = s.heron === "vaults" ? b.unit(P1, "A", HERON, "heron") : b.unit(P1, "A", { might: 1, name: "Holder" }, "holder");
  if (s.heron === "base") {
    b = b.unit(P1, "base", HERON, "heron");
  }
  b = s.first === "conc" ? b.hand(P1, CONCENTRATE, "first") : b.hand(P1, CHEAP_SPELL, "first");
  return b.hand(P1, JHIN, "jhin").fillDecks({ main: 12, runes: 0 }); // no channel noise; resources injected below
}

/**
 * P2 ends → P1 holds A (Vaults trigger, if live, passes through) → P1's Main Phase with exactly `energy` + `mind`;
 * then P1 casts the first spell and it resolves (Heron, if at A, triggers off it and its discount is now pending).
 */
async function afterFirstSpell(s: Setup, energy: number, mind: number): Promise<Game> {
  const game = await board(s).build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  expect(game.p1.points()).toBe(1); // the Hold scored either way
  await game.p1.do("addResources", { energy, power: { mind } });
  await game.p1.cast("first");
  await game.settle();
  expect(game.zoneOf("first")).toBe("trash");
  expect(game.chain()).toEqual([]);
  return game;
}

/** Is the "play me for [mind]" alternative among Jhin's offered play variants? */
const altOffered = (game: Game): boolean =>
  (game.p1.option("play", "jhin")?.variants ?? []).some((v) => (v.params as { altCost?: unknown }).altCost === true);

/** Pending one-shot / turn replacements owned by P1, by source card. */
const replSources = (game: Game): string[] => (game.gameState.activeReplacements ?? []).map((r) => (r as { sourceCardId?: string }).sourceCardId ?? "?").sort();

/** Let Jhin's Vision trigger resolve: look at the top card, decline the recycle. */
async function finishVision(game: Game): Promise<void> {
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jhin", controller: P1, triggered: true })]);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, source: { cardId: "jhin", pendingChoiceType: "reveal-and-pick" } });
  await game.p1.decline();
  const done = await game.settle();
  expect(done.reason).toBe("open");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

describe("Jhin 'for [mind]' under Vaults of Helia (+1) and Astral Heron (−[2][A][A]) — order 356.1 → 356.3 → 356.4 nets zero", () => {
  test("setup (a): holding the Vaults with Heron there leaves the +[1] unit surcharge active; Concentrate (5) paid in full unlocks Jhin's alt cost AND triggers Heron → its next-card discount is pending", async () => {
    const game = await afterFirstSpell({ first: "conc", heron: "vaults", vaults: true }, 6, 1);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } }); // 6 − 5
    expect(replSources(game)).toEqual(["A", "heron"]);
    expect(game.p1.can("play", "jhin")).toBe(true);
    expect(altOffered(game)).toBe(true);
  });

  test("(a) taking 'for [mind]': [mind] replaces 4 → +1 (Vaults) → −[2][A][A] (Heron) = 0 energy AND 0 power — Jhin is FREE: the 1 energy and the [mind] both stay in pool (356.1.a, 356.3, 356.4.d, 356.6)", async () => {
    const game = await afterFirstSpell({ first: "conc", heron: "vaults", vaults: true }, 6, 1);
    await game.p1.play("jhin", { params: { altCost: true }, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.zoneOf("jhin")).toBe("base");
    expect(game.state("jhin")).toMatchObject({ controller: P1, isExhausted: true, might: 4 });
  });

  test("(a) …even with an EMPTY pool (0 energy, 0 power) the alt play is legal and succeeds — nothing is owed", async () => {
    const game = await afterFirstSpell({ first: "conc", heron: "vaults", vaults: true }, 5, 0);
    expect([game.p1.energy(), game.p1.power()]).toEqual([0, 0]);
    expect(game.p1.can("play", "jhin")).toBe(true);
    expect(altOffered(game)).toBe(true);
    await game.p1.play("jhin", { params: { altCost: true }, to: "base" });
    expect([game.p1.energy(), game.p1.power()]).toEqual([0, 0]);
    expect(game.zoneOf("jhin")).toBe("base");
  });

  test("(a) Heron's one-shot discount is CONSUMED by Jhin (only the Vaults' turn-long surcharge remains); Vision triggers and resolves normally (390.4, 391)", async () => {
    const game = await afterFirstSpell({ first: "conc", heron: "vaults", vaults: true }, 6, 1);
    await game.p1.play("jhin", { params: { altCost: true }, to: "base" });
    expect(replSources(game)).toEqual(["A"]);
    await finishVision(game);
  });

  // ── (b) Heron in base: no discount ───────────────────────────────────────────────────────────

  test("(b) Heron in BASE (a vanilla Holder holds the Vaults): no Heron trigger, so 'for [mind]' costs [1][mind] — 0+[mind] then +1 (356.1.a, 356.1.b.3, 356.3)", async () => {
    const game = await afterFirstSpell({ first: "conc", heron: "base", vaults: true }, 6, 1);
    expect(replSources(game)).toEqual(["A"]); // Vaults only
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(altOffered(game)).toBe(true);
    await game.p1.play("jhin", { params: { altCost: true }, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("jhin")).toBe("base");
    await finishVision(game);
  });

  test("(b) …and with only [mind] (0 energy) the alt play is NOT affordable under the Vaults — the +1 is real", async () => {
    const game = await afterFirstSpell({ first: "conc", heron: "base", vaults: true }, 5, 1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.p1.can("play", "jhin")).toBe(false);
    const r = await game.p1.try((p) => p.play("jhin", { params: { altCost: true }, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("jhin")).toBe("hand");
  });

  // ── (c) decline the alt cost with Vaults + Heron ─────────────────────────────────────────────

  test("(c) DECLINING 'for [mind]' with Vaults + Heron live: printed 4 +1 (Vaults) −2 (Heron) = 3 energy, 0 power — the [A][A] half finds no power to reduce and the [mind] stays", async () => {
    const game = await afterFirstSpell({ first: "conc", heron: "vaults", vaults: true }, 9, 1);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 1 } });
    await game.p1.play("jhin", { to: "base" }); // plain play = printed cost
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.zoneOf("jhin")).toBe("base");
    expect(replSources(game)).toEqual(["A"]); // Heron's discount spent on the printed-cost play too
    await finishVision(game);
  });

  test("(c) …2 energy is one short for the printed route (needs 3), while the alt route stays free", async () => {
    const game = await afterFirstSpell({ first: "conc", heron: "vaults", vaults: true }, 7, 0);
    expect([game.p1.energy(), game.p1.power()]).toEqual([2, 0]);
    const variants = game.p1.option("play", "jhin")?.variants ?? [];
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every((v) => (v.params as { altCost?: unknown }).altCost === true)).toBe(true); // only the alt route is legal
  });

  // ── (d) no Vaults, no Heron ──────────────────────────────────────────────────────────────────

  test("(d) blank battlefield held (no Vaults surcharge), no Heron: 'for [mind]' is exactly 0 energy + [mind]", async () => {
    const game = await afterFirstSpell({ first: "conc", heron: "none", vaults: false }, 6, 1);
    expect(replSources(game)).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    await game.p1.play("jhin", { params: { altCost: true }, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0 } });
    expect(game.zoneOf("jhin")).toBe("base");
    await finishVision(game);
  });

  test("(d) contrast: the printed route there is the plain 4", async () => {
    const game = await afterFirstSpell({ first: "conc", heron: "none", vaults: false }, 9, 1);
    await game.p1.play("jhin", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
  });

  // ── (e) a 3-cost first spell does not qualify ────────────────────────────────────────────────

  test("(e) first spell cost only 3: 'spent [4] or more to play a spell' is NOT met → the alt cost is not offered; under the Vaults only the printed 4+1 = 5 plays him ([mind] untouched)", async () => {
    const short = await afterFirstSpell({ first: "cheap", heron: "none", vaults: true }, 7, 1); // 7 − 3 = 4 left
    expect(short.p1.resources()).toEqual({ energy: 4, power: { mind: 1 } });
    expect(altOffered(short)).toBe(false);
    expect(short.p1.can("play", "jhin")).toBe(false); // 5 needed
    expect((await short.p1.try((p) => p.play("jhin", { params: { altCost: true }, to: "base" }))).ok).toBe(false);

    const enough = await afterFirstSpell({ first: "cheap", heron: "none", vaults: true }, 8, 1); // 5 left
    expect(altOffered(enough)).toBe(false);
    await enough.p1.play("jhin", { to: "base" });
    expect(enough.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(enough.zoneOf("jhin")).toBe("base");
    await finishVision(enough);
  });

  test("(e) …two cheap spells summing to 6 do not qualify either — it is [4]+ on ONE spell", async () => {
    const game = await board({ first: "cheap", heron: "none", vaults: false }).hand(P1, CHEAP_SPELL, "second").build();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 6, power: { mind: 1 } });
    await game.p1.cast("first");
    await game.settle();
    await game.p1.cast("second");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(altOffered(game)).toBe(false);
    expect(game.p1.can("play", "jhin")).toBe(false);
  });

  // ── side finding ─────────────────────────────────────────────────────────────────────────────

  test("the Vaults' hold trigger chooses no Game Object — with two friendly units on the board it resolves WITHOUT a 'Choose a target' prompt (355.5: only instructions that name an object ask for one)", async () => {
    // "your non-token units cost [1] more" is a cost rider on future plays; nothing is chosen, so P2's
    // end of turn settles straight into P1's Main Phase.
    const game = await board({ first: "conc", heron: "base", vaults: true }).build();
    await game.advanceTurn();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
