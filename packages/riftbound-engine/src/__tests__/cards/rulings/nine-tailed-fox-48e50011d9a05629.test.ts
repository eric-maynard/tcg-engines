/**
 * Ruling 48e50011d9a05629 — Nine-Tailed Fox (OGN-255 → ogn-255-298, Ahri legend)
 *   "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] "Move a friendly unit and ready it."
 *
 * Q: Does Ahri's trigger apply to a unit that joins the attack after the showdown already began (e.g. via Ride the Wind)?
 * A: Yes. Ahri triggers whenever a unit gains the attacker designation for the first time at a battlefield her player
 *    controls — the original attacker on arrival, and the late arrival when it becomes an attacker mid-combat.
 * Rules: 383.4.e (attack triggers on gaining the Attacker designation, once per unit per combat), 450 ff. (units that
 *        arrive mid-combat gain designations at the next Cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const RIDE_THE_WIND = "ogn-173-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P2 (Ahri legend) controls bf1 with a 6-might Guard. P1: "lead" (4) and "late" (3) in base, Ride the Wind
 * in hand with exactly [2][chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .legend(P2, NINE_TAILED_FOX, "ahri")
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Lead Attacker" }, "lead")
    .unit(P1, "base", { might: 3, name: "Late Arrival" }, "late")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** lead attacks bf1; Ahri's trigger resolves (both pass); we are in the showdown with P1 holding Focus. */
async function leadAttacks(game: Game): Promise<void> {
  await game.p1.move("lead", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P2, triggered: true })]);
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.state("lead").might).toBe(3); // 4 − 1
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
}

/** P1 Rides the Wind on `late` into bf1 and lets the spell (only) resolve. */
async function rideLateIn(game: Game): Promise<void> {
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "late" });
  for (let i = 0; i < 6 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toContain("battlefield-bf1");
      await game.p1.pick("battlefield-bf1");
    } else if (d?.kind === "action") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("late")).toBe("bf1");
}

describe("Ruling 48e50011d9a05629 — Ahri also debuffs a unit that becomes an attacker mid-showdown", () => {
  test("combat begins: the lead attacker gains the Attacker designation and Ahri gives it -1 Might", async () => {
    const game = await board().build();
    await leadAttacks(game);
    expect(game.state("lead").combatRole).toBe("attacker");
    expect(game.state("late").might).toBe(3); // still in base, untouched
  });

  test("Ride the Wind brings 'late' into the fight: it gains the Attacker designation and Ahri triggers AGAIN, on the newcomer only", async () => {
    const game = await board().build();
    await leadAttacks(game);
    await rideLateIn(game);
    expect(game.state("late").combatRole).toBe("attacker");
    expect(game.state("late").isReady).toBe(true);
    // A fresh Ahri trigger is on the chain for the newcomer.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P2, triggered: true })]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("late").might).toBe(2); // 3 − 1
    expect(game.state("lead").might).toBe(3); // not hit a second time (once per unit per combat, 383.4.e.2.a)
  });

  test("the combat then resolves with both debuffs in force: 3 + 2 = 5 < Guard's 6 — attackers lose", async () => {
    const game = await board().build();
    await leadAttacks(game);
    await rideLateIn(game);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0); // 5 < 6: not lethal, and damage heals at end of combat anyway
    // Without Ahri's second trigger it would have been 3 + 3 = 6 — a kill. The Guard surviving proves the newcomer was debuffed.
    expect(game.zoneOf("lead")).toBe("trash"); // 6 damage assigned: lethal to lead (3)…
    expect(game.violations()).toEqual([]);
  });
});
