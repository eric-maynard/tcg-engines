/**
 * Ruling 303cb315770574b4 — Recruit the Vanguard (OGS-015 → ogs-015-024) · Order · [6] · [Action]
 *   "Play four 1 [Might] Recruit unit tokens. (They can be played to your base or to battlefields you control.)"
 *
 * Q: Can you play Recruit the Vanguard when you are the attacker?
 * A: Not to reinforce the battlefield you are attacking — as the attacker you do not control it, so the
 *    Recruits can only go to your base. A DEFENDER who controlled the battlefield before the attack may spawn
 *    them straight into it during the combat showdown.
 * Rules: 355.2.a / play destinations ("battlefields you control"), 190.4 (the attacker never controls the
 *        contested battlefield), 466.5 (control during a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RECRUIT_THE_VANGUARD = "ogs-015-024";

/** P2 holds bf1 with a 3-Might Guard; P1's 6-Might Brute attacks it. `caster` gets the spell and [6]. */
function board(caster: string) {
  return scenario()
    .resources(caster, { energy: 6 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .hand(caster, RECRUIT_THE_VANGUARD, "rtv");
}

/** P1 attacks bf1; `whose` is then given focus in the showdown. */
async function attack(caster: string): Promise<Game> {
  const game = await board(caster).build();
  await game.p1.move("brute", "bf1");
  expect(game.state("brute").combatRole).toBe("attacker");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the attacker does NOT control it
  if (caster === P2) {
    await game.p1.passFocus();
  }
  return game;
}

describe("Ruling 303cb315770574b4 — the attacker cannot spawn Recruits into the battlefield they are attacking", () => {
  test("ruling: P1 (the attacker) may cast it in the showdown, but all four Recruits land in P1's BASE — bf1 is not theirs", async () => {
    const game = await attack(P1);
    expect(game.p1.can("cast", "rtv")).toBe(true);
    await game.p1.cast("rtv");
    await game.settle({ maxSteps: 20 });
    expect(game.p1.units("base")).toHaveLength(4);
    expect(game.p1.units("bf1")).toEqual(["brute"]); // no Recruit was ever placed at the contested battlefield
  });

  test("…and the four tokens really are 1-Might Recruits", async () => {
    const game = await attack(P1);
    await game.p1.cast("rtv");
    await game.settle({ maxSteps: 20 });
    for (const id of game.p1.units("base")) {
      expect(game.state(id)).toMatchObject({ isToken: true, might: 1 });
    }
    expect(game.violations()).toEqual([]);
  });

  // The printed reminder: "they can be played to your base or to battlefields you control" — the DEFENDER
  // controls bf1 throughout the showdown (190.4.b), so each Recruit is offered base OR bf1 and may be
  // spawned straight into the combat. (`settle()` is passive and takes the first option, the base.)
  test(
    "ruling 303cb315770574b4 — the defender, who does control bf1, is offered bf1 for every Recruit and may reinforce the showdown",
    async () => {
      const game = await attack(P2);
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
      await game.p2.cast("rtv");
      await game.p2.passPriority();
      await game.p1.passPriority();
      for (let i = 0; i < 4; i++) {
        const decision = game.decision();
        if (decision?.kind !== "pick") {
          break;
        }
        expect(decision.options?.map((o) => o.key)).toContain("battlefield-bf1");
        await game.p2.pick("battlefield-bf1");
      }
      expect(game.p2.units("bf1")).toHaveLength(5); // the Guard plus all four Recruits
      await game.settle({ maxSteps: 20 });
      // The reinforced defence wins the combat, so bf1 stays P2's.
      expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    },
  );
});
