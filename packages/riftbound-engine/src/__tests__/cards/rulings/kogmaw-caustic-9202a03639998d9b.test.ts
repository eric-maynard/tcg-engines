/**
 * Ruling 9202a03639998d9b — Kog'Maw, Caustic (OGN-190 → ogn-190-298) · Champion Unit · Chaos · [3][chaos] · 1 Might
 *   "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Hextech Ray (ogn-009-298, [Action] [1][fury]) "Deal 3 to a unit at a battlefield." — the spell that kills it mid-showdown
 *
 * Q: If Kog'Maw dies to a spell during a showdown, does Deathknell trigger immediately?
 * A: Yes — it goes on the chain right when Kog'Maw dies (mid-showdown, before any combat damage), and resolves there.
 * Rules: 808 (Deathknell = "When I die" trigger), 383 (triggered abilities are added to the chain when their event
 *        happens), 346–347 (showdown continues afterwards).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P2 holds bf1 with Kog'Maw (1) and a 6-Might Wall. P1: Scout (2) in base, Hextech Ray + [1][fury]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, HEXTECH_RAY, "ray");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Scout attacks bf1; P1 (Focus) Rays Kog'Maw; both pass → the Ray resolves and Kog'Maw dies — mid-showdown. */
async function kogDiesToRayInShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("ray", { targets: "kog" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Ray resolves: 3 ≥ 1 → Kog'Maw dies
  return game;
}

describe("Ruling 9202a03639998d9b — Kog'Maw killed by a spell during a showdown: Deathknell triggers immediately", () => {
  test("the moment the Ray resolves Kog'Maw is in the trash and its Deathknell is ALREADY on the chain — the showdown is still open and no combat damage has been dealt", async () => {
    const game = await kogDiesToRayInShowdown();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.state("wall").damage).toBe(0);
    expect(game.state("scout").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // a priority round on the trigger, right now
  });

  test("it resolves right there in the showdown: 4 to ALL units at bf1 — the attacking Scout (2) dies, the Wall (6) carries 4 — before any combat damage step", async () => {
    const game = await kogDiesToRayInShowdown();
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.state("wall")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
  });

  test("aftermath: with no attacker left the combat ends without a fight; P2 keeps bf1 and the Wall is healed at the end of combat", async () => {
    const game = await kogDiesToRayInShowdown();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
