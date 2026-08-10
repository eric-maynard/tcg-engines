/**
 * Ruling 3912ba35d83534bb — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · "When a friendly unit attacks or defends alone,
 *     give it +1 [Might] this turn."
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 Might · "[Hidden] When you play me, you may choose a unit you control at another
 *     location. Move me to its location and it to my original location."
 *
 * Q: My 4-Might unit holds a battlefield, Mask in base, Tideturner hidden there. Opponent moves in — does the Mask's +1
 *    apply before I reveal the hidden unit as a reaction?
 * A: Yes, if you let it: the opponent's move designates your lone unit as defender → Mask triggers; let it resolve (+1 → 5),
 *    THEN reveal/play the hidden unit. If instead the unit is not alone when designated, the Mask gives nothing.
 * Rules: 460–462 (attack: showdown opens, defenders designated), 383 (trigger → chain), 811.1.c (a Hidden card may be
 *        played with Reaction timing / while you have Focus), 811.1.d.1 (it enters at that battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const TIDETURNER = "ogn-199-298";

/** P2's turn. P1 controls bf1 with a lone 4-Might Guard, Mask of Foresight in base, Tideturner facedown at bf1. P2: 5-Might Raider in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .facedown(P1, "bf1", TIDETURNER, "tt")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

async function raiderMovesIn(): Promise<Game> {
  const game = await board().build();
  expect(game.state("guard").might).toBe(4);
  await game.p2.move("raider", "bf1");
  return game;
}

describe("Ruling 3912ba35d83534bb — let Mask of Foresight's 'defends alone' +1 resolve, then reveal the hidden Tideturner", () => {
  test("steps 1–2: the Raider moving in designates the lone Guard as defender → the Mask's trigger is on the chain at once (Guard still 4, Tideturner still facedown)", async () => {
    const game = await raiderMovesIn();
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
    expect(game.state("guard").might).toBe(4);
    expect(game.zoneOf("tt")).toBe("facedown-bf1");
    // P1 holds priority here and COULD already flip Tideturner — the ruling's point is that P1 may simply wait.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "tt")).toBe(true);
  });

  test("steps 3–4: P1 passes, the trigger resolves → Guard is 5; only then P1 (with Focus, empty chain) reveals Tideturner for [0] — it enters at bf1 and the Guard STAYS 5", async () => {
    const game = await raiderMovesIn();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Mask resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").might).toBe(5);
    // Showdown continues: P2 (attacker) has Focus first, then P1.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "tt")).toBe(true);
    const energy = game.p1.energy();
    await game.p1.reveal("tt");
    expect(game.p1.energy()).toBe(energy); // played from hidden for [0]
    expect(game.zoneOf("tt")).toBe("battlefield-bf1"); // 811.1.d.1
    expect(game.state("guard").might).toBe(5); // the +1 already granted is not undone by no longer being alone
    // Finish: 5 (Raider) into Guard 5 + Tideturner 2 = 7 → the Raider dies (P2 assigns its 5 as it likes), P1 keeps bf1.
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p1.units("bf1").length).toBeGreaterThanOrEqual(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("also fine: revealing Tideturner IN RESPONSE to the Mask trigger (before it resolves) still yields 5 — the Guard was alone when designated, and the trigger is already on the chain", async () => {
    const game = await raiderMovesIn();
    await game.p1.reveal("tt");
    expect(game.zoneOf("tt")).toBe("battlefield-bf1");
    expect(game.chain().some((c) => c.cardId === "mask" && c.triggered)).toBe(true);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.state("guard").might).toBe(5);
  });

  test("nuance: if the Guard is NOT alone when it is designated (Tideturner already face up beside it), the Mask never triggers — the Guard defends at 4", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "bf1", TIDETURNER, "tt")
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain().some((c) => c.cardId === "mask")).toBe(false);
    expect(game.state("guard").might).toBe(4);
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.state("guard").might).toBe(4);
  });
});
