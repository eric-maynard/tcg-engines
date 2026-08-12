/**
 * Ruling 7010cc85fb1ebbfb — Glasc Mixologist (SFD-165 → sfd-165-221) · Unit · Order · [5][order] · 5 Might
 *     "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash,
 *      ignoring its cost."
 *
 * Q: A lone defender with Deathknell dies in combat and its Deathknell plays a new unit to the battlefield — does a
 *    new combat start against the attackers?
 * A: No. FEPR is skipped during combat (460.3), so the Deathknell waits: Combat Cleanup kills it and heals the
 *    survivors, then the Resolution Step finishes (result determined, control established, combat ends). Only after
 *    the whole combat is over does the Deathknell resolve, so the arriving unit was never part of the combat and no
 *    new combat is staged.
 * Rules: 460.3 (no FEPR inside combat), 461.1.a.1 (Combat Cleanup: deaths + heal), 461.3–461.7 (Resolution Step),
 *        466.5 (combat result / conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC_MIXOLOGIST = "sfd-165-221";
const REVIVABLE = { cardType: "unit", energyCost: 2, might: 2, name: "Chem Grunt" } as const;

const showdowns = (game: Game) => game.gameState.interaction?.showdownStack ?? [];

/**
 * P1's turn. P2 holds bf1 with the Mixologist ALONE and also holds bf2 (with a Holder, so P2 keeps a legal battlefield
 * to play to). P2's trash holds a cheap unit for the Deathknell. P1's 6-Might Attacker walks into bf1: 6 kills the
 * 5-Might Mixologist, whose 5 back does not kill the Attacker.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", GLASC_MIXOLOGIST, "mixo")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 6, name: "Attacker" }, "atk")
    .trash(P2, REVIVABLE, "grunt");
}

/** Answer P2's Deathknell prompts (opt-in, which unit, where) taking the first offer, and drive to an open main phase. */
async function finish(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d === null) {
      return;
    }
    if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else {
      return;
    }
  }
}

describe("Ruling 7010cc85fb1ebbfb — a defender's Deathknell resolves only after the whole combat has ended, so no new combat starts", () => {
  test("the Deathknell does NOT interrupt the combat: the Mixologist dies, the Attacker survives healed, P1 conquers bf1 and scores it", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf1");
    expect(game.state("mixo").combatRole).toBe("defender");
    await finish(game);
    expect(game.zoneOf("mixo")).toBe("trash");
    expect(game.state("atk")).toMatchObject({ damage: 0, location: "bf1" }); // healed at Combat Cleanup
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("the revived unit arrives after combat ended: no showdown is left on the stack, bf1 is not contested again, and no second combat is staged", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf1");
    await finish(game);
    expect(game.zoneOf("grunt")).not.toBe("trash"); // it was played
    expect(game.locationOf("grunt")).not.toBe("bf1"); // bf1 belongs to P1 now — it cannot be played there
    expect(showdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(1); // exactly one conquer, not a second combat's worth
    expect(game.violations()).toEqual([]);
  });

  test("declining the Deathknell changes nothing about the combat result — it was already settled before the trigger was ever offered", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf1");
    for (let i = 0; i < 10; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d === null) {
        break;
      }
      if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else {
        break;
      }
    }
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(showdowns(game)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
