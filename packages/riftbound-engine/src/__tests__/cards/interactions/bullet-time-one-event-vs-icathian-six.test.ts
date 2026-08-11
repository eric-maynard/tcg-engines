/**
 * Interaction: one instance of MULTIPLE damage vs. MULTIPLE instances of damage, against one shield
 *
 *   Bullet Time (ogn-268-298) — [Action] · Body/Chaos · 1 energy
 *       "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *   Icathian Rain (ogn-248-298) — Fury/Mind · 7 + 3 pips
 *       "Deal 2 to a unit." × 6
 *   Counter Strike (sfd-194-221) — [Reaction] · Calm/Body · 2 + [rainbow]
 *       "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *
 * Rules: 417.1.b / .c / .d (one Deal action may mark damage on several objects at the same time — that is
 * ONE damage event per object, not one per point; several written instructions are several events),
 * 417.1.e (any positive integer is valid damage — over-assigning past Might is legal), 437.1.b.2 (a
 * one-shot prevention replaces the NEXT damage event that would be dealt to the named object), 437.3.a
 * (the shield is spent when it applies), 437.4 (fully prevented ⇒ the object was not dealt damage at all),
 * 321 / 321.1 / 142.4.a / 143.2.a / 323.5 (lethal damage kills only in a Cleanup, and no Cleanup happens
 * while a chain item is resolving), 319.5 / 428.5.c (the Cleanup after the item leaves the chain).
 * Also riftjudge 64604d52 — "multiple instances of damage" vs "one instance of multiple damage".
 *
 * Question — P1's turn; P2 has U (5 Might vanilla) and W (3 Might vanilla) together at bf1 and holds
 * Counter Strike.
 *  (a) P1 casts Bullet Time for 6 [rainbow]; P2 Counter Strikes U. Does the one-shot swallow the WHOLE 6?
 *  (b) Same board, P1 casts Icathian Rain with three "Deal 2" on U and three on W; P2 again Counter
 *      Strikes U. How much does the same one-shot swallow, and what is U's final mark?
 *  (c) Does W die the moment its damage becomes lethal, or only later — and if P1 orders all three of W's
 *      instances first, is the third still legal on an already-lethally-damaged W?
 *
 * Expected: (a) Bullet Time is ONE Deal action; U's event is the whole 6, so all 6 are prevented, U is
 * dealt 0 and counts as not damaged; W takes 6 and dies in the single post-item Cleanup. (b) Icathian Rain
 * is six separate events; the shield eats only the FIRST 2 aimed at U, so U ends 4/5 alive and W ends 6/3.
 * (c) Neither leg kills mid-resolution: with W's three instances first, W is at 4 damage after instance 2
 * and instance 3 still resolves onto it (417.1.e), so W is dealt 6 in three events and dies exactly once.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const ICATHIAN_RAIN = "ogn-248-298";
const COUNTER_STRIKE = "sfd-194-221";

/** Damage events recorded against `unit`, oldest first. */
const damageTo = (game: Game, unit: string) => (game.gameState.damageLog ?? []).filter((r) => r.target === unit);
/** Total damage actually MARKED on `unit` by the recorded events. */
const dealtTo = (game: Game, unit: string) => damageTo(game, unit).reduce((a, r) => a + r.amount, 0);

/**
 * P1's turn. P2 holds bf1 with U (5) and W (3) — both vanilla — and holds Counter Strike with 2 + [rainbow].
 * P1 has both spells and 7 energy + 6 [rainbow] (enough for Bullet Time at X=6 OR Icathian Rain).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { rainbow: 6 } })
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Bulwark" }, "U")
    .unit(P2, "bf1", { might: 3, name: "Whelp" }, "W")
    .hand(P1, BULLET_TIME, "bt")
    .hand(P1, ICATHIAN_RAIN, "rain")
    .hand(P2, COUNTER_STRIKE, "cs");
}

/** P1 casts `spell`, P2 answers with Counter Strike on U, then everything resolves. */
async function withShieldOnU(game: Game, cast: () => Promise<unknown>): Promise<void> {
  await cast();
  await game.p1.passPriority();
  await game.p2.cast("cs", { targets: "U" });
  expect(game.chain().map((c) => c.cardId)).toEqual([expect.any(String), "cs"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
}

describe("Bullet Time's single 6 vs Icathian Rain's six 2s, into one Counter Strike", () => {
  // ── (a) one Deal action, one event per unit ────────────────────────────────────────────────

  test("(a) Bullet Time performs ONE Deal action: exactly one damage event per enemy unit at the battlefield, each carrying the full 6 (417.1.b/.c/.d)", async () => {
    const game = await board().build();
    await game.p1.cast("bt", { targets: "bf1", x: 6 });
    await game.settle();
    expect(damageTo(game, "U")).toHaveLength(1);
    expect(damageTo(game, "W")).toHaveLength(1);
    expect(damageTo(game, "U")[0]).toMatchObject({ amount: 6, combat: false, original: 6 });
    expect(damageTo(game, "W")[0]).toMatchObject({ amount: 6, original: 6 });
    expect(game.zoneOf("U")).toBe("trash"); // 6 ≥ 5
    expect(game.zoneOf("W")).toBe("trash");
  });

  test("(a) Counter Strike on U swallows the WHOLE 6 — one event, one one-shot prevention (437.1.b.2): U is dealt 0, is not considered damaged (437.4) and survives unmarked", async () => {
    const game = await board().build();
    await withShieldOnU(game, () => game.p1.cast("bt", { targets: "bf1", x: 6 }));
    // 437.4 — a wholly prevented event was never dealt at all: the log records nothing for U
    expect(damageTo(game, "U")).toEqual([]);
    expect(game.zoneOf("U")).toBe("battlefield-bf1"); // unshielded (test above) the same 6 killed it
    expect(game.state("U")).toMatchObject({ damage: 0, might: 5 });
    expect(game.state("U").meta.dealtDamageThisTurn).not.toBe(true);
  });

  test("(a) the shield is SPENT by that one event (437.3.a) and protects nobody else: W still takes the full 6 and dies; P2 drew its Counter Strike card", async () => {
    const game = await board().build();
    const p2Deck = game.p2.deck().length;
    await withShieldOnU(game, () => game.p1.cast("bt", { targets: "bf1", x: 6 }));
    expect(damageTo(game, "W")).toHaveLength(1);
    expect(damageTo(game, "W")[0]).toMatchObject({ amount: 6, original: 6 });
    expect(game.zoneOf("W")).toBe("trash");
    expect(game.state("U").meta.preventNextDamageInstance).not.toBe(true); // one-shot consumed
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.p2.hand()).toHaveLength(1); // spent Counter Strike, drew 1
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (b) six written instructions, six events ───────────────────────────────────────────────

  test("(b) Icathian Rain is SIX damage events (417.1.c), not one instance of 6: three aimed at U and three at W produce three records each, of 2", async () => {
    const game = await board().build();
    await game.p1.cast("rain", { targets: ["U", "U", "U", "W", "W", "W"] });
    await game.settle();
    expect(damageTo(game, "U").map((r) => r.original)).toEqual([2, 2, 2]);
    expect(damageTo(game, "W").map((r) => r.original)).toEqual([2, 2, 2]);
  });

  test("(b) the same one-shot now swallows only the FIRST 2 aimed at U: instances 2 and 3 land, U ends 4/5 ALIVE; W ends dealt 6 and dies", async () => {
    const game = await board().build();
    await withShieldOnU(game, () => game.p1.cast("rain", { targets: ["U", "U", "U", "W", "W", "W"] }));
    // the prevented instance leaves no record (437.4); instances 2 and 3 are dealt in full
    expect(damageTo(game, "U").map((r) => r.amount)).toEqual([2, 2]);
    expect(damageTo(game, "U").map((r) => r.original)).toEqual([2, 2]);
    expect(game.zoneOf("U")).toBe("battlefield-bf1");
    expect(game.state("U")).toMatchObject({ damage: 4, might: 5 });
    expect(damageTo(game, "W").map((r) => r.amount)).toEqual([2, 2, 2]);
    expect(game.zoneOf("W")).toBe("trash");
  });

  test("(b) the seam, stated as one number: the SAME single shield absorbs 6 from Bullet Time and only 2 from Icathian Rain", async () => {
    const big = await board().build();
    await withShieldOnU(big, () => big.p1.cast("bt", { targets: "bf1", x: 6 }));
    const small = await board().build();
    await withShieldOnU(small, () => small.p1.cast("rain", { targets: ["U", "U", "U", "W", "W", "W"] }));
    // 6 points of incoming damage in BOTH legs, one shield in both — but 6 are swallowed vs only 2
    expect(dealtTo(big, "U")).toBe(0);
    expect(big.state("U").damage).toBe(0);
    expect(dealtTo(small, "U")).toBe(4);
    expect(small.state("U").damage).toBe(4);
  });

  // ── (c) death waits for the Cleanup after the item leaves the chain ────────────────────────

  test("(c) with all three of W's instances FIRST, the third still resolves onto a W already at 4 damage vs 3 Might — over-assignment is legal damage (417.1.e) and W is dealt 6 in three events", async () => {
    const game = await board().build();
    await withShieldOnU(game, () => game.p1.cast("rain", { targets: ["W", "W", "W", "U", "U", "U"] }));
    const w = damageTo(game, "W");
    expect(w).toHaveLength(3); // the 3rd instance was NOT skipped for a "dead" unit
    expect(w.map((r) => r.amount)).toEqual([2, 2, 2]);
    expect(w.reduce((a, r) => a + r.amount, 0)).toBe(6);
  });

  test("(c) …and W dies exactly ONCE, in the single Cleanup after the item leaves the chain (321 / 321.1 / 323.5): it appears once in the trash and nothing else died", async () => {
    for (const order of [
      ["U", "U", "U", "W", "W", "W"],
      ["W", "W", "W", "U", "U", "U"],
    ]) {
      const game = await board().build();
      await withShieldOnU(game, () => game.p1.cast("rain", { targets: order }));
      expect(game.p2.trash().filter((c) => c === "W")).toEqual(["W"]);
      expect(game.zoneOf("U")).toBe("battlefield-bf1");
      expect(game.state("U").damage).toBe(4); // U's total is order-independent
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
      expect(game.violations()).toEqual([]);
    }
  });

  test("(c) the same for Bullet Time: no death happens mid-resolution — the chain empties in ONE settle and W is in the trash exactly once, U untouched", async () => {
    const game = await board().build();
    await withShieldOnU(game, () => game.p1.cast("bt", { targets: "bf1", x: 6 }));
    expect(game.chain()).toEqual([]);
    expect(game.p2.trash().filter((c) => c === "W")).toEqual(["W"]);
    expect(game.p2.units("bf1")).toEqual(["U"]);
    expect(game.state("U").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
