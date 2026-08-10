/**
 * Ruling 6457225d6437b45e — Tideturner (OGN-199 → ogn-199-298) · [2] · 2 Might · "[Hidden] When you play me, you may choose a unit you
 *     control at another location. Move me to its location and it to my original location."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Action · [2] · "Move a unit from a battlefield to its base."
 *   × Ember Monk (OGN-167 → ogn-167-298) · 4 Might · "When you play a card from [Hidden], give me +2 [Might] this turn."
 *
 * Q: Fight or Flight targets Ember Monk at the RIGHT battlefield; can Tideturner hidden at the LEFT battlefield be revealed as a
 *    Reaction, and is Ember Monk still a valid target after Tideturner swaps it over to the left battlefield?
 * A: Yes and yes. A hidden card can be revealed whenever you have priority, wherever the action is; Tideturner's partner may be at
 *    another location. After the swap Ember Monk is still "a unit at a battlefield", so Fight or Flight resolves and moves it to base.
 * Rules: 811 (play from facedown as a Reaction while you have priority), 811.1.d.2 (Tideturner exception to "here"), 359.3.e
 *        (target re-checked on resolution: still at a battlefield → legal), 446 (move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const EMBER_MONK = "ogn-167-298";

/**
 * P2's turn (turn 3). P1 controls LEFT (Holder 3 + Tideturner facedown since an earlier turn) and RIGHT (Ember Monk).
 * P2 holds Fight or Flight with [2].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("left", { controller: P1 })
    .battlefield("right", { controller: P1 })
    .unit(P1, "left", { might: 3, name: "Holder" }, "holder")
    .facedown(P1, "left", TIDETURNER, "tide")
    .unit(P1, "right", EMBER_MONK, "monk")
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** P2 casts Fight or Flight at the Monk (right) and passes; P1 reveals Tideturner at left and swaps it with the Monk. */
async function fofThenTideturnerSwap(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("fof", { targets: "monk" });
  expect(chainIds(game)).toEqual(["fof"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "tide")).toBe(true); // hidden at LEFT while the spell concerns RIGHT — still legal
  await game.p1.reveal("tide");
  expect(game.p1.energy()).toBe(0); // played for [0] from facedown
  // Tideturner lands at left; its "you may choose a unit you control at another location" asks P1 → the Monk at right.
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("monk");
      await game.p1.pick("monk");
    } else {
      break;
    }
  }
  expect(game.chain().some((c) => c.cardId === "tide" && c.triggered)).toBe(true);
  expect(chainIds(game)[0]).toBe("fof"); // Fight or Flight still waiting underneath
  // Resolve everything above Fight or Flight (Tideturner's swap, Ember Monk's +2), leaving FoF as the last item.
  for (let i = 0; i < 12 && game.chain().length > 1; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.seat === P1) {
      await game.acceptTriggerOrder(); // Tideturner's swap + Ember Monk's +2 are both P1's — either order works here
    } else if (d?.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(chainIds(game)).toEqual(["fof"]);
  return game;
}

describe("Ruling 6457225d6437b45e — Tideturner revealed elsewhere swaps Ember Monk across; Fight or Flight still resolves on it", () => {
  test("Tideturner (hidden at LEFT) is revealable in response to a spell aimed at RIGHT; its swap puts Tideturner at right and Ember Monk at left — Monk got +2 for the play from Hidden", async () => {
    const game = await fofThenTideturnerSwap();
    expect(game.state("tide")).toMatchObject({ isHidden: false, zone: "battlefield-right" });
    expect(game.locationOf("monk")).toBe("left");
    expect(game.locationOf("holder")).toBe("left");
    expect(game.state("monk").might).toBe(6); // "When you play a card from [Hidden], give me +2 [Might] this turn"
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P2, targets: ["monk"] })]);
  });

  test("Fight or Flight then resolves and STILL moves Ember Monk — now from the left battlefield — to P1's base: a unit that is still at a battlefield remains a legal target", async () => {
    const game = await fofThenTideturnerSwap();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("monk")).toBe("base");
    expect(game.p1.base()).toContain("monk");
    expect(game.locationOf("tide")).toBe("right");
    expect(game.locationOf("holder")).toBe("left");
    expect(game.gameState.battlefields.left?.controller).toBe(P1);
    expect(game.gameState.battlefields.right?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: with no Tideturner response, Fight or Flight simply sends the Monk home from the right battlefield", async () => {
    const game = await board().build();
    await game.p2.cast("fof", { targets: "monk" });
    await game.settle();
    expect(game.zoneOf("monk")).toBe("base");
    expect(game.zoneOf("tide")).toBe("facedown-left");
  });
});
