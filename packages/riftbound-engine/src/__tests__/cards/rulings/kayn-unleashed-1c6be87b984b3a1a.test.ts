/**
 * Ruling 1c6be87b984b3a1a — Kayn, Unleashed (OGN-189 → ogn-189-298, 6 Might)
 *   "[Ganking] If I have moved twice this turn, I don't take damage."
 *   × Ride the Wind (OGN-173 → ogn-173-298, Action, 2 + [chaos]) "Move a friendly unit and ready it."
 *
 * Q: I move onto an OPEN battlefield; the enemy answers by moving Kayn twice (… then Ride the Wind) into it. Kayn
 *    can't be damaged and can't kill my unit — do both go home, or does the enemy stay?
 * A: I applied Contested first, so I am the ATTACKER and the reactive arrival is the DEFENDER. When both sides
 *    still have units after combat damage, the attackers are recalled; the defender stays and conquers.
 * Rules: 450 / 464.2.c–d (contester = attacker, later arrival = defender), 465 (combat damage), 466.1.a.2 (recall
 *        attackers if defenders remain), 466.5 (remaining player establishes control → conquer), 465.2.c.10 (Kayn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn. bf1 open (empty, uncontrolled); P2 controls empty bf2. P1: 8-Might Scout in base (survives Kayn's 6,
 * would kill a damageable Kayn). P2: Kayn in base, two Ride the Winds, exactly 2×(2 + [chaos]).
 */
function board() {
  return scenario()
    .resources(P2, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 8, name: "Scout" }, "scout")
    .unit(P2, "base", KAYN, "kayn")
    .hand(P2, RIDE_THE_WIND, "rtw1")
    .hand(P2, RIDE_THE_WIND, "rtw2");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2 (with Focus) Ride-the-Winds Kayn to `dest`; both pass so it resolves. */
async function rideKayn(game: Game, spell: string, dest: string): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", spell)).toBe(true);
  await game.p2.cast(spell, { targets: "kayn" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain(`battlefield-${dest}`);
  await game.p2.pick(`battlefield-${dest}`);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf(spell)).toBe("trash");
  expect(game.locationOf("kayn")).toBe(dest);
}

/** Scout contests open bf1; P1 passes Focus; P2 moves Kayn base→bf2, then (Focus back) bf2→bf1 (Ganking): two moves. */
async function contestThenKaynArrivesTwiceMoved(game: Game): Promise<void> {
  await game.p1.move("scout", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
  await game.p1.passFocus();
  await rideKayn(game, "rtw1", "bf2");
  // Focus came round again: P1 passes, P2 rides Kayn from bf2 into the contested bf1.
  if (game.decision()?.seat === P1) {
    await game.p1.passFocus();
  }
  await rideKayn(game, "rtw2", "bf1");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
}

describe("Ruling 1c6be87b984b3a1a — the first contester attacks; the reactive arrival defends, stays and conquers", () => {
  test("roles: P1 applied Contested first → once Kayn arrives a COMBAT is on at bf1 with P1/Scout ATTACKING and P2/Kayn DEFENDING; nobody controls bf1 yet", async () => {
    const game = await board().build();
    await contestThenKaynArrivesTwiceMoved(game);
    for (let i = 0; i < 6 && showdown(game)?.isCombatShowdown !== true; i++) {
      const d = game.decision();
      expect(d?.kind).toBe("action");
      await game.seat(d!.seat).pass();
    }
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("kayn").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  test("combat: twice-moved Kayn takes no damage and its 6 can't kill the 8-Might Scout → both remain → the ATTACKER (Scout) is recalled to base; the DEFENDER (Kayn) stays and P2 conquers bf1 for 1 point", async () => {
    const game = await board().build();
    await contestThenKaynArrivesTwiceMoved(game);
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.chain()).toEqual([]);
    // Attacker went home (a recall — stays exhausted from its move, healed).
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    // Defender stayed, unhurt, and conquered.
    expect(game.zoneOf("kayn")).toBe("battlefield-bf1");
    expect(game.state("kayn").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
