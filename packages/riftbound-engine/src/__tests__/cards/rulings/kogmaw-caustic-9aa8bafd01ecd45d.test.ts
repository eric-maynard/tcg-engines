/**
 * Ruling 9aa8bafd01ecd45d — Kog'Maw, Caustic (OGN-190 → ogn-190-298) · 1-Might Chaos champion
 *   "[Deathknell] — Deal 4 to all units at my battlefield."
 *
 * Q: Kog'Maw attacks a battlefield defended by a 5-Might unit. After combat damage, does the 5-Might unit die to
 *    Kog'Maw's Deathknell (1 combat + 4)?
 * A: No. Combat damage is dealt (Kog'Maw takes 5 and dies, the defender takes 1); the combat cleanup heals the
 *    surviving defender BEFORE the Deathknell trigger resolves; the Deathknell then deals 4 — 4 total on a 5-Might
 *    unit is not lethal, so it survives.
 * Rules: 465.2 (combat damage dealt simultaneously), 466.1 / 323.4 (cleanup: note deaths, heal survivors, then
 *        finalize death triggers), 466.2 (those items resolve before the combat result), 808.1.d (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";

/** P1's turn. P1's Kog'Maw (1, ready in base) attacks bf1, held by P2's 5-Might Wall. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", KOGMAW, "kog");
}

/** Kog'Maw attacks; both pass Focus; combat damage is dealt. Stops with the Deathknell pending. */
async function kogAttacksAndDies(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("kog", "bf1");
  expect(game.state("kog").combatRole).toBe("attacker");
  expect(game.state("wall").combatRole).toBe("defender");
  await game.p1.passFocus();
  await game.p2.passFocus();
  if (game.decision()?.kind === "distribute") {
    await game.acting().distribute({ wall: 1 });
  }
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  return game;
}

describe("Ruling 9aa8bafd01ecd45d — Kog'Maw attacking into a 5-Might defender: the defender heals before the Deathknell, so it survives", () => {
  test("step 1 — combat damage: Kog'Maw took 5 (lethal) and is in the trash; its Deathknell is on the chain", async () => {
    const game = await kogAttacksAndDies();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P1, triggered: true })]);
  });

  test("step 2 — healing happens first: while the Deathknell is still pending, the Wall's 1 combat damage has ALREADY been cleared (damage 0)", async () => {
    const game = await kogAttacksAndDies();
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog"]);
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("steps 3–4 — the Deathknell resolves for 4 onto the healed Wall: 4 damage on a 5-Might unit is not lethal → the Wall survives, P2 keeps bf1, P1 scores nothing", async () => {
    const game = await kogAttacksAndDies();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(4);
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a 4-Might defender is NOT saved by the heal: healed to 0, then the Deathknell's 4 is exactly lethal → it dies and bf1 is left to nobody", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4, name: "Thin Wall" }, "thin").unit(P1, "base", KOGMAW, "kog").build();
    await game.p1.move("kog", "bf1");
    await game.settle();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("thin")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);
  });
});
