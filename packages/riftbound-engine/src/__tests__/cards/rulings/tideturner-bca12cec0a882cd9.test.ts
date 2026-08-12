/**
 * Ruling bca12cec0a882cd9 — Tideturner (OGN-199 → ogn-199-298) · 2 Might · [Hidden]
 *   "When you play me, you may choose a unit you control at another location. Move me to its location and
 *    it to my original location."
 *
 * Q: Can a player flip a hidden Tideturner at Battlefield A to swap units while the combat is at Battlefield B?
 * A: Yes. Hidden cards may be played whatever battlefield the showdown is at. And although a hidden card
 *    normally only reaches units at its OWN battlefield, Tideturner explicitly names a unit "at another
 *    location", so it can pull a unit out of the fight at B.
 * Rules: 811.1.c.3 (a facedown card is played like any Reaction, wherever the showdown is), 811.1.d.2 (a
 *        hidden card's choices are limited to its own battlefield unless its text says otherwise), 355.5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";

/** P1's turn: P1 holds bfA with a Holder and a facedown Tideturner; P1's Raider attacks P2's Wall at bfB. */
function board() {
  return scenario()
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bfB", { might: 6, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .facedown(P1, "bfA", TIDETURNER, "tide");
}

/** Open the combat at bfB and stop with P1 on Focus. */
async function attackAtB(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bfB");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.zoneOf("tide")).toBe("facedown-bfA");
  return game;
}

async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
}

describe("Ruling bca12cec0a882cd9 — a hidden Tideturner at bfA may be flipped during a combat at bfB, and reaches across", () => {
  test("ruling: the flip is legal even though the showdown is at a different battlefield", async () => {
    const game = await attackAtB();
    expect(game.p1.can("reveal", "tide")).toBe(true);
    await game.p1.reveal("tide");
    expect(game.zoneOf("tide")).toBe("battlefield-bfA"); // it enters at its own battlefield
  });

  test("ruling: its 'you may' trigger is offered, and the unit it may choose is the one at ANOTHER location", async () => {
    const game = await attackAtB();
    await game.p1.reveal("tide");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "tide" } });
    await game.p1.yes();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "tide", controller: P1, targets: ["raider"], triggered: true }),
    ]);
    expect(game.locationOf("raider")).toBe("bfB"); // chosen from the OTHER battlefield
  });

  test("ruling: the swap resolves across the battlefields — Tideturner goes to bfB, the Raider comes home to bfA", async () => {
    const game = await attackAtB();
    await game.p1.reveal("tide");
    await game.p1.yes();
    await drain(game);
    expect(game.locationOf("tide")).toBe("bfB");
    expect(game.locationOf("raider")).toBe("bfA");
    expect(game.locationOf("holder")).toBe("bfA");
  });

  test("ruling: declining the 'you may' leaves everything where it was — Tideturner simply arrives at bfA", async () => {
    const game = await attackAtB();
    await game.p1.reveal("tide");
    await game.p1.no();
    await drain(game);
    expect(game.locationOf("tide")).toBe("bfA");
    expect(game.locationOf("raider")).toBe("bfB");
    expect(game.violations()).toEqual([]);
  });

  test("consequence: the swap pulls the Raider out of the fight and feeds the 2-Might Tideturner to the 6-Might Wall", async () => {
    const game = await attackAtB();
    await game.p1.reveal("tide");
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("tide")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bfA");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
  });
});
