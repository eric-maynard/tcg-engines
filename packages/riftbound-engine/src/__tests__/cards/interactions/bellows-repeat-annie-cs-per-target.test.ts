/**
 * Interaction: Bellows Breath (sfd-080-221) · Spell · Mind · 1+[mind] · [Action] · [Repeat] [1][mind]
 *     "Deal 1 to up to three units at the same location."
 *   × Annie, Fiery (ogs-001-024) · Champion Unit · Fury · 5 · 4 Might
 *     "Your spells and abilities deal 1 Bonus Damage. (Each instance of damage the spell deals is increased by 1.)"
 *   × Counter Strike (sfd-194-221) · Spell · Calm/Body · 2+[C] · [Reaction]
 *     "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *
 * Rules: 715 / 715.2 (Bonus Damage: with several targets EACH target's damage is increased separately — it is not
 * spread once over the instruction), 715.4.a + 437.1.a.1 (a Prevent counts the bonus in what it prevents), 437.1.b.2
 * (always the NEXT damage to that unit), 437.4 (fully prevented damage was never dealt), 820.1.d.1 / 820.2.a / 820.3.a
 * ([Repeat]: the additional cost is paid once as the spell is played; the spell is ONE chain item played once; the
 * repeated execution is a new execution that makes its own choices — a fresh Deal instance, so the bonus applies
 * again), 321 (no Cleanup — hence no death check — while a chain item is resolving; B and C die together in the one
 * Cleanup after Bellows leaves the chain), 323.5 (lethal damage kills at Cleanup), 340.1 (LIFO: Counter Strike first).
 *
 * Q: P1 controls Annie, Fiery in base. P2 has A (4), B (4), C (2) together at bf1. On P1's turn P1 casts Bellows
 *    Breath paying Repeat: execution 1 → {A, B, C}, execution 2 → {A, B}. P2 responds with Counter Strike on A.
 *    Is Annie's +1 per target or once per instance; again on the repeat; what exactly does Counter Strike swallow?
 *
 * Expected: Counter Strike resolves first (P2 draws 1) leaving a one-shot prevent on A. Execution 1 = ONE Deal
 * instance with three targets, +1 EACH → A, B, C would each take 2; A's 2 (bonus included) is wholly prevented (A is
 * dealt 0, shield spent), B 2, C 2. Execution 2 = a new instance, bonus again → A 2 (shield gone), B 2. Final: A 2/4
 * alive; B 4/4 and C 2/2 die together in the single Cleanup after Bellows leaves the chain. Without Annie: exec 1
 * A 0 / B 1 / C 1, exec 2 A 1 / B 1 → A 1, B 2, C 1, nobody dies. Bellows is played once for [1][mind]+[1][mind] total.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const ANNIE_FIERY = "ogs-001-024";
const COUNTER_STRIKE = "sfd-194-221";

/**
 * P1's turn, Neutral Open. P1: exactly 2 energy + [mind][mind] (base 1+[mind] plus Repeat [1][mind]), Bellows in
 * hand, Annie in base iff `annie`. P2: A (4), B (4), C (2) at bf1 (P2's), Counter Strike in hand with exactly 2
 * energy + [calm].
 */
function board(opts: { annie: boolean } = { annie: true }) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Unit A" }, "a")
    .unit(P2, "bf1", { might: 4, name: "Unit B" }, "b")
    .unit(P2, "bf1", { might: 2, name: "Unit C" }, "c")
    .hand(P1, BELLOWS_BREATH, "bb")
    .hand(P2, COUNTER_STRIKE, "cs");
  return opts.annie ? s.unit(P1, "base", ANNIE_FIERY, "annie") : s;
}

/** Damage marked on a unit, or "DEAD" once it is in the trash. */
const dmg = (game: Game, id: string): number | "DEAD" => (game.zoneOf(id) === "trash" ? "DEAD" : game.state(id).damage);

/** P1 passes; P2 answers with Counter Strike on A; both pass so Counter Strike (LIFO) resolves. Bellows still pending. */
async function counterStrikeOnA(game: Game): Promise<void> {
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "cs")).toBe(true);
  await game.p2.cast("cs", { targets: "a" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bb", "cs"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["bb"]);
  expect(game.zoneOf("cs")).toBe("trash");
}

/**
 * The play the question asks about: Repeat paid, execution 1 → {A, B, C}, execution 2 → {A, B}. Expressed as the
 * flat per-execution target list in execution order (the shape the engine uses for per-execution GROUPS, cf.
 * sfd-151-221) through the raw move, because the enumerated cast variants do not (yet) contain it.
 */
async function castFullScenario(game: Game): Promise<void> {
  await game.p1.do("playSpell", { cardId: "bb", repeatCount: 1, targets: ["a", "b", "c", "a", "b"] });
  expect(game.chain()).toHaveLength(1);
}

describe("Bellows Breath [Repeat] × Annie, Fiery × Counter Strike — bonus per target, per execution; prevent per unit", () => {
  // ── the play itself ────────────────────────────────────────────────────────────────────────────

  test("Bellows Breath with Repeat is ONE chain item played once for a total of 2 energy + [mind][mind] (820.1.d.1, 820.3.a); Counter Strike may then name A (any unit) and resolves first (LIFO), P2 drawing 1", async () => {
    const game = await board().build();
    expect(game.p2.can("cast", "cs")).toBe(false); // no window yet in Neutral Open
    await game.p1.cast("bb", { repeat: 1, targets: ["a"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bb", controller: P1, triggered: false })]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await game.p1.passPriority();
    const csTargets = (game.p2.option("cast", "cs")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(csTargets).toEqual(expect.arrayContaining(["a", "b", "c", "annie"]));
    const hand = game.p2.hand().length;
    await game.p2.cast("cs", { targets: "a" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["bb", P1],
      ["cs", P2],
    ]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand - 1 + 1); // spent Counter Strike, drew 1
    expect(game.state("a").meta.preventNextDamageInstance).toBe(true); // the one-shot shield sits on A only
    expect(game.state("b").meta.preventNextDamageInstance).toBeFalsy();
    expect(game.state("c").meta.preventNextDamageInstance).toBeFalsy();
    expect(game.chain().map((c) => c.cardId)).toEqual(["bb"]); // Bellows still to resolve
  });

  // ── 715.2: per target, not spread ──────────────────────────────────────────────────────────────

  test("single execution {A, B, C} with Annie: the +1 lands on EACH target (715.2) — A 2, B 2, C (2 Might) dies; not '3 damage +1 spread'", async () => {
    const game = await board().build();
    expect(game.state("annie").keywords).toContain("BonusDamage");
    await game.p1.cast("bb", { targets: ["a", "b", "c"] });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } }); // Repeat not bought
    await game.settle();
    expect(dmg(game, "a")).toBe(2);
    expect(dmg(game, "b")).toBe(2);
    expect(dmg(game, "c")).toBe("DEAD");
    expect(game.zoneOf("bb")).toBe("trash");
  });

  test("single execution {A, B, C} with Annie, Counter Strike on A: A's whole 2 (bonus included) is prevented → A 0 and the shield is spent (715.4.a, 437.4); B 2 and C 2 (dies) are untouched by A's shield", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { targets: ["a", "b", "c"] });
    await counterStrikeOnA(game);
    await game.settle();
    expect(dmg(game, "a")).toBe(0);
    expect(game.state("a").meta.preventNextDamageInstance).toBeFalsy();
    expect(dmg(game, "b")).toBe(2);
    expect(dmg(game, "c")).toBe("DEAD");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast without Annie — single execution {A, B, C}, Counter Strike on A: A 0, B 1, C 1 (alive)", async () => {
    const game = await board({ annie: false }).build();
    await game.p1.cast("bb", { targets: ["a", "b", "c"] });
    await counterStrikeOnA(game);
    await game.settle();
    expect(dmg(game, "a")).toBe(0);
    expect(dmg(game, "b")).toBe(1);
    expect(dmg(game, "c")).toBe(1);
  });

  // ── 820.2.a: the repeat execution is a new instance ────────────────────────────────────────────

  test("Repeat A → A with Annie, Counter Strike on A: execution 1's 2 is prevented, execution 2 is a NEW instance with the bonus again → A ends at exactly 2/4, alive (437.1.b.2, 820.2.a)", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a"] });
    await counterStrikeOnA(game);
    await game.settle();
    expect(dmg(game, "a")).toBe(2);
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.state("a").meta.preventNextDamageInstance).toBeFalsy();
    expect(dmg(game, "b")).toBe(0);
    expect(dmg(game, "c")).toBe(0);
  });

  test("Repeat A → A with Annie and NO Counter Strike: 2 + 2 = 4 ≥ 4 kills A — so above it was the shield that ate exactly one execution", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a"] });
    await game.settle();
    expect(dmg(game, "a")).toBe("DEAD");
  });

  test("contrast without Annie — Repeat A → A, Counter Strike on A: 0 then 1 → A 1/4", async () => {
    const game = await board({ annie: false }).build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a"] });
    await counterStrikeOnA(game);
    await game.settle();
    expect(dmg(game, "a")).toBe(1);
  });

  // ── the full question: exec 1 → {A, B, C}, exec 2 → {A, B} ────────────────────────────────────

  // Expected (820.2.a + "up to three units at the same location"): each execution chooses its OWN group of up to
  // three units sharing a location; the two groups may overlap and may sit at the SAME location, so
  // {A,B,C} then {A,B} at bf1 is an enumerated Repeat finalization (flat per-execution list, execution order).
  test("the Repeat finalization 'exec 1 → {A,B,C}, exec 2 → {A,B}' (same location, overlapping groups) is offered as a cast variant (820.2.a)", async () => {
    const game = await board().build();
    const variants = game.p1.option("cast", "bb")?.variants ?? [];
    const wanted = variants.filter(
      (v) => v.params.repeatCount === 1 && JSON.stringify(v.params.targets) === JSON.stringify(["a", "b", "c", "a", "b"]),
    );
    expect(wanted.length).toBeGreaterThan(0);
    await game.p1.cast("bb", { repeat: 1, targets: ["a", "b", "c", "a", "b"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1);
  });

  // Expected: CS first (P2 +1 card); exec 1: A 0 (2 prevented, shield spent) / B 2 / C 2; exec 2: A 2 / B 2 → A 2/4
  // alive, B (4) and C (2) both dead in the one Cleanup after Bellows leaves the chain; chain empty, P1's open main
  // phase. The flat list is read back in execution order into the two same-location groups (820.2.a).
  test("full scenario with Annie + Counter Strike on A → A exactly 2 damage and ALIVE, B and C both in the trash after a single Cleanup (715.2, 715.4.a, 820.2.a, 321)", async () => {
    const game = await board().build();
    await castFullScenario(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const hand = game.p2.hand().length;
    await counterStrikeOnA(game);
    expect(game.p2.hand()).toHaveLength(hand); // −1 Counter Strike, +1 draw
    // Nothing has been dealt yet: Bellows is still on the chain, all three alive and undamaged.
    expect([dmg(game, "a"), dmg(game, "b"), dmg(game, "c")]).toEqual([0, 0, 0]);
    await game.settle();
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(dmg(game, "a")).toBe(2);
    expect(game.state("a").meta.preventNextDamageInstance).toBeFalsy();
    expect(dmg(game, "b")).toBe("DEAD");
    expect(dmg(game, "c")).toBe("DEAD");
    expect(game.p2.units("bf1")).toEqual(["a"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected: exec 1: A 0 (prevented) / B 1 / C 1; exec 2: A 1 / B 1 → A 1/4, B 2/4, C 1/2 — nobody dies.
  test("full scenario WITHOUT Annie, Counter Strike on A → A 1, B 2, C 1, all three alive (437.4, 820.2.a)", async () => {
    const game = await board({ annie: false }).build();
    await castFullScenario(game);
    await counterStrikeOnA(game);
    await game.settle();
    expect(dmg(game, "a")).toBe(1);
    expect(dmg(game, "b")).toBe(2);
    expect(dmg(game, "c")).toBe(1);
    expect(game.p2.units("bf1").sort()).toEqual(["a", "b", "c"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
