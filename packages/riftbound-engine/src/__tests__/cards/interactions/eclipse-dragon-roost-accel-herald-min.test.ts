/**
 * Interaction: Eclipse Dragon (ven-016-166) · Unit · Fury · 8 · 8 Might · DRAGON · [Accelerate] ([1][fury])
 *     "When I move, if you control 4 or fewer runes, draw 1."
 *   × Dragon Roost (ven-157-166) · Battlefield — P2's, one 3-Might defender on it:
 *     "Any player may pay [rainbow][rainbow] as an additional cost to play a Dragon. If they do, they play it to this
 *      battlefield."
 *   × Herald of Scales (ogn-140-298) · Unit · Body · 4 · 3 Might — P1's, in base:
 *     "Your Dragons' Energy costs are reduced by [2], to a minimum of [1]."
 *
 * Rules: 355.1.a (each optional additional cost is a separate step-2 election), 355.2.b (an effect — the Roost —
 * makes an otherwise invalid location Valid; its "if they do" FIXES the destination), 356.2.b.1 (optional additional
 * costs are added on top of the base cost), 356.4.e (Herald −[2] with its own floor of 1 — irrelevant at 8), 356.6,
 * 357.3 (a cost that cannot be paid deterministically makes the play illegal → that variant is ABSENT), 805.1.a.1 (the
 * Accelerate pip must be FURY — the Dragon's domain; the Roost pips are any-domain), 805.2, 805.6 (paid Accelerate ⇒
 * enters ready), 190.3.a.1 (played to a battlefield you don't control ⇒ you apply Contested; combat follows).
 *
 * Question: P1's turn, Neutral Open. P1: Herald in base, bf1 (held), Eclipse Dragon in hand. Two independent optional
 * additional costs + one floored discount on one play.
 *   (a) Enumerate the variants none / Accelerate / Roost / both with exact (energy, power) and destinations.
 *   (b) Pool {7 energy, fury:1, calm:1}: which variants are offered?   (c) Pool {6, fury:1, calm:1}?
 *   (d) In the 'both' variant, where does the Dragon enter, in what state, and what follows?
 *   (e) May the calm pip pay the Accelerate pip if fury was spent on the Roost cost?
 *
 * Expected: base 8 − Herald 2 = 6. (a) none: 6 energy → base | bf1. Accelerate: 7 + [fury] → base | bf1, enters READY.
 * Roost: 6 + 2 any → Dragon Roost only, exhausted. Both: 7 + [fury] + 2 any (3 power, ≥1 fury) → Roost, READY.
 * (b) {7,f1,c1}: none, Accelerate, Roost offered; 'both' needs 3 power → ABSENT. (c) {6,f1,c1}: none + Roost only.
 * (d) both: enters ready at P2's Roost under P1's control; P1 applies Contested; combat begins with P1 attacking 8 vs
 * 3 → defender dies, P1 conquers the Roost (+1). (e) No — 805.1.a.1: only fury pays Accelerate; the payer-optimal
 * assignment is fury→Accelerate, calm(+other)→Roost; with no fury Accelerate is never legal however much calm exists.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ECLIPSE_DRAGON = "ven-016-166";
const DRAGON_ROOST = "ven-157-166";
const HERALD_OF_SCALES = "ogn-140-298";

type Pool = { energy: number; power: Record<string, number> };

/**
 * P1's turn 2, Neutral Open. Roost: P2's (live text) with a 3-Might Keeper. bf1: P1's, held by a 1-Might Holder.
 * P1: Herald of Scales in base (unless `herald:false`), Eclipse Dragon in hand, the given pool.
 */
function board(pool: Pool, herald = true) {
  const s = scenario()
    .resources(P1, pool)
    .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "roost", { might: 3, name: "Roost Keeper" }, "keeper")
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .hand(P1, ECLIPSE_DRAGON, "dragon");
  if (herald) {
    s.unit(P1, "base", HERALD_OF_SCALES, "herald");
  }
  return s;
}

interface Variant {
  readonly to: string;
  readonly accelerate: boolean;
}

/** The Dragon's enumerated play variants as {to, accelerate} (battlefield ids bare), sorted for comparison. */
function variants(game: Game): Variant[] {
  return (game.p1.option("play", "dragon")?.variants ?? [])
    .map((v) => {
      const p = v.params as { location?: string; paidAdditionalCost?: boolean };
      const loc = p.location ?? "?";
      return { accelerate: p.paidAdditionalCost === true, to: loc.startsWith("battlefield-") ? loc.slice("battlefield-".length) : loc };
    })
    .sort((a, b) => `${a.to}${a.accelerate}`.localeCompare(`${b.to}${b.accelerate}`));
}

const v = (to: string, accelerate: boolean): Variant => ({ accelerate, to });
/** none ×{base,bf1} + Accelerate ×{base,bf1} + Roost + both — the full menu, sorted like `variants()`. */
const FULL_MENU: Variant[] = [v("base", false), v("base", true), v("bf1", false), v("bf1", true), v("roost", false), v("roost", true)];

const RICH: Pool = { energy: 10, power: { calm: 3, fury: 3 } };
const roost = (game: Game) => game.gameState.battlefields.roost;
const showdowns = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

describe("Eclipse Dragon × Dragon Roost × Herald of Scales — two independent optional costs + a floored discount on one play", () => {
  // ── premise: Herald's floored discount ────────────────────────────────────────────────────────

  test("premise: Herald takes the Dragon from 8 to 6 (floor of 1 irrelevant) — playable at exactly 6; without Herald 7 is not enough and 8 is (356.4.e)", async () => {
    expect((await board({ energy: 6, power: {} }).build()).p1.can("play", "dragon")).toBe(true);
    expect((await board({ energy: 5, power: {} }).build()).p1.can("play", "dragon")).toBe(false);
    expect((await board({ energy: 7, power: {} }, false).build()).p1.can("play", "dragon")).toBe(false);
    expect((await board({ energy: 8, power: {} }, false).build()).p1.can("play", "dragon")).toBe(true);
  });

  // ── (a) the four variants: menu, exact payments, destinations, entry state ────────────────────

  test("(a) with a rich pool the menu is exactly: none → base|bf1, Accelerate → base|bf1, Roost → roost, both → roost (six variants; the Roost election never targets base/bf1 and nothing else reaches the Roost)", async () => {
    const game = await board(RICH).build();
    expect(variants(game)).toEqual(FULL_MENU);
    const to = game.p1.option("play", "dragon")?.fields.find((f) => f.arg === "to")?.options as string[];
    expect([...to].sort()).toEqual(["base", "battlefield-bf1", "battlefield-roost"]);
  });

  test("(a) none: exactly 6 energy, 0 power, to base OR bf1; enters EXHAUSTED", async () => {
    const toBase = await board(RICH).build();
    await toBase.p1.play("dragon", { to: "base" });
    expect(toBase.p1.resources()).toEqual({ energy: 4, power: { calm: 3, fury: 3 } });
    expect(toBase.state("dragon")).toMatchObject({ isExhausted: true, zone: "base" });

    const toBf1 = await board(RICH).build();
    await toBf1.p1.play("dragon", { to: "bf1" });
    expect(toBf1.p1.resources()).toEqual({ energy: 4, power: { calm: 3, fury: 3 } });
    expect(toBf1.state("dragon")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(roost(toBf1)).toMatchObject({ contested: false, controller: P2 });
  });

  test("(a) Accelerate: 9−2 = 7 energy + exactly one FURY (calm untouched), to base or bf1; enters READY (805.1.a.1, 805.6)", async () => {
    const toBase = await board(RICH).build();
    await toBase.p1.play("dragon", { accelerate: true, to: "base" });
    expect(toBase.p1.resources()).toEqual({ energy: 3, power: { calm: 3, fury: 2 } });
    expect(toBase.state("dragon")).toMatchObject({ isReady: true, zone: "base" });

    const toBf1 = await board(RICH).build();
    await toBf1.p1.play("dragon", { accelerate: true, to: "bf1" });
    expect(toBf1.p1.resources()).toEqual({ energy: 3, power: { calm: 3, fury: 2 } });
    expect(toBf1.state("dragon")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
  });

  test("(a) Roost: 6 energy + 2 power of ANY domains; the Dragon MUST land on Dragon Roost, exhausted, and P1 applies Contested to P2's battlefield (355.2.b, 190.3.a.1)", async () => {
    const game = await board(RICH).build();
    await game.p1.play("dragon", { to: "roost" });
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.power()).toBe(6 - 2);
    expect(game.state("dragon")).toMatchObject({ controller: P1, isExhausted: true, zone: "battlefield-roost" });
    expect(roost(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });

    const calmOnly = await board({ energy: 6, power: { calm: 2 } }).build(); // no fury at all: still fine for the Roost
    await calmOnly.p1.play("dragon", { to: "roost" });
    expect(calmOnly.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(calmOnly.zoneOf("dragon")).toBe("battlefield-roost");
  });

  test("(a) both: 7 energy + [fury] + 2 any = 3 power with ≥1 fury → Dragon Roost, READY (pool {7, fury:3} → 0/0)", async () => {
    const game = await board({ energy: 7, power: { fury: 3 } }).build();
    expect(variants(game)).toContainEqual(v("roost", true));
    await game.p1.play("dragon", { accelerate: true, to: "roost" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("dragon")).toMatchObject({ controller: P1, isReady: true, zone: "battlefield-roost" });
  });

  // ── (b) pool {7, fury:1, calm:1} ──────────────────────────────────────────────────────────────

  test("(b) pool {7, fury:1, calm:1}: none, Accelerate (7+fury) and Roost (6 + fury&calm as the two any-pips) are all offered and each really plays for that price", async () => {
    const pool: Pool = { energy: 7, power: { calm: 1, fury: 1 } };
    const game = await board(pool).build();
    expect(variants(game)).toEqual(expect.arrayContaining([v("base", false), v("bf1", false), v("base", true), v("bf1", true), v("roost", false)]));

    const accel = await board(pool).build();
    await accel.p1.play("dragon", { accelerate: true, to: "base" });
    expect(accel.p1.resources()).toEqual({ energy: 0, power: { calm: 1, fury: 0 } });
    expect(accel.state("dragon").isReady).toBe(true);

    const viaRoost = await board(pool).build();
    await viaRoost.p1.play("dragon", { to: "roost" });
    expect(viaRoost.p1.resources()).toEqual({ energy: 1, power: { calm: 0, fury: 0 } });
    expect(viaRoost.state("dragon")).toMatchObject({ isExhausted: true, zone: "battlefield-roost" });
  });

  // Expected (357.3): 'both' needs 7 energy + 3 power (one of them fury); with 2 power in the pool the election is
  // deterministically unpayable → the variant must be ABSENT and a request for it refused with nothing spent.
  // Actual: playUnit checks the Accelerate cost and the Roost pips SEPARATELY against the pool, so {roost, paid} is
  // enumerated; executing it pays 6 + both pips for the Roost, then silently drops the unpayable Accelerate — the
  // Dragon lands exhausted for a "both" request.
  test.failing("BUG: (b) pool {7, fury:1, calm:1}: the 'both' variant (Accelerate + Roost = 7 + 3 power) is ABSENT and asking for it is refused with the pool intact (357.3)", async () => {
    const pool: Pool = { energy: 7, power: { calm: 1, fury: 1 } };
    const game = await board(pool).build();
    expect(variants(game)).not.toContainEqual(v("roost", true));
    const r = await game.p1.try((p) => p.play("dragon", { accelerate: true, to: "roost" }));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 7, power: { calm: 1, fury: 1 } });
    expect(game.zoneOf("dragon")).toBe("hand");
  });

  // ── (c) pool {6, fury:1, calm:1} ──────────────────────────────────────────────────────────────

  test("(c) pool {6, fury:1, calm:1}: only none (base|bf1) and Roost are offered — no Accelerate variant anywhere (7 energy needed), a request for it is refused, and the Roost line plays for 6 + both pips", async () => {
    const pool: Pool = { energy: 6, power: { calm: 1, fury: 1 } };
    const game = await board(pool).build();
    expect(variants(game)).toEqual([v("base", false), v("bf1", false), v("roost", false)]);
    expect(game.p1.option("play", "dragon")?.fields.some((f) => f.name === "paidAdditionalCost")).toBe(false);
    const r = await game.p1.try((p) => p.play("dragon", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 6, power: { calm: 1, fury: 1 } });
    await game.p1.play("dragon", { to: "roost" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.zoneOf("dragon")).toBe("battlefield-roost");
  });

  // ── (d) the 'both' line to the end ────────────────────────────────────────────────────────────

  test("(d) both (pool {7, fury:3}): the Dragon enters READY at P2's Roost under P1's control, P1 applies Contested, and — this being P1's Neutral Open turn — a COMBAT showdown opens there at once with P1 attacking and holding Focus (190.3.a.1, 464.2.c)", async () => {
    const game = await board({ energy: 7, power: { fury: 3 } }).build();
    await game.p1.play("dragon", { accelerate: true, to: "roost" });
    expect(game.state("dragon")).toMatchObject({ combatRole: "attacker", controller: P1, isReady: true, zone: "battlefield-roost" });
    expect(game.state("keeper").combatRole).toBe("defender");
    expect(roost(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(showdowns(game)).toEqual([expect.objectContaining({ attackingPlayer: P1, battlefieldId: "roost", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true })]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]); // no "When I move" — it was PLAYED there, not moved
  });

  test("(d) combat 8 vs 3: the Keeper dies, the Dragon survives (healed), P1 CONQUERS Dragon Roost and scores 1; back to P1's open main phase", async () => {
    const game = await board({ energy: 7, power: { fury: 3 } }).build();
    await game.p1.play("dragon", { accelerate: true, to: "roost" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.state("dragon")).toMatchObject({ damage: 0, zone: "battlefield-roost" });
    expect(roost(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.conqueredThisTurn[P1]).toEqual(["roost"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // The harness's `costPaid` oracle compares against the PRINTED 8 and cannot see Herald's board discount.
    expect(game.violations().filter((x) => x.invariant !== "costPaid")).toEqual([]);
  });

  // ── (e) fury vs calm across the two costs ─────────────────────────────────────────────────────

  test("(e) calm can NEVER stand in for the Accelerate pip: with {7, calm:3} (no fury) neither Accelerate nor 'both' is offered or accepted, although the Roost pips alone are happily paid in calm (805.1.a.1)", async () => {
    const game = await board({ energy: 7, power: { calm: 3 } }).build();
    expect(variants(game)).toEqual([v("base", false), v("bf1", false), v("roost", false)]);
    expect((await game.p1.try((p) => p.play("dragon", { accelerate: true, to: "base" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.play("dragon", { accelerate: true, to: "roost" }))).ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 7, power: { calm: 3 } });
    await game.p1.play("dragon", { to: "roost" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.state("dragon").isExhausted).toBe(true);
  });

  // Expected (805.1.a.1 + 357.3 read payer-optimally): with exactly one fury and two calm the ONLY legal assignment
  // for 'both' is fury→Accelerate, calm+calm→Roost — 7 energy + all 3 power, enters READY. Actual: the reducer pays
  // the Roost's any-domain pips first (largest pool first, then insertion order — here it consumes the lone fury),
  // finds no fury left for Accelerate and silently drops it: 6 energy + fury + 1 calm, Dragon EXHAUSTED, 1 calm and
  // 1 energy left over.
  test.failing("BUG: (e) pool {7, fury:1, calm:2}: 'both' is legal only as fury→Accelerate, calm×2→Roost — the engine must find that assignment: pool → 0/0/0 and the Dragon enters READY at the Roost", async () => {
    const game = await board({ energy: 7, power: { fury: 1, calm: 2 } }).build();
    expect(variants(game)).toContainEqual(v("roost", true));
    await game.p1.play("dragon", { accelerate: true, to: "roost" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.state("dragon")).toMatchObject({ isReady: true, zone: "battlefield-roost" });
  });
});
