/**
 * Ruling 6f95385f40d1984b — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · Action
 *     "Move a friendly unit and ready it."
 *   × Lee Sin, Ascetic (OGN-078 → ogn-078-298) · 5 Might · "[Shield] (+1 [Might] while I'm a defender.)"
 *
 * Q: The opponent attacks an EMPTY battlefield and I Ride the Wind a [Shield] unit (Lee Sin) in. Does Shield give +1?
 * A: Shield is a passive tied to the DEFENDER designation, not a trigger. Riding Lee Sin into the showdown the
 *    opponent opened makes him a defender there (the opponent applied Contested), so Shield does apply and he
 *    fights at 6. If instead you move him in AFTER the opponent already controls the battlefield, YOU are the
 *    attacker and Shield gives nothing.
 * Rules: 736 (Shield: +1 Might while defender — a passive), 450/464.2.c.3 (the player who applies Contested is the
 *        Attacker; arrivals join the running showdown and are designated), 344.1 (a showdown becomes a combat
 *        showdown when both sides have units), 347 (Action spells are legal with Focus in a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const LEE_SIN = "ogn-078-298"; // 5 Might, [Shield]

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2's turn. bf1 is EMPTY and uncontrolled; P2 has a 4-Might Raider in base; P1 has Lee Sin in base and Ride the Wind + [2][chaos]. */
function emptyBattlefieldBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P1, "base", LEE_SIN, "leesin")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

describe("Ruling 6f95385f40d1984b — riding a [Shield] unit into the showdown the opponent opened makes it a DEFENDER (Shield on)", () => {
  test("premise: P2's move onto the empty bf1 opens a non-combat showdown with P2 as the contester/attacker — nothing is designated yet", async () => {
    const game = await emptyBattlefieldBoard().build();
    await game.p2.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.state("leesin").might).toBe(5); // in base, Shield inert
  });

  test("ruling: P1 Rides Lee Sin in during that showdown — he is designated DEFENDER (P2 applied Contested, so P2 is the attacker) and Shield puts him at 6", async () => {
    const game = await emptyBattlefieldBoard().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "leesin" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("leesin")).toBe("bf1");
    expect(game.state("leesin")).toMatchObject({ combatRole: "defender", isReady: true, keywords: ["Shield"], might: 6 });
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, defendingPlayer: P1, isCombatShowdown: true });
  });

  test("consequence: the fight is Lee Sin 6 (5 + Shield) vs Raider 4 — the Raider dies, Lee Sin is untouched and P1 takes bf1", async () => {
    const game = await emptyBattlefieldBoard().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("rtw", { targets: "leesin" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("leesin")).toBe("battlefield-bf1");
    expect(game.state("leesin").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the 'if instead' case: riding in when the opponent ALREADY controls the battlefield makes P1 the attacker — no Shield, Lee Sin fights at his printed 5", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Raider" }, "raider")
      .unit(P1, "base", LEE_SIN, "leesin")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { targets: "leesin" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("leesin")).toMatchObject({ combatRole: "attacker", might: 5 });
    expect(game.state("raider").combatRole).toBe("defender");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, defendingPlayer: P2 });
  });
});
