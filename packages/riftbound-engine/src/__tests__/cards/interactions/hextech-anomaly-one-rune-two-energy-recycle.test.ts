/**
 * Interaction: Hextech Anomaly (sfd-083-221) · Gear · Mind · 3+[mind]
 *                "[Exhaust]: [Reaction] — Pay any amount of [rainbow] to [Add] that much Energy."
 *            × Fury Rune (ogn-007-298) · Basic Rune — "[E]: [Reaction] — Add [1]." / "Recycle this: [Reaction] — Add [fury]." (164.2)
 *            × Discipline (ogn-058-298) · Spell · Calm · 2 (no power) · "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *
 * P2's turn; P2 casts a spell, giving P1 priority. P1 controls a READY Hextech Anomaly, exactly ONE ready Fury Rune on the
 * board (11 more in the rune deck), pool (0,{}), and holds Discipline.
 *   (a) Can P1 reach 2 Energy from that single rune: tap → recycle the same (now exhausted) rune → exhaust Anomaly paying
 *       the [fury] as "[rainbow]"? Exact pool/board trace; where does the rune go, rune deck count/position?
 *   (b) Does any of the three activations create a chain item or hand P2 priority before Discipline is finalized? Is
 *       Fury-domain power acceptable for "pay [rainbow]"?
 *   (c) P1 then plays Discipline from the 2 Energy: pool after; effect on resolution.
 *   (d) Ordering variant: could P1 START Discipline at (0,{}) and do the three Adds inside its Pay Costs step
 *       (357.1.a / 429.3)? Does the harness list Discipline as playable at (0,{}) with 2 Energy reachable?
 *   (e) NO sides: rune exhausted and NOT recycled (pool (1,{})) — can Anomaly produce anything (pay 0 → add 0)? Can Anomaly
 *       convert Energy → Power? Is the recycled rune's Energy retroactively lost when the rune leaves the board / at 317.2.d?
 *
 * Rules: 164.2.a / 164.2.b / 164.2.b.1 (basic rune abilities; recycled power = rune's domain), 416.1.b / 161.2.b (runes
 * recycle to the RUNE deck bottom), 135.2.e.5.a ([rainbow] as a cost = power of ANY domain), 429.2 / 429.2.a (Add
 * abilities resolve on finalization: no chain item, priority/focus don't move), 429.3 / 429.3.a / 357.1.a (Add Reactions
 * inside Pay Costs), 444.1 (pay = remove from pool), 166.1 (added energy lives in the pool, not on its source), 317.2.d.
 */
import { describe, expect, test } from "bun:test";
import type { Game, SeatHandle } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_ANOMALY = "sfd-083-221";
const FURY_RUNE = "ogn-007-298";
const DISCIPLINE = "ogn-058-298";
const CLEAVE = "ogn-004-298"; // P2's 1-cost [Action] spell, only there to open a chain on P2's turn

/** Activate Anomaly choosing X (the engine enumerates one variant per affordable xAmount; `x` fills the field). */
async function anomaly(seat: SeatHandle, x: number): Promise<void> {
  await seat.choose("activateAbility:anom#0", { params: { xAmount: x }, x });
}

/** The X values Anomaly currently offers `seat`. */
function anomalyXs(seat: SeatHandle): number[] {
  return (seat.option("activate", "anom")?.variants ?? []).map((v) => v.params.xAmount as number).sort();
}

/**
 * P2's turn 2. P1: ready Anomaly, ONE ready Fury Rune ("rune"), 11 runes in the rune deck, pool (0,{}), Discipline in
 * hand and a 2-Might ally to aim it at. P2: 1 energy, a 2-Might unit and Cleave.
 */
function board() {
  return scenario()
    .active(P2)
    .fillDecks({ main: 10, runes: 11 })
    .resources(P2, { energy: 1 })
    .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
    .hand(P2, CLEAVE, "cleave")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .gear(P1, HEXTECH_ANOMALY, "anom")
    .rune(P1, FURY_RUNE, { alias: "rune" })
    .hand(P1, DISCIPLINE, "disc");
}

/** P2 casts Cleave on its own unit and passes → P1 holds priority in the Closed state on P2's turn, pool (0,{}). */
async function p1HasPriority(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.runes()).toEqual(["rune"]);
  expect(game.p1.runeDeck()).toHaveLength(11);
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  await game.p2.cast("cleave", { targets: "theirs" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.turnPlayer()).toBe(P2);
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  return game;
}

/** …tap the rune, recycle the same rune, Anomaly X=1 → (2,{}). */
async function twoEnergy(): Promise<Game> {
  const game = await p1HasPriority();
  await game.p1.tapRune("rune");
  await game.p1.recycleRune("rune");
  await anomaly(game.p1, 1);
  expect(game.p1.energy()).toBe(2);
  expect(game.p1.power()).toBe(0);
  return game;
}

describe("Hextech Anomaly × one Fury Rune × Discipline — 2 Energy out of a single rune on the opponent's turn", () => {
  // ---------------------------------------------------------------- (a) the trace

  test("(a) at (0,{}) with priority P1 is offered: tap rune, recycle rune, Anomaly (X=0 only — no power yet); NOT Discipline", async () => {
    const game = await p1HasPriority();
    const keys = game.p1.legal().map((o) => o.key);
    expect(keys).toContain("exhaustRune:rune");
    expect(keys).toContain("recycleRune:rune");
    expect(keys).toContain("activateAbility:anom#0");
    expect(anomalyXs(game.p1)).toEqual([0]);
    expect(keys).not.toContain("playSpell:disc");
  });

  test("(a) step 1 — [E] tap: pool (1,{}), rune exhausted and still on the board", async () => {
    const game = await p1HasPriority();
    await game.p1.tapRune("rune");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.state("rune")).toMatchObject({ isExhausted: true, zone: "runePool" });
    expect(game.p1.can("tapRune", "rune")).toBe(false); // can't tap it twice
    expect(game.p1.can("recycleRune", "rune")).toBe(true); // exhaustion is irrelevant to the recycle cost
  });

  test("(a) step 2 — recycle the SAME exhausted rune: it goes to the BOTTOM of P1's RUNE deck (12 cards, last), 0 runes on board, pool (1,{fury:1}) — power takes the rune's domain (164.2.b.1, 416.1.b)", async () => {
    const game = await p1HasPriority();
    await game.p1.tapRune("rune");
    await game.p1.recycleRune("rune");
    expect(game.zoneOf("rune")).toBe("runeDeck");
    expect(game.p1.runeDeck()).toHaveLength(12);
    expect(game.p1.runeDeck().at(-1)).toBe("rune");
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.deck()).not.toContain("rune"); // not the main deck (161.2.b)
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    // the Energy already added is NOT lost when its source rune leaves the board (166.1)
    expect(game.p1.energy()).toBe(1);
  });

  test("(a) step 3 — Anomaly now offers X ∈ {0,1}; X=1 pays the [fury] as [rainbow] (135.2.e.5.a) → pool (2,{}), Anomaly exhausted", async () => {
    const game = await p1HasPriority();
    await game.p1.tapRune("rune");
    await game.p1.recycleRune("rune");
    expect(anomalyXs(game.p1)).toEqual([0, 1]);
    await anomaly(game.p1, 1);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.state("anom").isExhausted).toBe(true);
    expect(game.p1.can("activate", "anom")).toBe(false);
  });

  // ---------------------------------------------------------------- (b) no chain items, no window for P2

  test("(b) none of the three activations is a chain item and none hands P2 priority: after each the chain is still just [Cleave] and P1 still holds priority (429.2 / 429.2.a); P2's view is unchanged and P2 has no menu", async () => {
    const game = await p1HasPriority();
    const chainBefore = game.p2.view().chain;
    const check = () => {
      expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
      expect(game.p2.view().chain).toEqual(chainBefore);
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
      expect(game.p2.legal()).toEqual([]);
    };
    await game.p1.tapRune("rune");
    check();
    await game.p1.recycleRune("rune");
    check();
    await anomaly(game.p1, 1);
    check();
    // only once Discipline is FINALIZED does a new item appear — and P1 (its controller) holds priority first
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "disc"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2, source: { cardId: "disc" } }); // P2's normal 359.3.c window
  });

  // ---------------------------------------------------------------- (c) Discipline from the 2 Energy

  test("(c) Discipline becomes listed exactly when the pool reaches 2; casting it pays the pool to (0,{}); on resolution ally +2 (2 → 4) and P1 draws 1; Cleave then resolves too", async () => {
    const game = await twoEnergy();
    expect(game.p1.can("cast", "disc")).toBe(true);
    const deck0 = game.p1.deck().length;
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.chain().at(-1)).toMatchObject({ cardId: "disc", controller: P1, targets: ["ally"], type: "spell" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ might: 4, mightModifier: 2 });
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("theirs").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (d) ordering variant / known deviation

  // DESIGN (DESIGN.md §Paying costs / §Resource management; FIXER-PRIMER §7 "NOT DONE"): by the rules (357.1.a / 429.3 /
  // 429.3.a) P1 could begin playing Discipline at (0,{}) and perform tap → recycle → Anomaly inside its Pay Costs step. The
  // engine deliberately does NOT implement the play-time Add sub-step: a play is only OFFERED when the CURRENT pool covers
  // it; ready runes / Anomaly are never credited. So Discipline is absent at (0,{}), (1,{}) and (1,{fury:1}) and appears only
  // at (2,{}). Recorded here as the known deviation, not as rules-correct behaviour.
  test("(d) DESIGN deviation — Discipline is NOT listed until the pool itself holds 2: absent at (0,{}), (1,{}), (1,{fury:1}); a forced cast at (0,{}) is rejected with nothing paid; listed at (2,{})", async () => {
    const game = await p1HasPriority();
    expect(game.p1.can("cast", "disc")).toBe(false);
    const r = await game.p1.try((p) => p.cast("disc", { targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("disc")).toBe("hand");
    expect(game.state("rune")).toMatchObject({ isExhausted: false, zone: "runePool" });
    expect(game.state("anom").isExhausted).toBe(false);
    expect(game.decision()?.kind).toBe("action"); // no mid-payment Add prompt is surfaced either
    await game.p1.tapRune("rune");
    expect(game.p1.can("cast", "disc")).toBe(false); // (1,{})
    await game.p1.recycleRune("rune");
    expect(game.p1.can("cast", "disc")).toBe(false); // (1,{fury:1}) — power does not pay an energy cost
    await anomaly(game.p1, 1);
    expect(game.p1.can("cast", "disc")).toBe(true); // (2,{})
  });

  // ---------------------------------------------------------------- (e) NO sides

  test("(e) rune tapped but NOT recycled — pool (1,{}): Anomaly offers only X=0; pay 0 → add 0 is a legal but empty activation (Anomaly exhausted for nothing, pool still (1,{})); X=1 is rejected; Discipline stays uncastable", async () => {
    const game = await p1HasPriority();
    await game.p1.tapRune("rune");
    expect(anomalyXs(game.p1)).toEqual([0]);
    const forced = await game.p1.try((p) => anomaly(p, 1));
    expect(forced.ok).toBe(false);
    expect(game.state("anom").isExhausted).toBe(false);
    await anomaly(game.p1, 0);
    expect(game.state("anom").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.p1.can("cast", "disc")).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  });

  test("(e) Anomaly never turns Energy into Power (that is Ancient Henge): with pool (2,{}) and no power it offers only X=0 and activating it leaves (2,{}) — no power appears", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).gear(P1, HEXTECH_ANOMALY, "anom").build();
    expect(anomalyXs(game.p1)).toEqual([0]);
    await anomaly(game.p1, 0);
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.p1.power()).toBe(0);
  });

  test("(e) the Energy is not tied to its source: after tap + recycle the rune is in the rune deck yet the 1 Energy (and the 1 fury) stay in the pool through the chain's resolution — they are only lost in the Expiration Step (317.2.d)", async () => {
    const game = await p1HasPriority();
    await game.p1.tapRune("rune");
    await game.p1.recycleRune("rune");
    expect(game.zoneOf("rune")).toBe("runeDeck");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.settle(); // Cleave resolves; P2's open main phase
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.advanceTurn(); // P2 ends the turn → 3e empties every pool → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.trace().expiration.at(-1)?.poolsEmptied?.[P1]).toMatchObject({ energy: 1 });
    // P1's new turn: the pool holds only what P1 channels/taps now — the carried 1+fury are gone
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.energy()).toBe(0);
  });
});
