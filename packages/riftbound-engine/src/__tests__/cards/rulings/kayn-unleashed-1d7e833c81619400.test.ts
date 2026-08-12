/**
 * Ruling 1d7e833c81619400 — Kayn, Unleashed (OGN-189 → ogn-189-298) · 6 Might · [Ganking]
 *     "If I have moved twice this turn, I don't take damage."
 *   × Ride the Wind (ogn-173-298) · Action · [2][chaos] · "Move a friendly unit and ready it."
 *
 * Q: If I attack the same 9-Might unit twice with Kayn (6 Might), does the damage from the first combat
 *    carry over and kill it in the second?
 * A: No. Damage heals after every combat, even when nothing died. The guard takes 6 in the first combat,
 *    is healed to 0 when that combat ends and takes another 6 in the second — it never reaches 9, and the
 *    defender keeps the battlefield after each winner-less combat.
 *    (Nobody dies at all here only because Kayn, having moved twice, takes no damage.)
 * Rules: 466.6/467 (combat cleanup heals surviving units), 141 (a unit dies only while marked damage ≥ Might;
 *        damage is not a Might reduction), 190.4 (the defender stays in control), 466.5 (surviving attackers
 *        that did not conquer are recalled to base).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn. P1 holds bf1 with a Holder; P2 holds bf2 with a 9-Might Guard. Kayn waits in P1's base with
 * two Ride the Winds and exactly [4][chaos][chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", KAYN, "kayn")
    .unit(P2, "bf2", { might: 9, name: "Guard" }, "guard")
    .hand(P1, RIDE_THE_WIND, "rtw1")
    .hand(P1, RIDE_THE_WIND, "rtw2");
}

/** Ride the Wind `which` sends Kayn to `to` (readying him) and everything that follows settles. */
async function ride(game: Game, which: string, to: string): Promise<void> {
  await game.p1.cast(which, { targets: "kayn" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(`battlefield-${to}`);
  await game.settle();
  expect(game.zoneOf(which)).toBe("trash");
}

/** Kayn walks to P1's own bf1 (move #1), then rides to the Guard (move #2 ⇒ damage-proof) and fights. */
async function firstAttack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("kayn", "bf1");
  await game.settle();
  expect(game.locationOf("kayn")).toBe("bf1");
  await ride(game, "rtw1", "bf2");
  return game;
}

describe("Ruling 1d7e833c81619400 — damage heals after every combat, so two 6-damage attacks never add up to 9", () => {
  test("first combat: Kayn deals 6 to the 9-Might Guard and takes nothing back; nobody dies, the Guard is healed to 0 and P2 keeps bf2 (Kayn is recalled)", async () => {
    const game = await firstAttack();
    expect(game.zoneOf("guard")).toBe("battlefield-bf2");
    expect(game.state("guard")).toMatchObject({ damage: 0, might: 9 }); // healed when combat ended, not left at 6
    expect(game.zoneOf("kayn")).toBe("base");
    expect(game.state("kayn")).toMatchObject({ damage: 0, might: 6 });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("second combat against the SAME Guard, same turn: it takes another 6 from zero and survives again — the first 6 did not carry over", async () => {
    const game = await firstAttack();
    await ride(game, "rtw2", "bf2"); // ready + move in again
    expect(game.zoneOf("guard")).toBe("battlefield-bf2"); // 6 then 6 never made 12
    expect(game.state("guard")).toMatchObject({ damage: 0, might: 9 });
    expect(game.zoneOf("kayn")).toBe("base");
    expect(game.state("kayn").damage).toBe(0);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a single 9-damage hit is what it takes — the Guard dies only when one combat's damage reaches its Might", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 9, name: "Executioner" }, "exec")
      .unit(P2, "bf2", { might: 9, name: "Guard" }, "guard")
      .build();
    await game.p1.move("exec", "bf2");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
  });
});
