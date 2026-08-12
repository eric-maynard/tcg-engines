/**
 * Ruling 4ff43f90d5f30ab1 — (where a hidden card goes when its controller loses the battlefield; no card named)
 *   Stand-in: Sprite Call (OGN-094 → ogn-094-298) · "[Hidden] [Action] Play a ready 3 [Might] Sprite unit token
 *   with [Temporary]." hidden at bf1 on an earlier turn; Flurry of Blades (OGN-133 → ogn-133-298) · [Reaction]
 *   [1] "Deal 1 to all units at battlefields" as the removal.
 *
 * Q: What happens to hidden cards after their controller loses control of the battlefield?
 * A: They go to their owner's trash. Outside combat that happens the moment control lapses (the Cleanup after
 *    the last friendly unit leaves). During a showdown or combat, though, control is held until the combat
 *    resolves even with no units left — so the card stays flippable through that window and is only removed
 *    when the combat resolves against you. No opponent interaction with the card is needed either way.
 * Rules: 323.6 / 190.4.b (control lapses only at an OPEN-State Cleanup, and never while a showdown/combat is
 *        ongoing there), 323.7 (facedown cards follow control in that Cleanup), 466.5.c (at combat resolution,
 *        hidden cards not sharing a controller with the battlefield are removed), 811 ([Hidden]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";
const FLURRY_OF_BLADES = "ogn-133-298";

/** Turn 3, P2's turn. P1 holds bf1 with a lone 1-Might Sentry + Sprite Call hidden there; P2 attacks with a Raider (2). */
function combatBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Sentry" }, "sentry")
    .facedown(P1, "bf1", SPRITE_CALL, "call")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P2, FLURRY_OF_BLADES, "flurry");
}

/** P2 attacks bf1 and then, inside the showdown, Flurries P1's lone defender off the board. */
async function defenderWipedMidShowdown(): Promise<Game> {
  const game = await combatBoard().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  await game.p2.cast("flurry");
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("sentry")).toBe("trash");
  return game;
}

describe("Ruling 4ff43f90d5f30ab1 — a hidden card is trashed when control is lost, but combat freezes that moment", () => {
  test("outside combat: the last friendly unit walks away, control lapses at once and the hidden card goes to its owner's trash — no opponent action required", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
      .facedown(P1, "bf1", SPRITE_CALL, "call")
      .build();
    await game.p1.move("sentry", "base");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.p1.trash()).toContain("call");
  });

  test("during the combat: my defender is gone, yet bf1 is STILL mine and the hidden card is still there — and still playable as a reaction", async () => {
    const game = await defenderWipedMidShowdown();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("call")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "call")).toBe(true);
  });

  test("once the combat resolves against me the attacker takes bf1 and the un-flipped hidden card is removed to my trash", async () => {
    const game = await defenderWipedMidShowdown();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.p1.trash()).toContain("call");
    expect(game.violations()).toEqual([]);
  });

  test("using that window instead keeps everything: flipping Sprite Call inside the showdown puts a 3-Might Sprite at bf1, so I never lose control and never lose the card to 466.5.c", async () => {
    const game = await defenderWipedMidShowdown();
    await game.p1.reveal("call");
    await game.settle();
    expect(game.zoneOf("call")).toBe("trash"); // spent, not discarded — it was played
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.units("bf1")).toHaveLength(1);
    expect(game.p2.points()).toBe(0);
  });
});
