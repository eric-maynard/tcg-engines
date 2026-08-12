/**
 * Ruling 2e66f53b69e79b4c — (general [Stun] timing; no specific card)
 *   Stand-in: Rune Prison (OGN-050 → ogn-050-298) · [Action] · Calm · 2+[calm] — "Stun a unit.
 *   (It doesn't deal combat damage this turn.)"
 *
 * Q: The opponent attacks me, I stun the attacker, the units recall. The opponent readies the unit and
 *    attacks the same battlefield again — does it deal combat damage?
 * A: Only if it is no longer Stunned when the Combat Damage Step happens. A stunned unit contributes no
 *    might to combat damage; readying is not un-stunning; the status is only shed in the Expiration Step
 *    of that turn's Ending Phase. So the re-attack in the SAME turn still deals 0; on a LATER turn it
 *    deals its full might.
 * Rules: 423.1.b (a stunned unit deals no combat damage), 317.2 (Expiration Step clears the status at the
 *        end of that turn), 466.1.a.1-2 (combat cleanup heals, then recalls attackers when defenders remain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUNE_PRISON = "ogn-050-298";
const WALLOP = "ogn-146-298"; // [Action] [2] "Ready a unit." — the opponent's "readies the unit"

/** P2's turn. P1 holds bf1 with a lone Warden (3). P2's Raider (5) waits in base. P1 has Rune Prison + [2][calm]; P2 holds Wallop + [2]. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, RUNE_PRISON, "prison")
    .hand(P2, WALLOP, "wallop")
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: 2 });
}

/** P2 attacks bf1; P1 stuns the attacker in the showdown and combat resolves. */
async function stunnedAttackResolved(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  await game.p1.cast("prison", { targets: "raider" });
  await game.settle();
  expect(game.zoneOf("prison")).toBe("trash");
  return game;
}

describe("Ruling 2e66f53b69e79b4c — a stunned attacker deals no combat damage until the stun expires at the end of that turn", () => {
  test("the stunned 5-Might attacker contributes 0: the 3-Might Warden survives undamaged, the Raider takes the Warden's 3 and is recalled (healed) to base — nobody conquers", async () => {
    const game = await stunnedAttackResolved();
    expect(game.state("raider").isStunned).toBe(true);
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.state("warden").damage).toBe(0); // the stunned unit assigned nothing
    expect(game.locationOf("raider")).toBe("base"); // 466.1.a.2 recall — defenders remained
    expect(game.state("raider").damage).toBe(0); // healed in the same Combat Cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("readying is not un-stunning: Wallop readies the recalled (exhausted) Raider but leaves it Stunned, and attacking bf1 again in the same turn still deals 0 damage", async () => {
    const game = await stunnedAttackResolved();
    expect(game.state("raider")).toMatchObject({ isExhausted: true, isStunned: true });
    await game.p2.cast("wallop", { targets: "raider" });
    await game.settle();
    expect(game.state("raider")).toMatchObject({ isReady: true, isStunned: true }); // ready ≠ un-stunned
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.state("raider").isStunned).toBe(true);
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.state("warden").damage).toBe(0);
    expect(game.locationOf("raider")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("the status is shed in that turn's Ending Phase (317.2) — on P2's NEXT turn the same Raider attacks the same battlefield and deals its full 5, killing the Warden and conquering for a point", async () => {
    const game = await stunnedAttackResolved();
    await game.advanceTurn(); // P2 ends: the stun expires
    expect(game.state("raider").isStunned).toBe(false);
    await game.advanceToTurnOf(P2);
    expect(game.state("raider").isStunned).toBe(false);
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash"); // 5 damage ≥ 3 Might
    expect(game.locationOf("raider")).toBe("bf1"); // no defenders remain: no recall
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
