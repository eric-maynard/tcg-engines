/**
 * Ruling 232a8b4c9b6c89dd — Smoke Screen (OGN-093 → ogn-093-298) · Spell · Mind · 2 + [mind] · [Reaction]
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Chemtech Enforcer (OGN-003 → ogn-003-298) · 2 Might · [Assault 2] — the worked example in the answer.
 *   (+ Discipline ogn-058-298 "+2 [Might] this turn" as the later modifier; Rogue Assassin ven-139-166 to leave combat.)
 *
 * Q: An Assault attacker is Smoke Screened and then gets other Might changes — what is its Might afterwards? Can it hit 0?
 * A: Smoke Screen SNAPSHOTS the target's Might when it resolves and applies a fixed reduction of (that value − 1, max 4)
 *    for the turn; the "minimum 1" only shapes that snapshot. Later modifiers stack on top, so the final Might can be 0
 *    or negative. Chemtech Enforcer attacking (2 → 4): Smoke Screen snapshots 4, applies −3; out of combat it is 2 − 3 = −1.
 * Rules: 477.3 (Might arithmetic; decreases applied last), 143.2.b / 143.2.b.1 (negative Might is treated as 0 when
 *        referenced but keeps its actual value for further increases/decreases).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const CHEMTECH_ENFORCER = "ogn-003-298";
const DISCIPLINE = "ogn-058-298";
const ROGUE_ASSASSIN = "ven-139-166"; // [Action] legend: move a friendly unit in a showdown to base

/** P1's turn (legend Rogue Assassin, 2 energy, Discipline in hand). Enforcer (2, Assault 2) in base. P2 holds bf1 with Guard (3), has Smoke Screen + 2 + [mind]. */
function board() {
  return scenario()
    .legend(P1, ROGUE_ASSASSIN, "rogue")
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CHEMTECH_ENFORCER, "enf")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .hand(P1, DISCIPLINE, "disc");
}

/** Enforcer attacks (4 Might); P1 passes Focus; P2 Smoke Screens it and it resolves. P1 has Focus again, still in the showdown. */
async function attackAndGetSmoked(game: Game): Promise<void> {
  await game.p1.move("enf", "bf1");
  expect(game.state("enf")).toMatchObject({ combatRole: "attacker", might: 4 }); // 2 + Assault 2
  await game.p1.passFocus();
  await game.p2.cast("smoke", { targets: "enf" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("smoke")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

/** P1 uses Rogue Assassin to pull the Enforcer home; the showdown ends without combat. */
async function retreat(game: Game): Promise<void> {
  await game.p1.activate("rogue");
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("enf");
    } else {
      break;
    }
  }
  await game.settle();
  expect(game.locationOf("enf")).toBe("base");
  expect(game.state("enf").combatRole).toBeNull();
  expect(game.turnPlayer()).toBe(P1); // same turn
}

describe("Ruling 232a8b4c9b6c89dd — Smoke Screen snapshots its reduction; later Might changes can leave the unit at 0 or below", () => {
  test("on the 4-Might attacking Enforcer, Smoke Screen snapshots 4 and applies a fixed −3 (4 → 1, the 'minimum 1')", async () => {
    const game = await board().build();
    await attackAndGetSmoked(game);
    expect(game.state("enf").might).toBe(1);
    expect(game.state("enf").mightModifier).toBe(-3);
  });

  test("out of combat the same turn (Assault no longer applies) the −3 is NOT re-clamped: actual Might is 2 − 3 = −1 — referenced as 0 (143.2.b), and a later +2 makes it 1, not 3 (143.2.b.1)", async () => {
    const game = await board().build();
    await attackAndGetSmoked(game);
    await retreat(game);
    const s = game.state("enf");
    expect(s.mightModifier).toBe(-3); // the snapshotted reduction persists unchanged
    expect(s.baseMight + s.mightModifier).toBe(-1); // the actual value
    expect(s.might).toBe(0); // what spells/abilities/combat would read
    expect(game.zoneOf("enf")).toBe("base"); // 0 Might with no damage is not lethal
    await game.p1.cast("disc", { targets: "enf" });
    await game.settle();
    expect(game.state("enf").might).toBe(1); // −1 + 2, proving the value really was −1 (not floored to 1 or 0)
    expect(game.violations()).toEqual([]);
  });

  test("contrast: on a unit that is only 2 Might when Smoke Screen resolves, the snapshot is −1 (2 → 1), not −4", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { mind: 1 } })
      .unit(P1, "base", CHEMTECH_ENFORCER, "enf") // not attacking: plain 2 Might
      .hand(P2, SMOKE_SCREEN, "smoke")
      .build();
    await game.p2.cast("smoke", { targets: "enf" });
    await game.settle();
    expect(game.state("enf")).toMatchObject({ might: 1, mightModifier: -1 });
  });

  test("the reduction lasts only this turn: next turn the Enforcer is back to its printed 2", async () => {
    const game = await board().build();
    await attackAndGetSmoked(game);
    await retreat(game);
    await game.advanceTurn();
    expect(game.state("enf")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
