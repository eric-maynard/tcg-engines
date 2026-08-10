/**
 * Ruling 782bc2f1d7725015 — Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos] "Move a friendly unit and ready it."
 *   × Cleave (OGN-004 → ogn-004-298) / [Assault] ("+X [Might] while I'm an attacker").
 *
 * Q: My opponent moves 2 units onto a battlefield I control (no units of mine there) and a showdown starts. I Ride the Wind
 *    my Darius onto that battlefield. Am I the attacker (for Ahri's static / Cleave / Assault)?
 * A: No. The opponent applied Contested, so they remain the attacker. Their open (non-combat) showdown finishes first;
 *    then, since both players have units there, a COMBAT showdown begins with the opponent attacking and me defending.
 * Rules: 450 / 464.2.c (the player who applied contested is the Attacker), 344 / 348 (non-combat showdown → then combat).
 *
 * "Darius" is stood in for by Laurent Duelist (3, [Assault 2]) so the Assault consequence is directly observable.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const LAURENT_DUELIST = "sfd-156-221"; // 3 Might · [Assault 2]

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf = (game: Game) => game.gameState.battlefields.bf1;

/** P2's turn. P1 controls bf1 but has no unit there; P1's Duelist (3, Assault 2) waits in base with Ride the Wind + [2][chaos].
 * P2 has two Raiders in base: one vanilla 2, one Laurent Duelist (3, Assault 2). */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", LAURENT_DUELIST, "darius")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .unit(P2, "base", LAURENT_DUELIST, "duelist2")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2 moves both units onto P1's empty bf1 → a NON-combat showdown opens with P2 as the attacker; P2 passes Focus to P1. */
async function p2ContestsEmptyBf1(): Promise<Game> {
  const game = await board().build();
  await game.p2.move(["raider", "duelist2"], "bf1");
  // rule 323.6 / 190.4.c — P1's unit-less (seeded) control of bf1 lapses in the Cleanup after the move, before the showdown
  // begins (it is only staged then); the non-combat showdown runs at an uncontrolled bf1 contested by P2 (still the attacker).
  expect(bf(game)).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 Rides the Wind: Darius → bf1 (answers the destination whenever asked); resolves. */
async function rideDariusIn(game: Game): Promise<void> {
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "darius" });
  for (let i = 0; i < 6 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toContain("battlefield-bf1");
      await game.p1.pick("battlefield-bf1");
    } else if (d?.kind === "action") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "battlefield-bf1")) {
    await game.p1.pick("battlefield-bf1");
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("darius")).toBe("bf1");
  expect(game.state("darius").isReady).toBe(true);
}

describe("Ruling 782bc2f1d7725015 — Riding the Wind into the opponent's showdown does not make you the attacker", () => {
  test("P2 moving 2 units onto P1's empty bf1 opens a non-combat showdown in which P2 (who applied Contested) is the attacker; P1 may cast Ride the Wind there with Focus", async () => {
    const game = await p2ContestsEmptyBf1();
    expect(game.p1.can("cast", "rtw")).toBe(true);
  });

  test("after Ride the Wind resolves Darius is at bf1, but the OPEN showdown is still P2's non-combat one — it must finish first; Darius is not an attacker", async () => {
    const game = await p2ContestsEmptyBf1();
    await rideDariusIn(game);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1" });
    expect(game.state("darius").combatRole).not.toBe("attacker");
    expect(bf(game)?.contestedBy).toBe(P2);
  });

  test("when that showdown ends with both sides present, a COMBAT showdown begins at bf1: P2 is the attacker (its units 'attacker', Assault live: 3→5), P1's Darius is the DEFENDER (Assault off: stays 3)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", LAURENT_DUELIST, "darius")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .unit(P2, "base", LAURENT_DUELIST, "duelist2")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .autoProcedures(false)
      .build();
    await game.p2.move(["raider", "duelist2"], "bf1");
    await game.p2.passFocus();
    await rideDariusIn(game);
    // Close the non-combat showdown: pass Focus around until a combat showdown is the active one.
    for (let i = 0; i < 10; i++) {
      const sd = showdown(game);
      if (sd?.active && sd.isCombatShowdown) {
        break;
      }
      const d = game.decision();
      if (d?.kind !== "action" || d.context === "main") {
        break;
      }
      const opt = d.options.find((o) => o.verb === "endShowdown" || o.verb === "startShowdown");
      await (opt ? game.seat(d.seat).choose(opt.key) : game.seat(d.seat).pass());
    }
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("duelist2").combatRole).toBe("attacker");
    expect(game.state("duelist2").might).toBe(5); // the real attacker's Assault 2 is on
    expect(game.state("darius").combatRole).toBe("defender");
    expect(game.state("darius").might).toBe(3); // NOT an attacker → no Assault
    // The attacker (P2) holds Focus first in the combat showdown.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("end to end with everyone passing: combat resolves with P2 attacking (2 + 5 = 7) into the defending 3-Might Darius → Darius dies, P2 conquers bf1", async () => {
    const game = await p2ContestsEmptyBf1();
    await rideDariusIn(game);
    for (let i = 0; i < 3; i++) {
      const r = await game.settle();
      if (r.reason !== "open" || !showdown(game)?.active) {
        break;
      }
    }
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("darius")).toBe("trash");
    expect(bf(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
