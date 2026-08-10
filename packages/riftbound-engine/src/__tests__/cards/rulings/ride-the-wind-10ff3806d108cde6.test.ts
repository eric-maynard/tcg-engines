/**
 * Ruling 10ff3806d108cde6 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2+[chaos] · Action
 *   "Move a friendly unit and ready it."
 *   × Stalwart Poro (ogn-052-298) · 2 Might · "[Shield] (+1 [Might] while I'm a defender.)"
 *
 * Q: During an open NON-COMBAT showdown (opponent moved onto an empty battlefield), I Ride the Wind my Shield unit
 *    onto that battlefield. Does it arrive with Shield active?
 * A: It arrives during the non-combat showdown; Shield only turns on once a COMBAT exists there and the unit has the
 *    Defender designation (the mover who applied Contested is the Attacker). No conquest happens for the opponent
 *    because both players now have units there; the fight then decides the battlefield.
 * Rules: 344.1 (a showdown already ongoing there becomes a Combat Showdown when it turns unit-vs-unit), 464.2.c
 *        (attacker = who applied Contested; roles; 464.2.c.3.a newcomers designated in the following Cleanup),
 *        819/Shield (only while a defender), 348.2 (non-combat close conquers only for a sole occupant).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const STALWART_PORO = "ogn-052-298";

/**
 * P2's turn. bf1 is empty and uncontrolled. P1: Stalwart Poro (2, Shield) in base, a Holder (3) keeping bf2, Ride the
 * Wind with exactly 2+[chaos]. P2: Raider (2) in base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", STALWART_PORO, "poro")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Raider → empty bf1 (non-combat showdown, P2 Focus); P2 passes; P1 Rides the Poro to bf1; resolve that chain only. */
async function poroRidesIntoOpenShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", focusPlayer: P2, isCombatShowdown: false });
  expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "poro" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-bf1");
  await game.p1.pick("battlefield-bf1");
  // While Ride the Wind waits on the chain the Poro is still in base: plain 2 Might, no combat role.
  expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
  expect(game.state("poro")).toMatchObject({ combatRole: expect.not.stringMatching(/defender/), location: "base", might: 2 });
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  return game;
}

describe("Ruling 10ff3806d108cde6 — Ride the Wind a Shield unit into an open non-combat showdown", () => {
  test("the Poro arrives at bf1 READY during P2's showdown; P2 does NOT conquer (both players now have units there) — bf1 is still uncontrolled and contested by P2", async () => {
    const game = await poroRidesIntoOpenShowdown();
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.state("poro").isReady).toBe(true);
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)?.active).toBe(true);
  });

  // RULING-CONFLICT: riftjudge 10ff3806d108cde6 says the Poro sits at bf1 as a plain 2-Might unit for the rest of the
  // NON-combat showdown and only becomes a defender when that showdown "resolves and the combat showdown begins".
  // CR 344.1 ("If a Showdown is already ongoing at that Battlefield, it will become a Combat Showdown and a Combat will
  // initiate there") + 464.2.c.1.b / 464.2.c.3(.a) say the ongoing showdown turns into the Combat at once, in the Cleanup
  // after the arrival, and roles are designated then — engine follows CR (arrive-at-battlefield.ts noteArrival upgrade).
  test("the moment Ride the Wind has resolved, the SAME showdown at bf1 is now a COMBAT showdown: P2 (who applied Contested) is the Attacker, the Poro is a Defender and its Shield is live (2 → 3)", async () => {
    const game = await poroRidesIntoOpenShowdown();
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("poro")).toMatchObject({ baseMight: 2, might: 3 });
    // P1's chain closed → Focus passed on to P2 inside the continuing showdown (347.1.b).
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("the combat then decides bf1 with Shield counting: Raider (2) can't kill the 3-Might defending Poro, the Poro's 2 kills the Raider — P1 ends up holding bf1", async () => {
    const game = await poroRidesIntoOpenShowdown();
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro").damage).toBe(0); // healed at end of combat
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    // Out of combat the Shield bonus is gone again.
    expect(game.state("poro").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if P1 just passes instead, the non-combat showdown closes with only P2's Raider there: P2 conquers bf1 and scores", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.settle();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.locationOf("poro")).toBe("base");
  });
});
