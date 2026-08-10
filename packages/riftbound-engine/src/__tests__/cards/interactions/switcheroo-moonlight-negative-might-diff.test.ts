/**
 * Interaction: Switcheroo (sfd-145-221) · Spell · Chaos · 2 + [chaos][chaos] · [Hidden] [Action]
 *     "Swap the Might of two units at the same battlefield this turn."                       — P1 (attacker)
 *   × Moonlight Affliction (unl-066-219) · Spell · Mind · 7 · [Reaction]
 *     "Give a unit -10 [Might] this turn."                                                    — P2 (defender)
 *
 * Rules: 433.1 / 433.1.a / 433.1.b (Swap = determine the DIFFERENCE between the two values, then give the lower one
 * an increase and the higher one a decrease of that size, this turn), 143.2.b (a Might below 0 is TREATED as 0 when
 * referenced and when summing combat damage) but 143.2.b.1 (it is not actually 0 — effects that calculate Might
 * increases/decreases use the ACTUAL value), 143.2.a, 142.4.b (lethal damage must be non-zero — 0/negative Might
 * alone kills nobody), 465.2 (combat damage uses current Might), 466.1.a.2 (attackers recalled if defenders remain),
 * 466.3.a / 466.5.d (sole survivor wins → conquer), 340.1 ("this turn" effects expire at end of turn).
 *
 * Question: P1's turn; A (4, P1) attacks P2's bf2 defended by B (3). In the showdown P2 (7 energy) resolves Moonlight
 * on A, THEN P1 resolves Switcheroo on A and B.
 *   (a) A after Moonlight — actual vs treated-as?
 *   (b) Is the swap difference taken from A's ACTUAL −6 (→ 9) or from the 0 it is treated as (→ 3)? Resulting
 *       Mights and combat outcome under the correct reading (and what the wrong one would give).
 *   (c) Contrast: Switcheroo resolves first, then Moonlight on A.
 *   (d) A and B at end of turn.
 *
 * Expected: (a) actual 4 − 10 = −6, treated as 0. (b) actual values (143.2.b.1): |3 − (−6)| = 9 → A −6 + 9 = 3,
 * B 3 − 9 = −6 (treated 0). Combat: A deals 3 ≥ B's Might → B dies; B deals 0 → A unhurt; P1 wins and conquers bf2
 * (+1). [Wrong clamp-first reading: diff 3 → A −3 (0), B 0 → nobody deals lethal, A is recalled, no conquer.]
 * (c) swap first: diff 1 → A 3, B 4; Moonlight: A −7 (0); combat: B's 4 kills A, P2 keeps bf2. (d) all "this turn":
 * A back to 4, B back to 3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const MOONLIGHT_AFFLICTION = "unl-066-219";

/** P1's turn 2. P1: A (4) in base, Switcheroo in hand, exactly 2 + [chaos][chaos]. P2: bf2 with B (3), Moonlight in hand, exactly 7. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .resources(P2, { energy: 7 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Unit A" }, "A")
    .unit(P2, "bf2", { might: 3, name: "Unit B" }, "B")
    .hand(P1, SWITCHEROO, "switcheroo")
    .hand(P2, MOONLIGHT_AFFLICTION, "moonlight");
}

/** Actual (unclamped) Might per 143.2.b.1: printed + this-turn modifier (no buffs/gear/statics on these vanilla units). */
const actualMight = (game: Game, card: string): number => game.state(card).baseMight + game.state(card).mightModifier;

/** A attacks bf2 (combat showdown, P1 has Focus); P1 passes Focus; P2 casts Moonlight on A and it resolves. Focus returns to P1. */
async function moonlightOnA(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("A", "bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.cast("moonlight", { targets: "A" });
  expect(game.p2.energy()).toBe(0);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("moonlight")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** …then P1 casts Switcheroo on {A, B} and it resolves. The showdown is still open. */
async function moonlightThenSwitcheroo(): Promise<Game> {
  const game = await moonlightOnA();
  await game.p1.cast("switcheroo", { targets: ["A", "B"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("switcheroo")).toBe("trash");
  expect(game.chain()).toEqual([]);
  return game;
}

/** (c) A attacks; P1 (Focus) casts Switcheroo first and it resolves; then P2 (Focus) casts Moonlight on A and it resolves. */
async function switcherooThenMoonlight(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("A", "bf2");
  await game.p1.cast("switcheroo", { targets: ["A", "B"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("switcheroo")).toBe("trash");
  if (game.decision()?.seat === P1) {
    await game.p1.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("moonlight", { targets: "A" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("moonlight")).toBe("trash");
  expect(game.chain()).toEqual([]);
  return game;
}

describe("(a) Moonlight Affliction on the 4-Might attacker", () => {
  test("timing: P2 cannot cast while P1 holds Focus with an empty chain; after P1 passes Focus, Moonlight offers both A and B", async () => {
    const game = await board().build();
    await game.p1.move("A", "bf2");
    expect(game.p2.can("cast", "moonlight")).toBe(false);
    await game.p1.passFocus();
    expect(game.p2.can("cast", "moonlight")).toBe(true);
    const offered = (game.p2.option("cast", "moonlight")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(new Set(offered as string[])).toEqual(new Set(["A", "B"]));
  });

  test("A's ACTUAL Might is 4 − 10 = −6 (mightModifier −10, 143.2.b.1) while its referenced/effective Might is TREATED as 0 (143.2.b)", async () => {
    const game = await moonlightOnA();
    expect(game.state("A")).toMatchObject({ baseMight: 4, mightModifier: -10 });
    expect(actualMight(game, "A")).toBe(-6);
    expect(game.state("A").might).toBe(0);
    expect(game.state("B")).toMatchObject({ might: 3, mightModifier: 0 });
  });

  test("negative Might alone is not lethal (142.4.b): A is still an undamaged Attacker at bf2 and the showdown continues with Focus back on P1", async () => {
    const game = await moonlightOnA();
    expect(game.state("A")).toMatchObject({ combatRole: "attacker", damage: 0, location: "bf2", zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, controller: P2 });
    expect(game.p1.can("cast", "switcheroo")).toBe(true);
  });
});

describe("(b) Switcheroo after Moonlight — the difference is sized from ACTUAL values (143.2.b.1 × 433.1.b)", () => {
  test("Switcheroo offers exactly the pair at bf2 {A, B} (same battlefield) and costs 2 + [chaos][chaos]", async () => {
    const game = await moonlightOnA();
    const field = game.p1.option("cast", "switcheroo")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ max: 2, min: 2 });
    const pairs = (field?.options ?? []).map((v) => [...(v as string[])].sort().join("+"));
    expect(new Set(pairs)).toEqual(new Set(["A+B"]));
    await game.p1.cast("switcheroo", { targets: ["A", "B"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "switcheroo", controller: P1, triggered: false })]);
  });

  // Engine bug: swap-might reads the clamped (treated-as-0) value of A, so it computes |3 − 0| = 3 instead of
  // |3 − (−6)| = 9 → A ends at modifier −7 (Might 0) and B at −3 (Might 0). Rules 143.2.b.1 / 433.1.b demand 9.
  test("the swap must use A's actual −6 → difference 9: A gets +9 this turn (−10 + 9 = −1 → 3 Might), B gets −9 (→ actual −6, treated 0) (143.2.b.1, 433.1.a/b)", async () => {
    const game = await moonlightThenSwitcheroo();
    expect(game.state("A")).toMatchObject({ baseMight: 4, might: 3, mightModifier: -1 });
    expect(game.state("B")).toMatchObject({ baseMight: 3, mightModifier: -9 });
    expect(actualMight(game, "B")).toBe(-6);
    expect(game.state("B").might).toBe(0);
  });

  test("either way nobody dies on resolution — B at negative/zero Might with 0 damage stays on bf2; the showdown is still open (142.4.b)", async () => {
    const game = await moonlightThenSwitcheroo();
    expect(game.zoneOf("A")).toBe("battlefield-bf2");
    expect(game.zoneOf("B")).toBe("battlefield-bf2");
    expect(game.state("B").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  // Engine bug (consequence of the clamp-first sizing above): both units fight at 0, no damage is lethal, A is
  // recalled to base and bf2 stays P2's with no point scored — the "wrong reading" outcome. Correct: A deals 3 ≥ B's
  // (−6) Might → B dies; B deals 0; P1 is the sole survivor, wins and conquers bf2 for 1 point.
  test("combat under the correct reading — A (3) kills B (treated 0, lethal = any non-zero), takes 0 back, stays at bf2 and P1 CONQUERS bf2 (+1) (465.2, 466.3.a, 466.5.d)", async () => {
    const game = await moonlightThenSwitcheroo();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.p2.trash()).toContain("B");
    expect(game.state("A")).toMatchObject({ damage: 0, location: "bf2", zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("reading-independent part of the outcome: B (treated as 0) contributes no combat damage (143.2.b) — A is never damaged or killed in this line, and P2 scores nothing", async () => {
    const game = await moonlightThenSwitcheroo();
    await game.settle();
    expect(game.zoneOf("A")).not.toBe("trash");
    expect(game.state("A").damage).toBe(0); // healed / never damaged: B contributes 0 under BOTH readings (143.2.b)
    expect(game.p2.points()).toBe(0);
  });
});

describe("(c) contrast — Switcheroo resolves BEFORE Moonlight", () => {
  test("swap of 4 and 3: difference 1 → A 4 − 1 = 3, B 3 + 1 = 4 (433.1.a/b)", async () => {
    const game = await board().build();
    await game.p1.move("A", "bf2");
    await game.p1.cast("switcheroo", { targets: ["A", "B"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("A")).toMatchObject({ might: 3, mightModifier: -1 });
    expect(game.state("B")).toMatchObject({ might: 4, mightModifier: 1 });
  });

  test("then Moonlight on A: 3 − 10 → actual −7 (modifier −11), treated as 0; B stays 4", async () => {
    const game = await switcherooThenMoonlight();
    expect(game.state("A")).toMatchObject({ baseMight: 4, might: 0, mightModifier: -11 });
    expect(actualMight(game, "A")).toBe(-7);
    expect(game.state("B").might).toBe(4);
    expect(game.zoneOf("A")).toBe("battlefield-bf2"); // still not dead from Might alone
  });

  test("combat: A deals 0, B's 4 ≥ A's Might kills A → P1's trash; B undamaged; P2 keeps bf2, nobody scores", async () => {
    const game = await switcherooThenMoonlight();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.p1.trash()).toContain("A");
    expect(game.state("B")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) everything is 'this turn' — printed Mights are back at end of turn (340.1)", () => {
  test("Moonlight → Switcheroo line: after the turn ends A reads 4 (modifier 0) and B reads 3 (modifier 0) wherever they are", async () => {
    const game = await moonlightThenSwitcheroo();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("A")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.state("B")).toMatchObject({ might: 3, mightModifier: 0 });
  });

  test("Switcheroo → Moonlight line: B (alive at bf2) is back to 3 with modifier 0; dead A in the trash reads its printed 4", async () => {
    const game = await switcherooThenMoonlight();
    await game.settle();
    await game.advanceTurn();
    expect(game.state("B")).toMatchObject({ might: 3, mightModifier: 0, zone: "battlefield-bf2" });
    expect(game.state("A")).toMatchObject({ might: 4, mightModifier: 0, zone: "trash" });
  });
});
