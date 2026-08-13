/**
 * Interaction: Wallop (ogn-146-298) · Spell · Body · 2 · Action
 *     "As you play this, you may spend a buff as an additional cost. If you do, ignore this spell's
 *      cost. Ready a unit."
 *   × Temporal Portal (sfd-078-221) · Gear · Mind · 3
 *     "[rainbow], [Exhaust]: Give the next spell you play this turn [Repeat] equal to its cost."
 *   × Ezreal, Prodigy (sfd-149-221) · Champion Unit · Chaos · 3
 *     "… Optional additional costs you pay cost [1] or [rainbow] less."
 *
 * Question: P1's turn. P1 controls a ready Temporal Portal, (optionally) Ezreal, Prodigy, a BUFFED
 * exhausted unit U1 and an exhausted unit U2; Wallop in hand. P1 activates the Portal, then casts
 * Wallop. Matrix {spend the buff? × pay the Repeat?}: what does each variant cost, how many buffs are
 * spent, how many units readied; which variants are offered from a pool of exactly {1 energy}?
 *
 * Rules: 206 / 356.1.c ("its cost" = printed cost → Repeat [2]); 356.1.b / 356.1.b.3 ("ignore this
 * spell's cost" zeroes the BASE cost only — additional costs added afterwards stay due); 356.2.b.1
 * (buff-spend and Repeat are non-mandatory additional costs); 356.4.c / 356.4.f (Ezreal discounts each
 * optional additional cost by [1] or [rainbow] as it is added — Repeat [2] → [1]; the buff-spend is
 * non-standard, 356.7, nothing to reduce); 135.2.b.3 (the "as you play this" buff-spend executes during
 * play, so Repeat never re-runs it → exactly ONE buff); 820.1.d / 820.2.a / 820.3 (two "Ready a unit"
 * executions, targets chosen at play time, may be the same unit; played once); 357.3.
 *
 * Expected — with Ezreal: neither → 2, ready 1; buff only → 0, U1's buff removed, ready 1; Repeat only →
 * 2 + (2−1) = 3, ready 2; both → 0 + 1 = 1, one buff, ready 2. Without Ezreal: 2 / 0 / 4 / 2.
 * Parity at {1 energy}: with Ezreal offered = {buff-only, buff+Repeat}; without Ezreal only buff-only.
 * The Portal's grant is consumed by Wallop whether or not the Repeat was paid.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const WALLOP = "ogn-146-298";
const TEMPORAL_PORTAL = "sfd-078-221";
const EZREAL_PRODIGY = "sfd-149-221";

interface Opts {
  ezreal?: boolean;
  energy?: number;
}

/**
 * P1's turn-2 main phase. Portal (ready) + 1 [rainbow] to activate it; U1 buffed & exhausted, U2
 * exhausted; Wallop + a second Wallop (to observe the consumed grant) in hand; `energy` (default 6).
 */
function board(o: Opts = {}) {
  const b = scenario()
    .resources(P1, { energy: o.energy ?? 6, power: { rainbow: 1 } })
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .unit(P1, "base", { might: 2, name: "Buffed U1" }, "u1", { buffed: true, exhausted: true })
    .unit(P1, "base", { might: 2, name: "Sleepy U2" }, "u2", { exhausted: true })
    .hand(P1, WALLOP, "wallop")
    .hand(P1, WALLOP, "wallop2");
  if (o.ezreal) {
    b.unit(P1, "base", EZREAL_PRODIGY, "ezreal");
  }
  return b;
}

/** Board with the Portal already activated and resolved (P1 back in an open main phase). */
async function portalOn(o: Opts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.activate("portal");
  await game.settle();
  expect(game.state("portal").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: o.energy ?? 6, power: { rainbow: 0 } });
  expect(game.chain()).toEqual([]);
  return game;
}

function field(game: Game, card: string, name: string) {
  return game.p1.option("cast", card)?.fields.find((f) => f.name === name);
}

/** The set of {buff, repeat} elections the cast menu offers for `card` right now. */
function electionsOffered(game: Game, card = "wallop"): string[] {
  const opt = game.p1.option("cast", card);
  const out = new Set<string>();
  for (const v of opt?.variants ?? []) {
    const p = v.params as { paidAdditionalCost?: boolean; repeatCount?: number };
    out.add(`${p.paidAdditionalCost === true ? "buff" : "plain"}${(p.repeatCount ?? 0) > 0 ? "+repeat" : ""}`);
  }
  return [...out].sort();
}

/** Target tuples offered for the buff+Repeat election. */
function targetsOfferedFor(game: Game, paid: boolean, repeat: number): string[][] {
  const opt = game.p1.option("cast", "wallop");
  return (opt?.variants ?? [])
    .filter((v) => ((v.params as { paidAdditionalCost?: boolean }).paidAdditionalCost === true) === paid && ((v.params as { repeatCount?: number }).repeatCount ?? 0) === repeat)
    .map((v) => [...((v.params as { targets?: string[] }).targets ?? [])]);
}

describe("Wallop × Temporal Portal × Ezreal, Prodigy — Repeat 'equal to its cost' vs 'ignore this spell's cost'", () => {
  // ---- setup ------------------------------------------------------------------------------------------

  test("setup: activating the Portal spends the [rainbow] and exhausts it; Wallop is then offered with exactly one Repeat instance and both buff routes (206, 820.3)", async () => {
    const game = await portalOn({ ezreal: true });
    expect(field(game, "wallop", "repeatCount")?.options).toEqual([1]);
    expect([...((field(game, "wallop", "paidAdditionalCost")?.options ?? []) as boolean[])].sort()).toEqual([false, true]);
    expect(game.state("u1")).toMatchObject({ isBuffed: true, isExhausted: true });
    expect(game.state("u2")).toMatchObject({ isBuffed: false, isExhausted: true });
  });

  test("without the Portal Wallop has no Repeat at all (the keyword is only granted)", async () => {
    const game = await board({ ezreal: true }).build();
    expect(field(game, "wallop", "repeatCount")?.options ?? []).toEqual([]);
  });

  // ---- (a)/(c) with Ezreal ------------------------------------------------------------------------------

  test("(with Ezreal) neither: Wallop costs its printed 2 — Ezreal never touches the base cost — and readies one unit", async () => {
    const game = await portalOn({ ezreal: true });
    await game.p1.cast("wallop", { payOptional: false, targets: "u1" });
    expect(game.p1.energy()).toBe(4);
    expect(game.state("u1").isBuffed).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wallop", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("wallop")).toBe("trash");
    expect(game.state("u1").isReady).toBe(true);
    expect(game.state("u2").isReady).toBe(false);
  });

  test("(with Ezreal) buff only: 0 energy, U1's buff is removed at payment, one unit readied (356.1.b, 357.2)", async () => {
    const game = await portalOn({ ezreal: true });
    await game.p1.cast("wallop", { payOptional: true, targets: "u2" });
    expect(game.p1.energy()).toBe(6);
    expect(game.state("u1").isBuffed).toBe(false); // paid while Wallop is still on the chain
    expect(game.zoneOf("wallop")).toBe("chain");
    await game.settle();
    expect(game.state("u2").isReady).toBe(true);
    expect(game.state("u1").isReady).toBe(false);
  });

  test("(with Ezreal) Repeat only: the granted Repeat is the PRINTED [2] (206/356.1.c), Ezreal shaves it to [1] (356.4.c) → 2 + 1 = 3 energy; two executions ready U1 and U2", async () => {
    const game = await portalOn({ ezreal: true });
    await game.p1.cast("wallop", { payOptional: false, repeat: 1, targets: ["u1", "u2"] });
    expect(game.p1.energy()).toBe(3);
    expect(game.state("u1").isBuffed).toBe(true);
    expect(game.chain()).toHaveLength(1); // played once (820.3.a)
    expect(game.chain()[0]?.targets).toEqual(["u1", "u2"]);
    await game.settle();
    expect(game.state("u1").isReady).toBe(true);
    expect(game.state("u2").isReady).toBe(true);
    expect(game.zoneOf("wallop")).toBe("trash");
  });

  test("(with Ezreal) Repeat only: both executions may name the SAME unit (820.2.a) — offered and legal, the second ready is a no-op", async () => {
    const game = await portalOn({ ezreal: true });
    expect(targetsOfferedFor(game, false, 1)).toContainEqual(["u2", "u2"]);
    await game.p1.cast("wallop", { payOptional: false, repeat: 1, targets: ["u2", "u2"] });
    expect(game.p1.energy()).toBe(3);
    await game.settle();
    expect(game.state("u2").isReady).toBe(true);
    expect(game.state("u1").isReady).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // Expected (356.1.b / 356.1.b.3 / 356.2.b.1): "ignore this spell's cost" zeroes only the base 2; the
  // Repeat [2] is an additional cost added afterwards and stays due (Ezreal: → [1]) ⇒ 6 → 5.
  // Actual: the engine wipes the Repeat cost together with the base cost — 0 energy is charged.
  test("(with Ezreal) buff + Repeat should cost 0 + (2−1) = 1 energy — 'ignore this spell's cost' does not waive the Repeat additional cost (356.1.b.3, 356.2.b.1, 356.4.c)", async () => {
    const game = await portalOn({ ezreal: true });
    await game.p1.cast("wallop", { payOptional: true, repeat: 1, targets: ["u1"] });
    expect(game.state("u1").isBuffed).toBe(false);
    expect(game.p1.energy()).toBe(5);
  });

  // Expected (820.2 / 820.2.a): with the Repeat paid there are two "Ready a unit" executions whose targets
  // are chosen at play time — [U1, U2] must be an offered target tuple for the buff+Repeat election too.
  // Actual: the buff+Repeat variants only carry a single target; ["u1","u2"] is rejected.
  test("(with Ezreal) buff + Repeat should offer two play-time targets and ready BOTH units — one buff spent, one spell played (820.2.a, 135.2.b.3, 820.3.a)", async () => {
    const game = await portalOn({ ezreal: true });
    expect(targetsOfferedFor(game, true, 1)).toContainEqual(["u1", "u2"]);
    await game.p1.cast("wallop", { payOptional: true, repeat: 1, targets: ["u1", "u2"] });
    expect(game.state("u1").isBuffed).toBe(false); // exactly one buff — the only one there is
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("u1").isReady).toBe(true);
    expect(game.state("u2").isReady).toBe(true);
  });

  test("(with Ezreal) buff + Repeat as the engine accepts it (single target): exactly ONE buff is spent — the 'as you play this' cost is not re-run by Repeat (135.2.b.3) — one chain item, Wallop to trash (820.3.a)", async () => {
    const game = await portalOn({ ezreal: true });
    await game.p1.cast("wallop", { payOptional: true, repeat: 1, targets: ["u1"] });
    expect(game.state("u1").isBuffed).toBe(false);
    expect(game.state("ezreal").isBuffed).toBe(false); // no second buff was demanded from anywhere
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "wallop", controller: P1 });
    await game.settle();
    expect(game.zoneOf("wallop")).toBe("trash");
    expect(game.state("u1").isReady).toBe(true);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  // ---- (e) without Ezreal ---------------------------------------------------------------------------------

  test("(no Ezreal) neither → 2 energy; buff only → 0 energy and U1's buff removed", async () => {
    const plain = await portalOn();
    await plain.p1.cast("wallop", { payOptional: false, targets: "u1" });
    expect(plain.p1.energy()).toBe(4);
    expect(plain.state("u1").isBuffed).toBe(true);

    const buff = await portalOn();
    await buff.p1.cast("wallop", { payOptional: true, targets: "u1" });
    expect(buff.p1.energy()).toBe(6);
    expect(buff.state("u1").isBuffed).toBe(false);
  });

  test("(no Ezreal) Repeat only: 2 + Repeat [2] = 4 energy, both units readied", async () => {
    const game = await portalOn();
    await game.p1.cast("wallop", { payOptional: false, repeat: 1, targets: ["u1", "u2"] });
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.state("u1").isReady).toBe(true);
    expect(game.state("u2").isReady).toBe(true);
  });

  // Expected: 0 (ignored base) + Repeat [2] = 2 energy ⇒ 6 → 4. Actual: 0 charged (Repeat wiped with the base).
  test("(no Ezreal) buff + Repeat should cost 0 + 2 = 2 energy (356.1.b.3 — riftjudge 'Academy + Call to Glory: you still pay to repeat')", async () => {
    const game = await portalOn();
    await game.p1.cast("wallop", { payOptional: true, repeat: 1, targets: ["u1"] });
    expect(game.state("u1").isBuffed).toBe(false);
    expect(game.p1.energy()).toBe(4);
  });

  // ---- the Portal grant is consumed either way ------------------------------------------------------------

  test("the Portal's 'next spell' grant is consumed by Wallop whether or not the Repeat was paid: a second Wallop the same turn has no Repeat", async () => {
    const unpaid = await portalOn({ ezreal: true });
    await unpaid.p1.cast("wallop", { payOptional: false, targets: "u1" });
    await unpaid.settle();
    expect(unpaid.p1.can("cast", "wallop2")).toBe(true);
    expect(field(unpaid, "wallop2", "repeatCount")?.options ?? []).toEqual([]);

    const paid = await portalOn({ ezreal: true });
    await paid.p1.cast("wallop", { payOptional: false, repeat: 1, targets: ["u1", "u2"] });
    await paid.settle();
    expect(field(paid, "wallop2", "repeatCount")?.options ?? []).toEqual([]);
  });

  // ---- parity: pool {1 energy} ---------------------------------------------------------------------------

  test("parity {1 energy} with Ezreal: plain (2) and Repeat-only (3) are absent and rejected; buff-only is offered (357.3 / pool-only affordability)", async () => {
    const game = await portalOn({ ezreal: true, energy: 1 });
    expect(electionsOffered(game)).toContain("buff");
    expect(electionsOffered(game)).not.toContain("plain");
    expect(electionsOffered(game)).not.toContain("plain+repeat");
    await expect(game.p1.cast("wallop", { payOptional: false, targets: "u1" })).rejects.toThrow();
    await expect(game.p1.cast("wallop", { payOptional: false, repeat: 1, targets: ["u1", "u2"] })).rejects.toThrow();
    expect(game.zoneOf("wallop")).toBe("hand");
    expect(game.p1.energy()).toBe(1);
  });

  // buff+Repeat with Ezreal costs 0 + (2−1) = 1 ⇒ affordable from {1 energy}, offered, and casting it
  // empties the pool: the election is priced with the base cost already ignored (356.1.b).
  test("parity {1 energy} with Ezreal: buff+Repeat (price 1) is offered and leaves 0 energy (356.1.b, 356.4.c, 357.3)", async () => {
    const game = await portalOn({ ezreal: true, energy: 1 });
    expect(electionsOffered(game)).toEqual(["buff", "buff+repeat"]);
    await game.p1.cast("wallop", { payOptional: true, repeat: 1, targets: ["u1"] });
    expect(game.p1.energy()).toBe(0);
  });

  test("parity {1 energy} without Ezreal: ONLY buff-only (0) is offered — buff+Repeat costs 2, plain 2, Repeat-only 4", async () => {
    const game = await portalOn({ energy: 1 });
    expect(electionsOffered(game)).toEqual(["buff"]);
    await expect(game.p1.cast("wallop", { payOptional: true, repeat: 1, targets: ["u1"] })).rejects.toThrow();
  });

  test("parity {1 energy} without Ezreal: the buff-only cast is legal, costs nothing but the buff, and readies its target", async () => {
    const game = await portalOn({ energy: 1 });
    await game.p1.cast("wallop", { payOptional: true, targets: "u2" });
    expect(game.p1.energy()).toBe(1);
    expect(game.state("u1").isBuffed).toBe(false);
    await game.settle();
    expect(game.state("u2").isReady).toBe(true);
    expect(game.zoneOf("wallop")).toBe("trash");
  });
});
