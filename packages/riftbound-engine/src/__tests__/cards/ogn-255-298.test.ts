/**
 * Nine-Tailed Fox — ogn-255-298 · Legend (Ahri) · Calm/Mind
 *
 *   When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a
 *   minimum of 1 [Might].
 *
 * Rules: 383.4.e (Attack Triggers fire when a unit gains the Attacker designation — once per unit per
 * combat, so two attackers = two triggers), 459 (the attacker is whoever applied Contested; a Ganking
 * move between battlefields attacks too), 807.1.c (Assault is part of the attacker's Might), 190.4
 * (control), 317.2.c ("this turn" expires in the Expiration Step).
 *
 * Head-judge checklist — trickiest situations for THIS card:
 *  1. "a battlefield YOU control": my own attacks never trigger it; in a 3-player game an enemy
 *     attacking a THIRD player's battlefield must not trigger my legend (the parsed trigger carries no
 *     battlefield qualifier — probed: it fires anyway → BUG).
 *  2. "to a minimum of 1": a 1-Might attacker stays at 1 (still deals 1); a 1-Might attacker with
 *     [Assault] is a 2-Might attacker (807.1.c) and DOES drop to 1.
 *  3. One trigger per attacking unit: two attackers each get -1; the trigger is P1's chain item even
 *     though it is P2's turn/showdown, and nothing changes until it resolves.
 *  4. "this turn": a surviving attacker keeps the -1 through the rest of the opponent's turn (it
 *     conquers at 3, not 4) and is back to full Might on the next turn.
 *  5. Not an attack: an enemy unit walking onto an EMPTY battlefield, or defending against me, is
 *     never debuffed.
 *  6. Ganking from another battlefield into mine is an attack → trigger.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, P3, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-255-298";

/** P2's turn; P1 (Nine-Tailed Fox) holds bf1 with a `def`-Might defender; P2 has an `atk`-Might unit in base. */
function board(def = 2, atk = 3) {
  return scenario()
    .turn(3)
    .active(P2)
    .legend(P1, CARD, "fox")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: def, name: "Defender" }, "def")
    .unit(P2, "base", { might: atk, name: "Attacker" }, "atk");
}

/** Pass priority (both seats) until the chain is empty, staying inside the showdown. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
  expect(game.chain()).toHaveLength(0);
}

const foxItems = (game: Game) => game.chain().filter((c) => c.cardId === "fox");

describe("Nine-Tailed Fox (ogn-255-298)", () => {
  test("registry payload: one triggered ability — enemy unit attacks → -1 Might this turn (minimum 1) on the trigger source", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Ahri", domain: ["calm", "mind"], name: "Nine-Tailed Fox" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: -1, duration: "turn", minimum: 1, target: { type: "trigger-source" }, type: "modify-might" },
      trigger: { event: "attack", on: { controller: "enemy", type: "unit" } },
      type: "triggered",
    });
  });

  test("enemy 3-Might unit attacks my battlefield: P1's trigger goes on the chain, resolves to -1 → the 2 v 2 combat trades and P2 conquers nothing", async () => {
    const game = await board(2, 3).build();
    await game.p2.move("atk", "bf1");
    expect(foxItems(game)).toEqual([expect.objectContaining({ controller: P1, name: "Nine-Tailed Fox", triggered: true })]);
    expect(game.state("atk").might).toBe(3); // nothing happens before resolution
    await resolveChain(game);
    expect(game.state("atk")).toMatchObject({ combatRole: "attacker", might: 2 });
    expect(game.state("def").might).toBe(2); // my defender is untouched
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("'to a minimum of 1': a 1-Might attacker stays at 1 and still deals its 1 damage", async () => {
    const game = await board(1, 1).build();
    await game.p2.move("atk", "bf1");
    expect(foxItems(game)).toHaveLength(1); // it still triggers
    await resolveChain(game);
    expect(game.state("atk").might).toBe(1);
    await game.settle();
    // 1 v 1: both die — the attacker was not reduced to a harmless 0.
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
  });

  test("two attackers → two separate triggers, each attacker gets its own -1", async () => {
    const game = await board(5, 3).unit(P2, "base", { might: 4, name: "Second" }, "atk2").build();
    await game.p2.move(["atk", "atk2"], "bf1");
    expect(foxItems(game)).toHaveLength(2);
    await resolveChain(game);
    expect(game.state("atk").might).toBe(2);
    expect(game.state("atk2").might).toBe(3);
    await game.settle();
    // 2 + 3 = 5 kills the 5-Might defender; its 5 damage kills… whatever P2 assigns — at least one attacker dies.
    expect(game.zoneOf("def")).toBe("trash");
  });

  test("'this turn': a 4-Might attacker fights (and conquers) at 3, stays 3 for the rest of P2's turn, and is 4 again next turn", async () => {
    const game = await board(2, 4).build();
    await game.p2.move("atk", "bf1");
    await resolveChain(game);
    expect(game.state("atk").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.state("atk").damage).toBe(0); // survived 2 damage at 3 Might; combat damage heals afterwards (466.1.a.1)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.phase()).toBe("main");
    expect(game.state("atk").might).toBe(3); // still this turn
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("atk").might).toBe(4);
  });

  test("negative space: MY unit attacking an enemy battlefield is not an 'enemy unit' — no trigger, no debuff", async () => {
    const game = await scenario()
      .legend(P1, CARD, "fox")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Their Guard" }, "guard")
      .unit(P1, "base", { might: 3, name: "My Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    expect(foxItems(game)).toHaveLength(0);
    expect(game.state("raider").might).toBe(3);
    expect(game.state("guard").might).toBe(2); // an enemy DEFENDER is not attacking anything
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: an enemy unit moving onto an EMPTY battlefield attacks nobody — no trigger, full Might, it simply conquers", async () => {
    const game = await board(2, 3).build();
    await game.p2.move("atk", "bf2");
    expect(foxItems(game)).toHaveLength(0);
    await game.settle();
    await game.settle(); // an auto-begun non-combat showdown is handed back once (344.2)
    expect(game.state("atk").might).toBe(3);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("a Ganking move from another battlefield into mine is an attack too → trigger, -1", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .legend(P1, CARD, "fox")
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Defender" }, "def")
      .unit(P2, "bf2", { keywords: ["Ganking"], might: 3, name: "Ganker" }, "gk")
      .build();
    await game.p2.gank("gk", "bf1");
    expect(foxItems(game)).toHaveLength(1);
    await resolveChain(game);
    expect(game.state("gk")).toMatchObject({ combatRole: "attacker", might: 2 });
  });

  test("[Assault] counts (807.1.c) — a 1-Might attacker with Assault is a 2-Might attacker, so the -1 applies and it fights at 1", async () => {
    // Expected: Might 1 (base) + 1 (Assault while attacking) = 2, then -1 (≥ minimum 1) → 1.
    // Actual: the floor is checked against the non-combat Might (1), so no reduction is applied and it fights at 2.
    const game = await board(5, 3).unit(P2, "base", { keywords: ["Assault"], might: 1, name: "Skirmisher" }, "sk").build();
    await game.p2.move("sk", "bf1");
    expect(foxItems(game)).toHaveLength(1);
    await resolveChain(game);
    expect(game.state("sk").combatRole).toBe("attacker");
    expect(game.state("sk").might).toBe(1);
  });

  test("'a battlefield YOU control' — in a 3-player game an enemy attacking a THIRD player's battlefield must not trigger my legend", async () => {
    // Expected: P2 attacking P3's bf3 puts nothing of P1's on the chain and the attacker keeps 3 Might.
    // Actual: the parsed trigger has no battlefield qualifier, so Nine-Tailed Fox fires for any enemy attack anywhere.
    const game = await scenario({ players: 3 })
      .turn(3)
      .active(P2)
      .legend(P1, CARD, "fox")
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf3", { controller: P3 })
      .unit(P1, "bf1", { might: 2, name: "Mine" }, "def")
      .unit(P3, "bf3", { might: 2, name: "Third's Guard" }, "def3")
      .unit(P2, "base", { might: 3, name: "Attacker" }, "atk")
      .build();
    await game.p2.move("atk", "bf3");
    expect(foxItems(game)).toHaveLength(0);
    await resolveChain(game);
    expect(game.state("atk").might).toBe(3);
  });
});
