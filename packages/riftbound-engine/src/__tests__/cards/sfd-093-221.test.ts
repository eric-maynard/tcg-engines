/**
 * Dauntless Vanguard — sfd-093-221 · Unit · Body · 4 energy + [body] · 4 might
 *
 *   You may play me to an occupied enemy battlefield.
 *
 * Head-judge notes (trickiest situations for this card):
 *  - "occupied enemy battlefield" needs BOTH: an opponent controls it AND a unit is present there
 *    (170.11.a). An empty enemy-controlled battlefield, or an uncontrolled battlefield that merely
 *    holds enemy units, is not a legal destination. A facedown (hidden) card is not a unit.
 *  - "may": the default locations (base / a battlefield you control, 355.2.a) stay available.
 *  - Arriving there applies Contested (190.3.a.1) → a combat opens with the Vanguard's controller
 *    as attacker (464.2.c.1). It enters exhausted but exhausted units still deal combat damage
 *    (only stunned units don't, 423.1.b). Win → conquer (+1 point, 466.5.d); lose → nothing changes.
 *  - It is still a unit play at standard timing: not on the opponent's turn, not inside a showdown.
 *  - Cost: 4 energy AND one body power; short on either → not legal.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-093-221";

function board(foeMight = 3) {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1 } })
    .battlefield("enemyOcc", { controller: P2 })
    .battlefield("enemyEmpty", { controller: P2 })
    .battlefield("mine", { controller: P1 })
    .battlefield("neutralOcc", { controller: null })
    .unit(P2, "enemyOcc", { might: foeMight, name: "Foe" }, "foe")
    .unit(P2, "neutralOcc", { might: 1, name: "Squatter" }, "squatter")
    .hand(P1, CARD, "dv");
}

function destinations(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): unknown[] {
  return [...(game.p1.option("play", "dv")?.fields.find((f) => f.arg === "to")?.options ?? [])];
}

describe("Dauntless Vanguard (sfd-093-221)", () => {
  test("parsed abilities: a single static play-location permission for 'an occupied enemy battlefield'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, might: 4, powerCost: ["body"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { allowedLocation: "an occupied enemy battlefield", type: "play-restriction" },
      type: "static",
    });
  });

  test("cost: 4 energy + 1 body; lands in base exhausted as a 4-might unit; short on energy or power → not legal", async () => {
    const game = await board().build();
    await game.p1.play("dv", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("dv")).toBe("base");
    expect(game.state("dv").might).toBe(4);
    expect(game.state("dv").isExhausted).toBe(true);
    const noPower = await board().resources(P1, { energy: 4, power: { body: 0 } }).build();
    expect(noPower.p1.can("play", "dv")).toBe(false);
    const noEnergy = await board().resources(P1, { energy: 3, power: { body: 1 } }).build();
    expect(noEnergy.p1.can("play", "dv")).toBe(false);
  });

  test("legal destinations: base, my battlefield, and the OCCUPIED enemy battlefield — not the empty enemy one, not the neutral occupied one", async () => {
    const game = await board().build();
    const dests = destinations(game);
    expect(dests).toEqual(expect.arrayContaining(["base", "battlefield-mine", "battlefield-enemyOcc"]));
    expect(dests).not.toContain("battlefield-enemyEmpty");
    expect(dests).not.toContain("battlefield-neutralOcc");
    expect(dests).toHaveLength(3);
    const r = await game.p1.try((p) => p.play("dv", { to: "enemyEmpty" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("dv")).toBe("hand");
  });

  test("a facedown card alone does not make an enemy battlefield 'occupied' (170.11.a: a unit must be present)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 1 } })
      .battlefield("enemyHidden", { controller: P2 })
      .facedown(P2, "enemyHidden", { cardType: "spell", energyCost: 1, name: "Trap" }, "trap")
      .hand(P1, CARD, "dv")
      .build();
    const dests = [...(game.p1.option("play", "dv")?.fields.find((f) => f.arg === "to")?.options ?? [])];
    expect(dests).not.toContain("battlefield-enemyHidden");
  });

  test("played to the occupied enemy battlefield: arrives there, contests it and wins the combat (4 vs 3) → conquer, +1 point", async () => {
    const game = await board(3).build();
    expect(game.p1.points()).toBe(0);
    await game.p1.play("dv", { to: "enemyOcc" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("dv")).toBe("battlefield-enemyOcc");
    expect(game.state("dv").damage).toBe(0); // healed in the combat cleanup (466.1.a.1)
    expect(game.gameState.battlefields.enemyOcc?.controller).toBe(P1);
    expect(game.gameState.battlefields.enemyOcc?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("P1 applied Contested by playing the Vanguard there, so P1 gains Focus as the showdown begins (345); Vanguard = attacker, Foe = defender (464.2.c.1)", async () => {
    const game = await board(3).build();
    await game.p1.play("dv", { to: "enemyOcc" });
    // Drain the play itself but stop at the showdown: P1 (who applied Contested) must be the one with Focus.
    for (let i = 0; i < 10 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().pass();
    }
    const d = game.decision() as { kind: string; context?: string; seat: string };
    expect(d).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.enemyOcc?.contested).toBe(true);
    expect(game.gameState.battlefields.enemyOcc?.contestedBy).toBe(P1);
    expect(game.state("dv").combatRole).toBe("attacker");
    expect(game.state("foe").combatRole).toBe("defender");
  });

  test("losing the combat (4 vs 5): the Vanguard dies, the defender keeps the battlefield, nobody scores", async () => {
    const game = await board(5).build();
    await game.p1.play("dv", { to: "enemyOcc" });
    await game.settle();
    expect(game.zoneOf("dv")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-enemyOcc");
    expect(game.state("foe").damage).toBe(0);
    expect(game.gameState.battlefields.enemyOcc?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("'may': playing to my own battlefield or base starts no combat and scores nothing", async () => {
    const game = await board().build();
    await game.p1.play("dv", { to: "mine" });
    await game.settle();
    expect(game.zoneOf("dv")).toBe("battlefield-mine");
    expect(game.gameState.battlefields.mine?.contested).toBe(false);
    expect(game.zoneOf("foe")).toBe("battlefield-enemyOcc");
    expect(game.p1.points()).toBe(0);
  });

  test("timing: not playable on the opponent's turn, nor by its controller inside a showdown (no [Action]/[Reaction])", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("play", "dv")).toBe(false);
    // P1 opens a showdown at the empty enemy battlefield with another unit; with Focus, the Vanguard is still not playable.
    const game = await board().unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "enemyEmpty");
    const d = game.decision() as { kind: string; context?: string; seat: string };
    expect(d).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "dv")).toBe(false);
  });

  test("the permission is re-evaluated live: once the enemy unit leaves, that battlefield is no longer offered", async () => {
    const game = await board()
      .resources(P1, { energy: 8, power: { body: 1, fury: 1 } })
      .hand(P1, { abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Zap", timing: "action" }, "zap")
      .build();
    expect(destinations(game)).toContain("battlefield-enemyOcc");
    await game.p1.cast("zap", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    // 323.6: with no units left P2 loses control in the cleanup — neither "occupied" nor "enemy" any more.
    expect(game.gameState.battlefields.enemyOcc?.controller).toBeNull();
    expect(destinations(game)).not.toContain("battlefield-enemyOcc");
    expect(destinations(game)).toContain("base");
  });
});
