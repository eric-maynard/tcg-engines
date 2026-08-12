/**
 * Ruling bdd79d918c96f22c — Ride the Wind (OGN-173 → ogn-173-298) · Action [2][chaos]
 *   "Move a friendly unit and ready it."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: I control a battlefield, my opponent attacks into it, and I then Ride the Wind Yasuo in. Is Yasuo
 *    attacking (and so "shooting"), or not?
 * A: Yasuo is DEFENDING, so he does not shoot. The first player to move a unit in and make the battlefield
 *    Contested is the attacker; a unit arriving afterwards on the other side joins as a defender.
 * Rules: 190.3.a/450 (the player who applies Contested is the attacker), 464.2.c.3.a (a unit arriving at an
 *        ongoing combat takes the role of its side), 383 ("when I attack" needs the attacker designation).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const YASUO_REMORSEFUL = "ogn-076-298";

/** P2's turn: P1 durably holds bf1 with a Warden; P2's Raider attacks. P1 has Yasuo in base + RTW and [2][chaos]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2 attacks bf1, hands Focus over, and P1 rides Yasuo in; the chain is then drained. */
async function rideYasuoIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("warden").combatRole).toBe("defender");
  await game.p2.passFocus();
  await game.p1.cast("rtw", { answers: ["bf1"], targets: "yasuo" });
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
  return game;
}

describe("Ruling bdd79d918c96f22c — a unit ridden into a battlefield the opponent already attacked is a DEFENDER", () => {
  test("setup: P2 moved first and applied Contested, so P2 is the attacker at P1's own battlefield", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("ruling: Yasuo arrives at bf1 with the DEFENDER designation, not the attacker one", async () => {
    const game = await rideYasuoIn();
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.state("yasuo").combatRole).toBe("defender");
  });

  test("ruling: because he is not attacking, his 'When I attack' ability never triggers — he does not shoot", async () => {
    const game = await rideYasuoIn();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").damage).toBe(0);
  });

  test("ruling: Ride the Wind still readies him — he is a full defender in the damage step", async () => {
    const game = await rideYasuoIn();
    expect(game.state("yasuo").isReady).toBe(true);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 3 + 6 defending Might vs a 4-Might attacker
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same Yasuo ridden into an ENEMY-held battlefield does attack, and does shoot", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { answers: ["bf2"], targets: "yasuo" });
    for (let i = 0; i < 8 && (game.chain().length > 0 || game.state("yasuo").combatRole !== "attacker"); i++) {
      await game.acting().pass();
    }
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("wall").damage).toBe(6);
  });
});
