/**
 * Ruling 459c19da458dfc62 — Forbidding Waste (UNL-210 → unl-210-219) · Battlefield
 *     "While a unit here is defending alone, it has -2 [Might]. (It's alone if there are no other friendly units here.)"
 *   × Irresistible Faefolk (UNL-112 → unl-112-219) · 1 Might "When I move to a battlefield, you may move an enemy unit to
 *     that battlefield."
 *   × Sona, Harmonious (OGN-073 → ogn-073-298) · 4 Might
 *
 * Q: I move Faefolk to the UNCONTESTED Forbidding Waste and pull the enemy Sona in with its trigger. Who gets the -2?
 * A: Sona. Faefolk applied Contested first so its controller is the attacker; Sona arrives as the (lone) defender, so
 *    the -2 applies to her (4 → 2). Faefolk, the attacker, is unaffected.
 * Rules: 459.2.b.1 (who contested first attacks), 464.2.c.3.a (late arrival on the other side defends), 741.1 (alone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORBIDDING_WASTE = "unl-210-219";
const FAEFOLK = "unl-112-219";
const SONA = "ogn-073-298";

function board() {
  return scenario()
    .battlefield("waste", { controller: null, def: FORBIDDING_WASTE, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", FAEFOLK, "faefolk")
    .unit(P2, "base", SONA, "sona");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Faefolk → Waste; accept its trigger choosing Sona; pass until the trigger has resolved (Sona pulled in). */
async function pullSonaIn(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sona").might).toBe(4);
  await game.p1.move("faefolk", "waste");
  expect(game.gameState.battlefields.waste).toMatchObject({ contested: true, contestedBy: P1 });
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (game.locationOf("sona") === "waste" && d.kind === "action") {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("sona");
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  expect(game.locationOf("sona")).toBe("waste");
  return game;
}

describe("Ruling 459c19da458dfc62 — Faefolk drags Sona into an uncontested Forbidding Waste: Sona defends alone and takes the -2", () => {
  test("Faefolk (moved first, applied Contested) is the ATTACKER; Sona, pulled in by the trigger, is the DEFENDER", async () => {
    const game = await pullSonaIn();
    // Drive into the combat showdown if it has not opened yet.
    for (let i = 0; i < 6 && !showdown(game)?.active; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "waste", defendingPlayer: P2 });
    expect(game.state("faefolk").combatRole).toBe("attacker");
    expect(game.state("sona").combatRole).toBe("defender");
  });

  test("Sona is defending ALONE (Faefolk is an enemy, not a friendly unit) → 4 - 2 = 2 Might; Faefolk stays at 1", async () => {
    const game = await pullSonaIn();
    for (let i = 0; i < 6 && !showdown(game)?.active; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(showdown(game)?.active).toBe(true);
    expect(game.state("sona")).toMatchObject({ baseMight: 4, might: 2 });
    expect(game.state("faefolk")).toMatchObject({ baseMight: 1, might: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("end to end: 1-Might attacker vs 2-Might lone defender — Faefolk dies, Sona survives and P2 takes the Waste; out of combat she reads 4 again", async () => {
    const game = await pullSonaIn();
    await game.settle();
    expect(game.zoneOf("faefolk")).toBe("trash");
    expect(game.locationOf("sona")).toBe("waste");
    expect(game.gameState.battlefields.waste).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("sona").combatRole).toBeNull();
    expect(game.state("sona").might).toBe(4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
