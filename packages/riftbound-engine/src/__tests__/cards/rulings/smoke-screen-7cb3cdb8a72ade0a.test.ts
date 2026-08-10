/**
 * Ruling 7cb3cdb8a72ade0a — Smoke Screen (OGN-093 → ogn-093-298) · Reaction [2][mind] "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction [2] "Give a unit +2 [Might] this turn. Draw 1."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298, Battlefield) "Units here have +1 [Might]."
 *
 * Q: How do "to a minimum of 1" effects like Smoke Screen interact with other stat modifiers (pumps)?
 * A: They snapshot: when Smoke Screen resolves it computes the decrease it can actually apply right then and remembers THAT value for
 *    the turn. Order matters — on a 2-Might unit: Smoke first = −1 (→1), then Discipline → 3; Discipline first (→4), then Smoke = −3
 *    (→1). Modifiers added later (e.g. entering Trifarian War Camp) just add on; the snapshotted value is never re-evaluated.
 * Rules: 336 (LIFO), one-shot Might modifications are evaluated at application and stored (CR clarification per the ruling).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const DISCIPLINE = "ogn-058-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298";

/**
 * P1's turn. P1's 2-Might Grunt in base; "camp" = Trifarian War Camp (live text), empty and uncontrolled. P1 holds Discipline AND a
 * Smoke Screen of its own ([4]+mind); P2 holds a Smoke Screen too ([2]+mind) for the "in response" ordering.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("camp", { controller: null, def: TRIFARIAN_WAR_CAMP, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Far Away" }, "far")
    .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, SMOKE_SCREEN, "smokeP1")
    .hand(P2, SMOKE_SCREEN, "smokeP2");
}

/** P1 Disciplines the Grunt, P2 Smoke Screens it in response → Smoke resolves FIRST, then Discipline. */
async function smokeFirst(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("disc", { targets: "grunt" });
  await game.p1.passPriority();
  await game.p2.cast("smokeP2", { targets: "grunt" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "smokeP2"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Smoke Screen resolves on a 2-Might unit
  expect(game.zoneOf("smokeP2")).toBe("trash");
  return game;
}

/** P1 Disciplines the Grunt uncontested (→4), THEN Smoke Screens it itself. */
async function disciplineFirst(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("disc", { targets: "grunt" });
  await game.settle();
  expect(game.state("grunt")).toMatchObject({ might: 4, mightModifier: 2 });
  await game.p1.cast("smokeP1", { targets: "grunt" });
  await game.settle();
  expect(game.zoneOf("smokeP1")).toBe("trash");
  return game;
}

describe("Ruling 7cb3cdb8a72ade0a — 'to a minimum of 1' snapshots the decrease it could apply when it resolved", () => {
  test("Smoke Screen first on a 2-Might unit: '-4, min 1' evaluates to −1 (2 → 1) and that −1 is what is remembered", async () => {
    const game = await smokeFirst();
    expect(game.state("grunt")).toMatchObject({ might: 1, mightModifier: -1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
  });

  test("…then Discipline resolves: 2 base + 2 − 1 = 3 (the −1 does not grow back into −4)", async () => {
    const game = await smokeFirst();
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("grunt")).toMatchObject({ might: 3, mightModifier: 1 });
  });

  test("Discipline first (2 → 4), then Smoke Screen: '-4, min 1' evaluates to −3 → the unit is 1 (2 + 2 − 3)", async () => {
    const game = await disciplineFirst();
    expect(game.state("grunt")).toMatchObject({ might: 1, mightModifier: -1 }); // net of +2 and −3
  });

  test("a LATER modifier just adds on without re-evaluating the snapshot: that 1-Might Grunt walks into Trifarian War Camp (+1 here) and reads 2 — not re-floored/re-expanded to 1", async () => {
    const game = await disciplineFirst();
    await game.p1.move("grunt", "camp");
    expect(game.locationOf("grunt")).toBe("camp");
    expect(game.state("grunt").might).toBe(2); // 2 + 2 − 3 + 1
    await game.settle();
    expect(game.state("grunt").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("and in the Smoke-first line the 3-Might Grunt reads 4 at the War Camp (2 + 2 − 1 + 1); everything but the Camp's +1 expires at end of turn", async () => {
    const game = await smokeFirst();
    await game.settle();
    await game.p1.move("grunt", "camp");
    expect(game.state("grunt").might).toBe(4);
    await game.settle();
    await game.advanceTurn();
    expect(game.locationOf("grunt")).toBe("camp");
    expect(game.state("grunt")).toMatchObject({ might: 3, mightModifier: 0 }); // 2 + the Camp's continuous +1
  });
});
