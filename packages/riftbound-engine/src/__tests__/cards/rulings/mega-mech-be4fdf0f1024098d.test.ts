/**
 * Ruling be4fdf0f1024098d — Mega-Mech (OGN-088 → ogn-088-298) · Unit · Mind · 7 · 8 Might (vanilla)
 *   × Kayn, Unleashed (OGN-189 → ogn-189-298) · 6 Might · "[Ganking] If I have moved twice this turn, I don't take damage."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] 2+[chaos] "Move a friendly unit and ready it."
 *   (Rumble, Hotheaded sfd-026-221 appears in the scrape only as a Mech reference — not part of the play.)
 *
 * Q: Mega-Mech attacks Kayn's battlefield; during the showdown Kayn Rides the Wind OUT and later back IN. What happens to the
 *    combat and to control of the battlefield?
 * A: Moving in applied Contested status: control cannot change until the showdown ends and Mega-Mech stays the attacker. Kayn
 *    leaves (Focus passes back), then returns — he has now moved twice and takes no damage; at resolution he can't kill the
 *    8-Might Mech with 6, and the Mech can't kill him, so the attackers are recalled and control never changes. Hidden cards
 *    at the battlefield stay throughout (contested control is never lost even while no unit is there).
 * Rules: 190.4.b / 454 (Contested: control frozen during the showdown), 346–347 (Focus passing), 464.2.c.3.a (arriving unit
 *        joins the combat), 465–467 (damage; surviving defenders → attackers recalled), 811 / 107.3.d (hidden card kept).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MEGA_MECH = "ogn-088-298";
const KAYN_UNLEASHED = "ogn-189-298";
const RIDE_THE_WIND = "ogn-173-298";
const HIDDEN_BLADE = "ogn-213-298"; // just "a hidden card" at bf1 — never flipped

/** P1's turn 3. P2 holds bf1 with Kayn + a facedown card; bf2 is empty. P2: Ride the Wind ×2 with [4]+[chaos][chaos]. P1: Mega-Mech ready in base. */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", KAYN_UNLEASHED, "kayn")
    .facedown(P2, "bf1", HIDDEN_BLADE, "hidden")
    .unit(P1, "base", MEGA_MECH, "mech")
    .hand(P2, RIDE_THE_WIND, "rtw1")
    .hand(P2, RIDE_THE_WIND, "rtw2");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2 (holding Focus) Rides the Wind Kayn to `dest`; the chain resolves. */
async function rideKayn(game: Game, spell: "rtw1" | "rtw2", dest: "bf1" | "bf2"): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast(spell, { targets: "kayn" });
  for (let i = 0; i < 8 && game.zoneOf(spell) !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options.find((o) => o.key === `battlefield-${dest}` || o.key === dest)?.key ?? `battlefield-${dest}`);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf(spell)).toBe("trash");
  expect(game.locationOf("kayn")).toBe(dest);
}

/** Mech attacks; P1 passes Focus; Kayn rides out to bf2; P1 passes again; Kayn rides back in. Stops with P1 holding Focus. */
async function outAndBack(game: Game): Promise<void> {
  await game.p1.move("mech", "bf1");
  await game.p1.passFocus();
  await rideKayn(game, "rtw1", "bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // Focus passed back
  await game.p1.passFocus();
  await rideKayn(game, "rtw2", "bf1");
}

describe("Ruling be4fdf0f1024098d — Kayn rides out and back into Mega-Mech's attack: contested control holds, Kayn is immune, attackers recalled", () => {
  test("Mega-Mech moving in applies Contested status: bf1 contested by P1, still CONTROLLED by P2, combat showdown open with the Mech as attacker and Kayn as defender", async () => {
    const game = await board().build();
    await game.p1.move("mech", "bf1");
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("mech").combatRole).toBe("attacker");
    expect(game.state("kayn").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker has Focus first
  });

  test("P1 passes → Kayn (P2, Focus) Rides the Wind OUT to bf2: bf1 has no P2 unit yet stays contested AND controlled by P2, the hidden card stays, the showdown continues — and Focus passes back to P1", async () => {
    const game = await board().build();
    await game.p1.move("mech", "bf1");
    await game.p1.passFocus();
    await rideKayn(game, "rtw1", "bf2");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(bf1(game)).toMatchObject({ contested: true, controller: P2 });
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.state("mech").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("P1 passes again → Kayn Rides the Wind BACK into bf1: he re-joins the ongoing combat as the defender, having now moved twice this turn", async () => {
    const game = await board().build();
    await outAndBack(game);
    expect(game.state("kayn")).toMatchObject({ combatRole: "defender", isReady: true, location: "bf1" });
    expect(game.state("mech")).toMatchObject({ combatRole: "attacker", location: "bf1" });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("combat resolves: Kayn (moved twice) takes NO damage and can't kill the 8-Might Mech with 6 → defenders survive, the attacking Mech is RECALLED to base; bf1 never changed hands, no points, the hidden card is still there", async () => {
    const game = await board().build();
    await outAndBack(game);
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("kayn")).toBe("battlefield-bf1");
    expect(game.state("kayn").damage).toBe(0);
    expect(game.zoneOf("mech")).toBe("base");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if Kayn never moves (everyone passes) he takes the Mech's 8 and dies, the Mech survives his 6 and P1 conquers bf1", async () => {
    const game = await board().build();
    await game.p1.move("mech", "bf1");
    await game.settle();
    expect(game.zoneOf("kayn")).toBe("trash");
    expect(game.zoneOf("mech")).toBe("battlefield-bf1");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("hidden")).toBe("trash"); // control lost → hidden card removed
  });
});
