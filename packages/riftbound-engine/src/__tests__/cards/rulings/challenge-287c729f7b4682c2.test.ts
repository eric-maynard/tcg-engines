/**
 * Ruling 287c729f7b4682c2 — Challenge (OGN-128 → ogn-128-298) · [2][body] [Action]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *
 * Q: I Challenge with a unit in base and then conquer an OPEN battlefield — do I heal?
 * A: No. Healing is part of Combat Cleanup, and moving onto an empty/uncontrolled battlefield opens a
 *    NON-combat showdown — there is no combat, so there is no combat cleanup and no heal. Challenge is
 *    not combat either; its damage simply stays marked until something heals it (end of turn / a real
 *    combat's cleanup).
 * Rules: 316.8.b.1 (empty battlefield ⇒ non-combat showdown), 461.1.a.1 (heal is a Combat Cleanup step),
 *        348.2 (non-combat showdown close ⇒ conquer), 469 (Conquer scores).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";

/** P1's turn: 6-Might Champion and a 2-Might enemy Gnat both in base; bfX is empty and uncontrolled. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bfX", { controller: null })
    .unit(P1, "base", { might: 6, name: "Champion" }, "champion")
    .unit(P2, "base", { might: 2, name: "Gnat" }, "gnat")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 287c729f7b4682c2 — conquering an OPEN battlefield is not combat, so nothing heals", () => {
  test("Challenge marks 2 damage on the Champion (and kills the Gnat) with no healing of its own", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["champion", "gnat"] });
    await game.settle();
    expect(game.zoneOf("gnat")).toBe("trash"); // took 6 vs 2 Might
    expect(game.state("champion").damage).toBe(2);
    expect(game.zoneOf("challenge")).toBe("trash");
  });

  test("moving onto the empty bfX opens a NON-combat showdown — no attacker/defender designations", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["champion", "gnat"] });
    await game.settle();
    await game.p1.move("champion", "bfX");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
      battlefieldId: "bfX",
      isCombatShowdown: false,
    });
    expect(game.state("champion").combatRole).toBeNull();
  });

  test("ruling: the Champion conquers bfX and scores, but keeps its 2 damage — there was no combat cleanup", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["champion", "gnat"] });
    await game.settle();
    await game.p1.move("champion", "bfX");
    await game.settle();
    expect(game.gameState.battlefields.bfX?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("champion").damage).toBe(2); // NOT healed
    expect(game.violations()).toEqual([]);
  });

  test("contrast: winning a real COMBAT does heal the survivor", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
      .unit(P1, "base", { might: 6, name: "Champion" }, "champion")
      .unit(P2, "base", { might: 2, name: "Gnat" }, "gnat")
      .hand(P1, CHALLENGE, "challenge")
      .build();
    await game.p1.cast("challenge", { targets: ["champion", "gnat"] });
    await game.settle();
    expect(game.state("champion").damage).toBe(2);
    await game.p1.move("champion", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("champion").damage).toBe(0); // combat cleanup healed it
  });
});
