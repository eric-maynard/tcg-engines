/**
 * Ruling 9ea0e3db66bc9753 — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · 6 Might · [5][body]
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.) I can be played to a battlefield
 *      where there are enemy units (even if you don't have units there)."
 *   × The Syren (OGN-184 → ogn-184-298) Gear "[1], [Exhaust]: Move a friendly unit at a battlefield to its base."
 *
 * Q: I attack an enemy battlefield with one unit by playing Rengar while The Syren's ability is on the chain — what happens?
 * A: With a chain in progress the turn is Closed: only [Reaction]-timed plays are legal, which Rengar (Ambush) is. He is
 *    added above the Syren item and, LIFO, is done (on the battlefield) before the older Syren ability resolves; then the
 *    Syren ability resolves. Playing Rengar onto a battlefield the ENEMY contested makes you the Defender there.
 * Rules: 309/331 (closed state), 338.1.a (only Reaction-timed plays mid-chain), 340/359.2 (LIFO; a permanent leaves the
 *        chain on finalization), 464.2.c.2 (defender = the player who did not apply Contested), 822 (Ambush).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";
const THE_SYREN = "ogn-184-298";
const GRUNT = { cardType: "unit", energyCost: 0, might: 2, name: "Grunt" } as const;

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

/**
 * P2's turn. P2 holds bfA with Guard (3) + Scout (2) and has The Syren + [1]. P1: Rengar in hand with exactly [5][body],
 * plus a free vanilla Grunt (to show non-Reactions are locked out mid-chain).
 */
function boardA() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { body: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bfA", { controller: P2 })
    .unit(P2, "bfA", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bfA", { might: 2, name: "Scout" }, "scout")
    .gear(P2, THE_SYREN, "syren")
    .hand(P1, RENGAR, "rengar")
    .hand(P1, GRUNT, "grunt");
}

/** P2 activates The Syren on the Scout and passes priority to P1. */
async function syrenOnChain(): Promise<Game> {
  const game = await boardA().build();
  await game.p2.activate("syren", 0, { targets: "scout" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "syren", controller: P2, targets: ["scout"] })]);
  expect(game.state("syren").isExhausted).toBe(true);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 9ea0e3db66bc9753 — Rengar Ambushed in over a pending Syren ability: LIFO, he lands first", () => {
  test("Closed State: with the Syren ability on the chain P1 may play Rengar (Ambush = Reaction timing) to bfA where only ENEMY units are — but not the vanilla Grunt", async () => {
    const game = await syrenOnChain();
    expect(game.p1.can("play", "grunt")).toBe(false);
    expect(game.p1.can("play", "rengar")).toBe(true);
    const to = game.p1.option("playUnit", "rengar")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(to.map(String)).toContain("battlefield-bfA"); // "even if you don't have units there"
    expect(game.p1.units("bfA")).toEqual([]);
  });

  test("LIFO: Rengar (the newer item) is finished and ON bfA while the older Syren ability is still waiting on the chain; the Scout has not moved yet", async () => {
    const game = await syrenOnChain();
    await game.p1.play("rengar", { to: "bfA" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    // A permanent leaves the chain as soon as it is finalized (359.2) — before anything older resolves.
    for (let i = 0; i < 4 && game.zoneOf("rengar") !== "battlefield-bfA" && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("rengar")).toBe("battlefield-bfA");
    expect(game.chain().map((c) => c.cardId)).toEqual(["syren"]); // still pending underneath
    expect(game.locationOf("scout")).toBe("bfA");
  });

  test("then the Syren ability resolves (Scout → base); with the chain empty the combat showdown at bfA begins: P1 (who contested P2's battlefield) attacks, P2 defends", async () => {
    const game = await syrenOnChain();
    await game.p1.play("rengar", { to: "bfA" });
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.locationOf("scout")).toBe("base");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bfA", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("rengar").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle(); // 6 vs 3: Rengar wins and conquers
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("role clarification: playing Rengar onto a battlefield the ENEMY contested (P2 walked into open bfB) makes P1 the DEFENDER of the resulting combat", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 5, power: { body: 1 } })
      .battlefield("bfB", { controller: null })
      .unit(P2, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, RENGAR, "rengar")
      .build();
    await game.p2.move("scout", "bfB");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: false });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "rengar")).toBe(true);
    await game.p1.play("rengar", { to: "bfB" });
    expect(game.zoneOf("rengar")).toBe("battlefield-bfB");
    // Close the non-combat showdown if it is still the open one; the staged combat follows.
    for (let i = 0; i < 6 && showdown(game) !== undefined && showdown(game)?.isCombatShowdown !== true && game.decision()?.kind === "action"; i++) {
      await game.acting().pass();
    }
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfB", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("rengar").combatRole).toBe("defender");
  });
});
