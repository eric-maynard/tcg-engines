/**
 * Ruling ed9617e5476badb6 — Tideturner (OGN-199 → ogn-199-298) · 2 Might · [2] "[Hidden] When you play me, you may choose a
 *     unit you control at another location. Move me to its location and it to my original location."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) Battlefield "Units can't move from here to base."
 *   (× Vilemaw unl-060-219 — the scrape's guess for "Vilesaw's Lair"; the battlefield is what the question means.)
 *
 * Q: Opponent plays Tideturner in base and chooses their unit at Vilemaw's Lair. What happens?
 * A: A partial swap. Tideturner moves base → Lair (nothing forbids that), but the Lair unit "can't move from here to base",
 *    so it stays. Both end up at the Lair.
 * Rules: "can't beats can", 359.3.e.6 (an impossible instruction is skipped, the rest still happens), 433/449 (moves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const VILEMAWS_LAIR = "ogn-295-298";

/** P2's turn (the "opponent") with exactly [2]. P2 holds the battlefield `lair` with a 4-Might Lurker; Tideturner in hand. */
function board(liveLair: boolean) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("lair", liveLair ? { controller: P2, def: VILEMAWS_LAIR, inert: false, owner: P2 } : { controller: P2 })
    .unit(P2, "lair", { might: 4, name: "Lurker" }, "lurker")
    .unit(P1, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P2, TIDETURNER, "tide");
}

/** Play Tideturner to base, opt in to the swap (a P2 decision at finalization) choosing the Lurker, and let it resolve. */
async function playAndSwap(liveLair: boolean): Promise<Game> {
  const game = await board(liveLair).build();
  await game.p2.play("tide", { to: "base" });
  expect(game.p2.energy()).toBe(0);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "FIN" });
  await game.p2.yes();
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("lurker");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tide", controller: P2, targets: ["lurker"], triggered: true })]);
  expect(game.locationOf("tide")).toBe("base"); // nothing moved before resolution
  await game.settle();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling ed9617e5476badb6 — Tideturner from base swapping with a unit at Vilemaw's Lair only half-works", () => {
  test("at Vilemaw's Lair: Tideturner moves to the Lair, the Lurker can't move to base and stays — both are at the Lair", async () => {
    const game = await playAndSwap(true);
    expect(game.state("lurker").keywords).toContain("NoMoveToBase"); // the Lair's restriction is on it
    expect(game.locationOf("tide")).toBe("lair");
    expect(game.locationOf("lurker")).toBe("lair");
    expect(game.p2.units("lair").sort()).toEqual(["lurker", "tide"]);
    expect(game.p2.units("base")).toEqual([]);
    expect(game.gameState.battlefields.lair?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control (ordinary battlefield): the full swap happens — Tideturner to the battlefield, the Lurker to base", async () => {
    const game = await playAndSwap(false);
    expect(game.locationOf("tide")).toBe("lair");
    expect(game.locationOf("lurker")).toBe("base");
  });
});
