/**
 * Ruling 28c8119a51a2dba2 — Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] · [2]
 *     "Move a unit from a battlefield to its base."
 *   × Tideturner (OGN-199 → ogn-199-298) · [Hidden] · 2 Might
 *     "When you play me, you may choose a unit you control at another location. Move me to its location and
 *      it to my original location."
 *
 * Q: My unit and a hidden Tideturner are at a battlefield I control; the opponent attacks and Fight or
 *    Flights my unit away. Can I wait for that to resolve and then Tideturner the unit back?
 * A: Yes. You keep control of the battlefield until the combat showdown ends, so being momentarily empty
 *    does not trash your hidden card — you may reveal Tideturner at any point before the showdown ends.
 * Rules: 190.4.b (control frozen while a showdown/combat is ongoing there), 323.6, 323.7 / 466.5.c
 *        (facedown cards follow control), 811 (Hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const TIDETURNER = "ogn-199-298";

/** P2's turn. P1 holds bf1 with a 3-Might Ward and a hidden Tideturner; P2's 5-Might Raider is at home. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Ward" }, "ward")
    .facedown(P1, "bf1", TIDETURNER, "tide")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .resources(P2, { energy: 2 })
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
}

/** P2 attacks bf1 and, inside the combat showdown, Fight or Flights the lone defender home. */
async function wardBanishedHome(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("ward").combatRole).toBe("defender");
  await game.p2.cast("fof", { targets: "ward" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.locationOf("ward")).toBe("base");
  return game;
}

describe("Ruling 28c8119a51a2dba2 — control (and the hidden card) survive an empty battlefield mid-showdown", () => {
  test("ruling: with no P1 unit left at bf1, P1 STILL controls it — the showdown is ongoing there", async () => {
    const game = await wardBanishedHome();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("ruling: the hidden Tideturner is not discarded — it is still face-down at bf1", async () => {
    const game = await wardBanishedHome();
    expect(game.zoneOf("tide")).toBe("facedown-bf1");
    expect(game.p1.facedown("bf1")).toEqual(["tide"]);
  });

  test("ruling: P1 may still reveal it, and its swap brings the Ward back to the battlefront", async () => {
    const game = await wardBanishedHome();
    expect(game.p1.can("reveal", "tide")).toBe(true);
    await game.p1.reveal("tide");
    expect(game.locationOf("tide")).toBe("bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ward");
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("ward")).toBe("bf1");
    expect(game.locationOf("tide")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
