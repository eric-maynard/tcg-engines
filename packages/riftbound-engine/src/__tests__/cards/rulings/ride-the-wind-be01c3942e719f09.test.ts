/**
 * Ruling be01c3942e719f09 — Ride the Wind (OGN-173 → ogn-173-298) · Action · 2 + [chaos] · "Move a friendly unit and ready it."
 *   × Zenith Blade (OGN-262 → ogn-262-298) · Action · 3 + [rainbow][rainbow]
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *   (actors: Yasuo, Remorseful ogn-076-298 "When I attack, deal damage equal to my Might to an enemy unit here." and
 *    Leona, Determined ogn-238-298 "[Shield] When I attack, stun an enemy unit here.")
 *
 * Q: In a showdown with Leona, Yasuo Rides the Wind to another battlefield; Leona follows with Zenith Blade. (1) Does
 *    Leona conquer the first battlefield? (2) Does Yasuo's attack trigger fire after Zenith Blade, and is he the attacker?
 * A: (1) Timing: Zenith Blade BEFORE the first showdown ends → no conquer point; AFTER it (during the second, open
 *    showdown) → she conquers the first battlefield first. (2) Yes: Yasuo applied Contested at the new battlefield first,
 *    so once combat begins there he is the attacker (his trigger deals damage even though he is stunned) and Leona is the
 *    defender (Shield applies).
 * Rules: 464.2.c.1 (attacker = who applied Contested), 344 (open showdown → combat), 383.4.e (attack triggers),
 *        423 (stun only stops COMBAT damage), 467 (conquer), 726 (Shield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const ZENITH_BLADE = "ogn-262-298";
const YASUO = "ogn-076-298";
const LEONA = "ogn-238-298";

type SD = { battlefieldId: string; isCombatShowdown?: boolean; attackingPlayer?: string; active?: boolean };
const showdown = (game: Game): SD | undefined => (game.gameState.interaction?.showdownStack as SD[] | undefined)?.find((s) => s.active);

/** Leona's (P2's) turn. P1's Yasuo (6) holds bf1; bf2 is empty/uncontrolled. P1: Ride the Wind + [2][chaos]. P2: Leona (4) in base, Zenith Blade + [3] + 2 rainbow. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", YASUO, "yasuo")
    .unit(P2, "base", LEONA, "leona")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, ZENITH_BLADE, "zb");
}

/** Leona attacks bf1 (her attack trigger stuns Yasuo); P2 passes Focus; Yasuo Rides the Wind to bf2 (readied). Returns with P2 holding Focus in the bf1 showdown. */
async function yasuoRidesAway(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("leona", "bf1");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick") {
      await game.seat(d.seat).pick("yasuo");
    } else if (d?.kind === "action") {
      await game.seat(d.seat).passPriority();
    }
  }
  expect(game.state("yasuo").isStunned).toBe(true); // Leona's "When I attack, stun an enemy unit here"
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: "yasuo" });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("battlefield-bf2");
  }
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("yasuo")).toBe("bf2");
  expect(game.state("yasuo").isReady).toBe(true);
  expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 }); // Yasuo applied Contested at bf2
  expect(showdown(game)).toMatchObject({ battlefieldId: "bf1" }); // the first showdown is still open
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** P2 Zenith Blades: stun Yasuo, move Leona to his battlefield (bf2). Stops once the spell has resolved. */
async function zenithBladeFollow(game: Game): Promise<void> {
  expect(game.p2.can("cast", "zb")).toBe(true);
  await game.p2.cast("zb", { targets: ["yasuo", "leona"] });
  for (let i = 0; i < 8 && game.zoneOf("zb") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("battlefield-bf2");
    } else if (d?.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("battlefield-bf2");
  }
  expect(game.zoneOf("zb")).toBe("trash");
  expect(game.locationOf("leona")).toBe("bf2");
}

/** Pass Focus/priority until Yasuo's attack trigger is on the chain at the bf2 combat (or an object pick for it is asked). */
async function untilYasuoAttacks(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (game.chain().some((c) => c.cardId === "yasuo") || d?.kind === "pick") {
      return;
    }
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.seat(d.seat).pass();
    } else {
      return;
    }
  }
}

describe("Ruling be01c3942e719f09 — Yasuo Rides away, Leona Zenith-Blades after him", () => {
  test("(1, late) Leona waits: everyone passes, the bf1 showdown ends with Leona the only unit there → she CONQUERS bf1 (P2 scores 1); then an OPEN (non-combat) showdown begins at bf2 where Yasuo is, with P1 as the attacker-to-be", async () => {
    const game = await yasuoRidesAway();
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf2" });
    expect(showdown(game)?.isCombatShowdown ?? false).toBe(false);
  });

  test("(2) Leona Zenith-Blades in during that open showdown: combat begins at bf2 with YASUO as the attacker (he contested first) and Leona the defender with Shield (4 → 5); Yasuo's attack trigger goes on the chain even though he is stunned", async () => {
    const game = await yasuoRidesAway();
    await game.p2.passFocus();
    await game.p1.passFocus();
    for (let i = 0; i < 3 && game.actingSeat() !== P2; i++) {
      await game.acting().pass();
    }
    await zenithBladeFollow(game);
    await untilYasuoAttacks(game);
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf2", isCombatShowdown: true });
    expect(game.state("yasuo")).toMatchObject({ combatRole: "attacker", isStunned: true });
    expect(game.state("leona")).toMatchObject({ combatRole: "defender", might: 5 });
    expect(game.chain().some((c) => c.cardId === "yasuo" && c.triggered) || game.decision()?.kind === "pick").toBe(true);
    // The trigger deals damage equal to his Might (6) — stun only stops combat damage — so the 5-Might Leona dies.
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("leona");
    }
    await game.settle();
    await game.settle();
    expect(game.zoneOf("leona")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf2");
    expect(game.p2.points()).toBe(1); // just the bf1 conquer
    expect(game.violations()).toEqual([]);
  });

  test("(1, early) Leona Zenith-Blades BEFORE the first showdown ends: she leaves bf1 at once, so when that showdown closes nobody of hers is there — NO conquer point for P2, bf1 is not hers", async () => {
    const game = await yasuoRidesAway();
    await zenithBladeFollow(game);
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1" }); // still the first showdown
    expect(game.p2.points()).toBe(0);
    await untilYasuoAttacks(game);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.p2.points()).toBe(0);
    // …and the same combat follows at bf2: Yasuo attacks, Leona (5 with Shield) defends.
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf2", isCombatShowdown: true });
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("leona")).toMatchObject({ combatRole: "defender", might: 5 });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("leona");
    }
    await game.settle();
    await game.settle();
    expect(game.zoneOf("leona")).toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
