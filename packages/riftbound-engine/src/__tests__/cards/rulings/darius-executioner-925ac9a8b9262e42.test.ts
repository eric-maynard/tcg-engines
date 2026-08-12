/**
 * Ruling 925ac9a8b9262e42 — the buff source dying in the SAME combat cleanup as the unit it was buffing.
 *   Cards: Darius, Executioner (OGN-243 → ogn-243-298) · 6 [Might] "Other friendly units have +1 [Might] here."
 *   × an inline 2-Might unit standing next to him, and an inline [Action] "Kill an enemy unit" for the contrast.
 *
 * Q: A unit survives its combat damage only because another unit is buffing its Might. That other unit
 *    dies in the combat cleanup — does the damaged unit die too?
 * A: No. Combat Cleanup checks lethal damage for everyone at once (step 2) and then heals ALL damage
 *    (step 2a). By the time the lost buff could matter, the damage is already gone. Riftbound has no
 *    continuously-checked state checks. If the buffer dies to something else BEFORE the damage step
 *    (a spell), the unit really is smaller when the damage lands, and it dies.
 * Rules: 466.1 / 466.1.a.1 (Combat Cleanup: simultaneous lethal check, then "3c. Heal all Units"),
 *    142.4 (lethal = damage ≥ Might), 323.4-5 (cleanups run to completion before another begins),
 *    465.2.c.3 (the attacker assigns combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS_EXECUTIONER = "ogn-243-298";

const ACTION_KILL: InlineCardDef = {
  abilities: [{ effect: { target: { controller: "enemy", type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Execute",
  rulesText: "[Action] Kill an enemy unit.",
  timing: "action",
};

/** P2's turn. P1 holds bf1 with Darius (6) and a 2-Might unit he lifts to 3. P2 attacks with `raider`. */
function board(raiderMight: number) {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DARIUS_EXECUTIONER, "darius")
    .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "base", { might: raiderMight, name: "Raider" }, "raider")
    .hand(P2, ACTION_KILL, "execute");
}

/** P2 attacks and both sides pass Focus, stopping at P2's damage assignment. */
async function toAssignment(raiderMight: number): Promise<Game> {
  const game = await board(raiderMight).build();
  expect(game.state("squire").might).toBe(3); // 2 + Darius's static
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  return game;
}

describe("Ruling 925ac9a8b9262e42 — healing beats the lost buff, so the damaged unit lives", () => {
  test("Darius lifts the Squire from 2 to 3 while he stands there", async () => {
    const game = await board(8).build();
    expect(game.state("darius").might).toBe(6);
    expect(game.state("squire")).toMatchObject({ baseMight: 2, might: 3 });
  });

  test("8 damage assigned 6 to Darius (lethal) and 2 to the Squire (not lethal at 3): Darius dies, the Squire lives", async () => {
    const game = await toAssignment(8);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
    await game.p2.distribute({ darius: 6, squire: 2 });
    await game.settle();
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
  });

  test("and the Squire ends the combat HEALED and back at its printed 2 Might — the 2 damage never becomes lethal", async () => {
    const game = await toAssignment(8);
    await game.p2.distribute({ darius: 6, squire: 2 });
    await game.settle();
    expect(game.state("squire")).toMatchObject({ damage: 0, might: 2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("contrast — kill Darius with a SPELL before the damage step and the Squire's 2 damage IS lethal", async () => {
    const game = await board(2).build();
    await game.p2.move("raider", "bf1");
    await game.p2.cast("execute", { targets: "darius" });
    await game.settle();
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.state("squire")).toMatchObject({ might: 2 }); // the buff is gone BEFORE damage
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
  });

  test("the same 2 damage with Darius alive is harmless — the difference really is the buff", async () => {
    const game = await toAssignment(2);
    const d = game.decision();
    if (d?.kind === "distribute") {
      await game.p2.distribute({ darius: 0, squire: 2 });
    }
    await game.settle();
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.state("squire").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
