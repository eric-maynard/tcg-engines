/**
 * Interaction: Needlessly Large Yordle (sfd-055-221) — 5 [Might], "[Shield 5] (+5 [Might] while I'm
 *     a defender.) [Tank] (I must be assigned combat damage first.)" — TWO of them
 *   × Enthusiastic Promoter (unl-043-219) — 2 [Might], "[Backline] (I must be assigned combat
 *     damage last.)"
 *   × Tryndamere, Barbarian (ogn-034-298) — 8 [Might], "When I conquer after an attack, if you
 *     assigned 5 or more excess damage to enemy units, you score 1 point."
 *
 * Nine attackers (summed Might 40, Tryndamere among them) hit nine defenders — two Tanks, six
 * 2-3 Might units and the Backline Promoter, with equipment on both sides.
 *   (a) in what order MUST the 40 be assigned?
 *   (b) may the attacker dump the leftovers wherever it likes?
 *   (c) is lethal on a Yordle 10 or 5?
 *   (d) does Tryndamere's trigger read the ASSIGNMENT or the damage actually dealt?
 *   (e) does an 18-unit, many-attachment damage step stay invariant-clean and leave no drift?
 *
 * Rules covered (riftbound-rules ids):
 *   465.2 / .a / .b        each side's CURRENT summed Might is what gets assigned
 *   465.2.c                the attacker assigns first
 *   465.2.c.1 / .c.1.a     assigning is not dealing; all damage is dealt simultaneously
 *   465.2.c.2              lethal = non-zero damage equalling or exceeding current Might
 *   465.2.c.3              lethal in full to one unit before the next
 *   465.2.c.4              no more than minimum lethal while units remain unassigned
 *   465.2.c.6 / .c.7       obey every requirement if able; same-priority units in any order
 *   814 / 815 / 826        Shield / Tank / Backline
 *   469.1 / 470            Conquer scores a battlefield you did not yet score this turn
 *   319.6                  one cleanup after objects enter or leave the board
 */
import { describe, expect, test } from "bun:test";
import type { DistributeDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NEEDLESSLY_LARGE_YORDLE = "sfd-055-221";
const ENTHUSIASTIC_PROMOTER = "unl-043-219";
const TRYNDAMERE = "ogn-034-298";

/** Equipment worth +1 [Might] — the "several carrying attachments" of the question. */
const BLADE = { cardType: "equipment", domain: "fury", energyCost: 1, mightBonus: 1, name: "Filler Blade" };

const DEFENDERS = ["Y1", "Y2", "V1", "V2", "V3", "V4", "V5", "V6", "PROM"] as const;
const ATTACKERS = ["trynd", "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"] as const;

/**
 * Nine defenders at bfB (P2's), nine attackers in P1's base.
 * `attackerMights` — A1..A7's printed Might; A0 is printed one lower and carries a +1 blade, so the
 * attachment is part of the sum. Tryndamere is always 8.
 * `yordleMeta` — extra meta for Y1 (used once to install a damage-prevention shield).
 */
function board(attackerMights: readonly number[], yordleMeta: Record<string, unknown> = {}) {
  const s = scenario({ seed: "nine-v-nine" })
    .turn(4)
    .active(P1)
    .victoryScore(99)
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", NEEDLESSLY_LARGE_YORDLE, "Y1", yordleMeta)
    .unit(P2, "bfB", NEEDLESSLY_LARGE_YORDLE, "Y2")
    .unit(P2, "bfB", { might: 2, name: "Vanilla 1" }, "V1", { equippedWith: ["dBlade"] })
    .gear(P2, BLADE, "dBlade", { attachedTo: "V1" })
    .unit(P2, "bfB", { might: 2, name: "Vanilla 2" }, "V2")
    .unit(P2, "bfB", { might: 2, name: "Vanilla 3" }, "V3")
    .unit(P2, "bfB", { might: 2, name: "Vanilla 4" }, "V4")
    .unit(P2, "bfB", { might: 2, name: "Vanilla 5" }, "V5")
    .unit(P2, "bfB", { might: 2, name: "Vanilla 6" }, "V6")
    .unit(P2, "bfB", ENTHUSIASTIC_PROMOTER, "PROM")
    .unit(P1, "base", TRYNDAMERE, "trynd")
    .unit(P1, "base", { might: attackerMights[0] - 1, name: "Attacker 0" }, "A0", { equippedWith: ["aBlade"] })
    .gear(P1, BLADE, "aBlade", { attachedTo: "A0" });
  attackerMights.slice(1).forEach((might, i) => s.unit(P1, "base", { might, name: `Attacker ${i + 1}` }, `A${i + 1}`));
  return s;
}

/** Move all nine attackers in and close the showdown, stopping on the attacker's assignment. */
async function opened(attackerMights: readonly number[], yordleMeta: Record<string, unknown> = {}) {
  const game = await board(attackerMights, yordleMeta).build();
  await game.p1.move([...ATTACKERS], "bfB");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

const dist = (d: unknown) => d as DistributeDecision;
const lethals = (d: unknown) => Object.fromEntries(dist(d).buckets.map((b) => [b.card ?? b.key, b.lethal]));

/** Eight 4s + Tryndamere's 8 = 40; A0 is 3 printed + a blade. */
const FORTY = [4, 4, 4, 4, 4, 4, 4, 4];
/** Sixteen: eight 1s (A0 is 0 printed + a blade) + 8. */
const SIXTEEN = [1, 1, 1, 1, 1, 1, 1, 1];
/** Twenty-four: eight 2s + 8. */
const TWENTY_FOUR = [2, 2, 2, 2, 2, 2, 2, 2];
/** Thirty-seven: 4,4,4,4,4,4,4 and a 1 + 8 — two short of Tryndamere's threshold. */
const THIRTY_SEVEN = [4, 4, 4, 4, 4, 4, 4, 1];

describe("nine attackers × nine defenders — assignment order, minimum lethal and Tryndamere's excess", () => {
  test("(c) lethal on each Yordle is 10, not 5: [Shield 5] is live while it defends, and the equipped vanilla is 3 (465.2.c.2 / 814)", async () => {
    const game = await opened(FORTY);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 40 });
    expect(lethals(d)).toEqual({
      PROM: 2,
      V1: 3, // 2 printed + the blade, counted once
      V2: 2,
      V3: 2,
      V4: 2,
      V5: 2,
      V6: 2,
      Y1: 10, // 5 printed + Shield 5
      Y2: 10,
    });
    // The printed Might is untouched — the +5 is a defending-role bonus, not a rewrite.
    expect(game.state("Y1").baseMight).toBe(5);
  }, 60_000);

  test("(a) each side's summed CURRENT Might is what gets assigned, with every attachment counted exactly once (465.2 / .a / .b)", async () => {
    const game = await opened(FORTY);
    // Attackers: 8 (Tryndamere) + (3+1 blade) + seven 4s = 40.
    expect(dist(game.decision()).total).toBe(40);
    expect(game.state("A0").might).toBe(4);
    expect(game.state("aBlade").might).toBe(0); // the gear is not a unit and adds nothing of its own

    await game.p1.distribute({ PROM: 7, V1: 3, V2: 2, V3: 2, V4: 2, V5: 2, V6: 2, Y1: 10, Y2: 10 });
    // Defenders: 10 + 10 + (2+1 blade) + five 2s + 2 = 35.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 35 });
  }, 60_000);

  test("(a) both [Tank] units come before any non-Tank — in either order, since they share a priority (465.2.c.6 / .c.7 / 815)", async () => {
    // 16 to assign: only one Yordle can be made lethal, so the choice of WHICH is visible.
    const first = await opened(SIXTEEN);
    expect(dist(first.decision()).total).toBe(16);
    expect((await first.p1.try((p) => p.distribute({ Y1: 10, Y2: 6 }))).ok).toBe(true);

    const second = await opened(SIXTEEN);
    // …but no non-Tank may be touched while either Tank lacks lethal (a refused assignment leaves
    // the prompt open, so the same board carries both rejections and then the legal line).
    expect((await second.p1.try((p) => p.distribute({ V1: 3, V2: 2, V3: 1, Y1: 10 }))).ok).toBe(false);
    expect((await second.p1.try((p) => p.distribute({ PROM: 6, Y1: 10 }))).ok).toBe(false);
    expect((await second.p1.try((p) => p.distribute({ Y1: 6, Y2: 10 }))).ok).toBe(true);
  }, 60_000);

  test("(a) the [Backline] Promoter is strictly last — the leftover goes to a plain unit while any remains unassigned (826)", async () => {
    const game = await opened(TWENTY_FOUR);
    expect(dist(game.decision()).total).toBe(24);
    // The leftover 4 may not reach the Backline unit while six vanillas are unassigned…
    expect((await game.p1.try((p) => p.distribute({ PROM: 4, Y1: 10, Y2: 10 }))).ok).toBe(false);
    // …it goes to the plain units instead.
    expect((await game.p1.try((p) => p.distribute({ V1: 3, V2: 1, Y1: 10, Y2: 10 }))).ok).toBe(true);
  }, 60_000);

  test("(b) no over-assignment while units remain unassigned (465.2.c.3 / 465.2.c.4)", async () => {
    const game = await opened(SIXTEEN);
    // All 16 onto one Tank: more than its minimum lethal with eight units still unassigned.
    expect((await game.p1.try((p) => p.distribute({ Y1: 16 }))).ok).toBe(false);

    const twentyFour = await opened(TWENTY_FOUR);
    // 4 onto a 3-lethal vanilla while five vanillas and the Promoter wait.
    expect((await twentyFour.p1.try((p) => p.distribute({ V1: 4, Y1: 10, Y2: 10 }))).ok).toBe(false);
  }, 60_000);

  test("(b) once EVERY unit has its lethal, the surplus is free — it does not have to fall on the last unit assigned", async () => {
    // RULING-CONFLICT: the tighter reading is that the excess can only land on the final unit
    // assigned (which Backline pins to the Promoter). 465.2.c.4 forbids over-assignment only
    // "unless no further units remain to have damage assigned to them", and with all nine at lethal
    // none do — so the engine accepts the surplus anywhere, and its own default allocation piles it
    // on the first Tank. Engine follows the rule text.
    const game = await opened(FORTY);
    expect(dist(game.decision()).defaultAllocation).toMatchObject({ PROM: 2, Y1: 15, Y2: 10 });
    // Either way the EXCESS is the same 5: total 40 minus the 35 of summed minimum lethal.
    expect(40 - Object.values(lethals(game.decision())).reduce((a, b) => a + (b ?? 0), 0)).toBe(5);

    // Surplus onto the last-assigned (Backline) unit …
    expect((await game.p1.try((p) => p.distribute({ PROM: 7, V1: 3, V2: 2, V3: 2, V4: 2, V5: 2, V6: 2, Y1: 10, Y2: 10 }))).ok).toBe(true);
    // … and, on a fresh board, onto a Tank instead.
    const onTank = await opened(FORTY);
    expect((await onTank.p1.try((p) => p.distribute({ PROM: 2, V1: 3, V2: 2, V3: 2, V4: 2, V5: 2, V6: 2, Y1: 15, Y2: 10 }))).ok).toBe(true);
  }, 60_000);

  test("(d) the trigger reads the ASSIGNMENT: 5 excess makes Tryndamere score on top of the Conquer (465.2.c.1 / 469.1 / 470)", async () => {
    const game = await opened(FORTY);
    expect(game.p1.points()).toBe(0);

    await game.p1.distribute({ PROM: 7, V1: 3, V2: 2, V3: 2, V4: 2, V5: 2, V6: 2, Y1: 10, Y2: 10 });
    // Nothing has been dealt yet — assigning is not dealing.
    expect(game.state("PROM").damage).toBe(0);
    expect(game.zoneOf("PROM")).toBe("battlefield-bfB");

    // The defenders' 35 back, keeping Tryndamere alive so he can conquer.
    await game.p2.distribute({ A0: 4, A1: 4, A2: 4, A3: 4, A4: 4, A5: 4, A6: 4, A7: 4, trynd: 3 });
    await game.settle();

    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    // 1 for the Conquer + 1 for Tryndamere's recorded excess of 5.
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
  }, 60_000);

  test("(d) two short of the threshold and Tryndamere scores nothing — only the Conquer point lands", async () => {
    const game = await opened(THIRTY_SEVEN);
    expect(dist(game.decision()).total).toBe(37); // 35 of lethal + 2 excess
    await game.p1.distribute({ PROM: 4, V1: 3, V2: 2, V3: 2, V4: 2, V5: 2, V6: 2, Y1: 10, Y2: 10 });
    await game.p2.distribute({ A0: 4, A1: 4, A2: 4, A3: 4, A4: 4, A5: 4, A6: 4, A7: 1, trynd: 6 });
    await game.settle();

    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  }, 60_000);

  test("(e) all 18 units resolve through ONE damage step: simultaneous deaths, attachments detached in the same cleanup, no counter drift (465.2.c.1.a / 319.6)", async () => {
    const game = await opened(FORTY);
    const turnBefore = game.turnNumber();
    const phaseBefore = game.phase();

    await game.p1.distribute({ PROM: 7, V1: 3, V2: 2, V3: 2, V4: 2, V5: 2, V6: 2, Y1: 10, Y2: 10 });
    await game.p2.distribute({ A0: 4, A1: 4, A2: 4, A3: 4, A4: 4, A5: 4, A6: 4, A7: 4, trynd: 3 });
    await game.settle();

    // Every defender took lethal simultaneously — none was spared by an earlier death.
    for (const id of DEFENDERS) {
      expect(game.zoneOf(id)).toBe("trash");
    }
    // The eight 4-Might attackers died too; Tryndamere survived on 3 and was healed in the cleanup.
    for (const id of ATTACKERS.filter((a) => a !== "trynd")) {
      expect(game.zoneOf(id)).toBe("trash");
    }
    expect(game.zoneOf("trynd")).toBe("battlefield-bfB");
    expect(game.state("trynd").damage).toBe(0);

    // Both attachments detached in the same cleanup as the units they rode.
    expect(game.state("dBlade").attachedTo).toBeUndefined();
    expect(game.state("aBlade").attachedTo).toBeUndefined();

    // The board's size changed nothing about the clock, and the oracles stayed silent throughout.
    expect(game.turnNumber()).toBe(turnBefore);
    expect(game.phase()).toBe(phaseBefore);
    expect(game.violations()).toEqual([]);
  }, 60_000);

  test("(e) the assignment reads the ONE damage model: a prevention shield on a Yordle raises its assignment lethal to 12 (465.2.c.4.a)", async () => {
    const game = await opened(FORTY, { damagePreventionShield: 2 });
    expect(lethals(game.decision())).toMatchObject({ Y1: 12, Y2: 10 });
    // …and 10 is now under-assignment: it no longer kills, so the surplus math shifts with it.
    expect((await game.p1.try((p) => p.distribute({ PROM: 5, V1: 3, V2: 2, V3: 2, V4: 2, V5: 2, V6: 2, Y1: 12, Y2: 10 }))).ok).toBe(true);
  }, 60_000);
});
