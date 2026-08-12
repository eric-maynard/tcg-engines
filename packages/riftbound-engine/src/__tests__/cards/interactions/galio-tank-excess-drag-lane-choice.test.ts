/**
 * Interaction: Plaza Guardian (ven-064-166) — an 8-[Might] [Deflect] attacker
 *   × Galio, Indefatigable (unl-171-219) "[Deflect] [Tank] I don't deal combat damage."
 *   × Bird token (unl-t02) — 1 [Might] [Deflect]
 *
 * Question — P1 attacks bf1 with the Plaza Guardian alone (8 [Might]); P2 defends with Galio and a
 * Bird token. Rule 465.2.c: starting with the attacker, each player assigns damage equal to their
 * summed Might among the other's units, and 465.2.c.1 makes clear that assigning is not dealing.
 * [Tank] (815.1.b + 465.2.c.6) forces Galio to be assigned lethal before any non-Tank unit P2
 * controls, and 465.2.c.3 wants that lethal complete before moving on — so 6 to Galio, then 1 to the
 * Bird. That leaves ONE point over, and 465.2.c.4's "never more than minimum lethal" cap lifts once
 * no further units remain to be assigned, which is now true: {Galio 7, Bird 1} and {Galio 6, Bird 2}
 * are BOTH legal and the assigning player has to be asked (355.10.d.2 — a genuine choice is never
 * programmatic). The choice is not cosmetic: excess-damage counters read it.
 *
 * Defender side: Galio contributes nothing to his side's combat damage, so P2's summed Might is the
 * Bird's 1 over a single attacking unit — forced, with nothing to choose. Damage is then dealt
 * simultaneously (465.2.c.1.a) and survivors are healed in the Combat Cleanup (466.1.a.1).
 *
 * SCOPE — this file is the ENGINE half of the question. The served combat-assign lane itself
 * ([data-cd-tile] / [data-cd-confirm] tiles, ◀ ▶ reordering, live-derived numbers, the Advanced
 * number editor, drag snap-back) is an apps-level concern and belongs to the app suite; what the
 * engine owes it is the Decision — buckets in [Tank]-first order with per-unit lethal needs — plus
 * validation of the allocation map that comes back, and a Rewind that lands before the assignment.
 *
 * Rules: 465.2.a / 465.2.c / 465.2.c.1 / 465.2.c.1.a / 465.2.c.3 / 465.2.c.4 / 465.2.c.6 / 465.2.c.7
 * (assignment, Tank ordering, minimum-lethal cap and where the surplus may go), 815.1.b ([Tank]),
 * 355.10.d.2 (a real choice must be asked), 466.1.a.1 (heal in the Combat Cleanup), 466.1.a.1 /
 * 466.1.a.2 and 466.5.d (what follows).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GALIO = "unl-171-219";
const BIRD = "unl-t02";
const PLAZA_GUARDIAN = "ven-064-166";

/** P1's turn. P2 holds bf1 with Galio + a Bird; P1's lone 8-Might attacker waits in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", GALIO, "galio")
    .unit(P2, "bf1", BIRD, "bird")
    .unit(P1, "base", PLAZA_GUARDIAN, "guardian")
    .autoProcedures(false);
}

/** Attack bf1 and stop right where the 465.2.c assignment belongs. */
async function toAssignment(game: Game): Promise<void> {
  await game.p1.move("guardian", "bf1");
  await game.settle(); // Focus passes both ways; the combat is now a manual procedure
  await game.p1.choose("resolveFullCombat:bf1");
}

/** Run out any remaining combat steps. */
async function finish(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await game.settle();
    if (!game.p1.legal().some((o) => o.key === "resolveFullCombat:bf1")) {
      return;
    }
    await game.p1.choose("resolveFullCombat:bf1");
  }
}

describe("Plaza Guardian × Galio [Tank] + Bird — the 465.2.c excess-placement choice", () => {
  test("the numbers that make this a choice: an 8-Might attacker against a 6-Might [Tank] who deals no combat damage and a 1-Might Bird — lethal needs 6 and 1, one point of surplus", async () => {
    const game = await board().build();
    expect([...game.state("galio").keywords].sort()).toEqual(["Deflect", "NoCombatDamage", "Tank"]);
    expect(game.state("galio").might).toBe(6);
    expect(game.state("bird")).toMatchObject({ isToken: true, might: 1 });
    expect(game.state("guardian").might).toBe(8);
  });

  test("[Tank] before the Bird, and 'I don't deal combat damage' on the return: both defenders die, the Guardian takes only the Bird's 1, is healed at 466.1.a.1 and conquers bf1", async () => {
    // Either legal map ({7,1} or {6,2}) kills both defenders here, so the outcome does not depend on
    // where the surplus lands — only an excess-damage counter would notice.
    const game = await board().build();
    await toAssignment(game);
    await finish(game);

    expect(game.zoneOf("galio")).toBe("trash");
    expect(game.zoneOf("bird")).toBe("gone"); // 186.1 — a token that leaves the board ceases to exist
    expect(game.state("guardian")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("defender side: Galio adds nothing to P2's combat damage (465.2.a), so the whole return is the Bird's 1 onto the only attacking unit — forced, and no assignment Decision is put to P2", async () => {
    const game = await board().build();
    await toAssignment(game);
    expect(game.decision()?.seat).not.toBe(P2);
    await finish(game);
    // 1 damage on an 8-Might attacker: not lethal, and healed away in the Combat Cleanup.
    expect(game.state("guardian")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("Rewind: undoing the resolved combat lands BEFORE the assignment — the defenders are back, bf1 is P2's again and no assignment lane is left open", async () => {
    const game = await board().build();
    await toAssignment(game);
    await finish(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);

    expect(game.canUndo()).toBe(true);
    expect(game.undo()).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.key)).toContain("resolveFullCombat:bf1");
    expect(game.zoneOf("galio")).toBe("battlefield-bf1");
    expect(game.zoneOf("bird")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // Expected (465.2.c.4 + 355.10.d.2): 8 damage covers both lethal needs (6 + 1 = 7) with 1 left
  // over, and once every unit has been served the minimum-lethal cap lifts, so the surplus may sit
  // on EITHER unit — a genuine choice that must be raised as a distribute Decision for P1, with the
  // [Tank] first in the bucket order and each bucket carrying its lethal need.
  test("the 465.2.c assignment lane is raised because both {Galio 7, Bird 1} and {Galio 6, Bird 2} are legal (465.2.c.4 / 355.10.d.2)", async () => {
    const game = await board().build();
    await toAssignment(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 8 });
    const buckets = d?.kind === "distribute" ? d.buckets : [];
    expect(buckets.map((b) => b.card ?? b.key)).toEqual(["galio", "bird"]); // 465.2.c.6 — Tank first
    expect(buckets.map((b) => b.lethal)).toEqual([6, 1]);
  });

  // Expected: with the lane open the engine validates the map it gets back — {Galio 6, Bird 2} and
  // {Galio 7, Bird 1} are accepted, {Galio 5, Bird 3} under-fills the [Tank] tier (465.2.c.3 /
  // 465.2.c.6) and anything not totalling 8 is rejected outright.
  test("the excess-placement map is dispatched — {Galio 6, Bird 2} is legal, {Galio 5, Bird 3} under-fills the Tank and a map that does not total 8 is illegal", async () => {
    const game = await board().build();
    await toAssignment(game);
    expect(game.decision()?.kind).toBe("distribute");
    expect((await game.p1.try((p) => p.distribute({ bird: 3, galio: 5 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ bird: 1, galio: 6 }))).ok).toBe(false); // sums to 7
    expect((await game.p1.try((p) => p.distribute({ bird: 2, galio: 7 }))).ok).toBe(false); // sums to 9
    expect((await game.p1.try((p) => p.distribute({ bird: 2, galio: 6 }))).ok).toBe(true);
    await finish(game);
    expect(game.zoneOf("galio")).toBe("trash");
  });
});
