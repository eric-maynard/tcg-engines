/**
 * Ruling 5539417374124598 — Tideturner (OGN-199 → ogn-199-298) · 2 Might · "[Hidden] When you play me, you may choose a unit you
 *   control at another location. Move me to its location and it to my original location."
 *   × Charm (OGN-043 → ogn-043-298) · Spell · [1][calm] "Move an enemy unit."
 *
 * Q: Charm resolves and moves my only unit (Mundo) off the battlefield where Tideturner is hidden — can I still flip Tideturner
 *    before I lose control of that battlefield?
 * A: No. Once Charm resolves the movement causes a Cleanup: with no units there and no contest you lose control, and the same
 *    Cleanup removes (trashes) hidden cards at battlefields you don't control — there is no window in between. You COULD have played
 *    Tideturner from hidden while Charm was still on the chain.
 * Rules: 318/323 (Cleanup after a move: control re-evaluated, hidden cards at uncontrolled battlefields removed), 811 (Hidden),
 *        190.4 (control needs a unit or a contest).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const CHARM = "ogn-043-298";

/**
 * P2's turn 3. P1 holds bfA with Mundo (5) alone and hid Tideturner there earlier; bfB is open. P2: Charm + exactly [1][calm].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", { might: 5, name: "Mundo" }, "mundo")
    .facedown(P1, "bfA", TIDETURNER, "tide")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P2, CHARM, "charm");
}

/** P2 Charms Mundo toward bfB; stops in P1's response window. */
async function charmOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { targets: "mundo" });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // the mover (P2) chooses where
    await game.p2.pick("battlefield-bfB");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P2 })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 5539417374124598 — after Charm empties the battlefield the hidden Tideturner is trashed in the same Cleanup; no reveal window", () => {
  test("nuance: BEFORE Charm resolves (P1's response window on the chain) playing Tideturner from hidden IS legal", async () => {
    const game = await charmOnChain();
    expect(game.zoneOf("tide")).toBe("facedown-bfA");
    expect(game.p1.can("reveal", "tide")).toBe(true);
  });

  test("P1 passes instead → Charm resolves: Mundo leaves bfA, and in the resulting Cleanup P1 loses bfA (no unit, not contested) and the hidden Tideturner goes straight to the trash", async () => {
    const game = await charmOnChain();
    await game.p1.passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bfB");
    }
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("mundo")).toBe("bfB");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("tide")).toBe("trash");
    expect(game.p1.facedown("bfA")).toEqual([]);
  });

  test("…so there is no moment at which P1 can still reveal it: the very next decision after resolution already has Tideturner in the trash and no reveal option", async () => {
    const game = await charmOnChain();
    await game.p1.passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bfB");
    }
    // First decision after Charm left the chain:
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("tide")).toBe("trash");
    expect(game.p1.can("reveal", "tide")).toBe(false);
    expect((await game.p1.try((p) => p.reveal("tide"))).ok).toBe(false);
    await game.settle();
    await game.settle();
    expect(game.zoneOf("tide")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
