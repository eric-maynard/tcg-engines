/**
 * Ruling b37db0c89818980f — Stormbringer (OGN-250 → ogn-250-298) × Kog'Maw, Caustic (OGN-190 → ogn-190-298)
 *   Stormbringer: "Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a
 *   battlefield, then move your unit there."
 *   Kog'Maw (1 Might): "[Deathknell] — Deal 4 to all units at my battlefield."
 *   (× Falling Star, OGN-029 — cited only as the contrast: Stormbringer is NOT split into separate effects.)
 *
 * Q: Stormbringer moves my unit to Kog'Maw's battlefield and kills Kog'Maw — does the moved unit take the Deathknell 4?
 * A: Yes. Stormbringer resolves completely (damage, then the move); Kog'Maw's Deathknell goes pending and is put on the
 *    chain only after Stormbringer's chain completes; when it resolves it hits the unit that was moved there.
 * Rules: 734.1.d.2 / 383.2.c (Deathknell pending until the causing chain completes), 359.3 (a spell resolves in full).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STORMBRINGER = "ogn-250-298"; // 6 + [rainbow][rainbow]
const KOGMAW = "ogn-190-298";

function board(moverMight: number) {
  return scenario()
    .resources(P1, { energy: 6, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P1, "base", { might: moverMight, name: "Mover" }, "mover")
    .hand(P1, STORMBRINGER, "storm");
}

describe("Ruling b37db0c89818980f — the unit Stormbringer moves in eats Kog'Maw's Deathknell", () => {
  test("Stormbringer resolves completely first: Kog'Maw is dead, the Mover is already AT bf1 (undamaged), and Kog'Maw's Deathknell now sits alone on a fresh chain", async () => {
    const game = await board(5).build();
    await game.p1.cast("storm", { targets: ["mover", "bf1"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["storm"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.locationOf("mover")).toBe("bf1");
    expect(game.state("mover").damage).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
    // it is a real chain item: both players get priority to react before it resolves
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("the Deathknell then resolves and deals 4 to the Mover now at Kog'Maw's battlefield (5-Might Mover survives with 4 damage and goes on to take bf1)", async () => {
    const game = await board(5).build();
    await game.p1.cast("storm", { targets: ["mover", "bf1"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    // resolve Kog'Maw's trigger
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("mover")).toBe("bf1");
    expect(game.state("mover").damage).toBe(4);
    await game.settle(); // hands back the auto-begun showdown at bf1 once
    await game.settle(); // both pass focus → Mover conquers
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("a 3-Might Mover (enough to kill 1-Might Kog'Maw) is itself killed by the Deathknell 4 — nobody ends up holding bf1", async () => {
    const game = await board(3).build();
    await game.p1.cast("storm", { targets: ["mover", "bf1"] });
    await game.settle();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("mover")).toBe("trash");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
