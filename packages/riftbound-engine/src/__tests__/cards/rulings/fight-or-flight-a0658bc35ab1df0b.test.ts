/**
 * Ruling a0658bc35ab1df0b — Fight or Flight (OGN-168 → ogn-168-298) · Spell · [2] · Action · "Move a unit from a
 *     battlefield to its base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell · [2][chaos] · Action · "Move a friendly unit and ready it."
 *   (defending unit with a combat-designation trigger: Ahri, Inquisitive OGN-119 → ogn-119-298, 3 Might, "When I attack
 *    or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]." — the ruling's "Yasuo" stand-in,
 *    since the point is a unit whose attack/defend ability could re-trigger.)
 *
 * Q: During a showdown a defending unit is removed from the battlefield (Fight or Flight) and then returned to the same
 *    battlefield (Ride the Wind) in the same showdown. Does its showdown ability trigger again / does a new showdown start?
 * A: No and no. It is still the same showdown with the same attacker/defender roles; the defender never lost control of
 *    the battlefield while it was momentarily empty of their units; the unit's attack/defend ability does not trigger again.
 * Rules: 383.4.e–f (attack/defend triggers fire once per combat, on first designation), 323.6 (no control loss while a
 *        showdown/combat is ongoing there), 464.2.c (roles fixed when combat opens), 323.2.a (returning unit re-designated).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const RIDE_THE_WIND = "ogn-173-298";
const AHRI_INQUISITIVE = "ogn-119-298";

/** P2's turn (Player B). P1 (Player A) holds bfA with Ahri (3) and has Ride the Wind + [2][chaos]. P2: Raider (6) in base, Fight or Flight + [2]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", AHRI_INQUISITIVE, "ahri")
    .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
}

async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
    } else if (d?.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
}

/** B attacks bfA; Ahri's defend trigger (−2 on the Raider) resolves; B Fight-or-Flights Ahri home; A Rides the Wind her back to bfA. */
async function outAndBack(): Promise<{ game: Game; showdownsOpened: number }> {
  const game = await board().build();
  await game.p2.move("raider", "bfA");
  // Ahri's "When I defend" is on the initial chain; its only enemy here is the Raider.
  await game.acceptTriggerOrder();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("raider");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
  await drainChain(game);
  expect(game.state("raider")).toMatchObject({ combatRole: "attacker", might: 4, mightModifier: -2 });
  expect(game.state("ahri").combatRole).toBe("defender");
  const showdownsOpened = game.gameState.interaction?.showdownStack?.length ?? 0;
  // B has Focus: Fight or Flight on Ahri.
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("fof", { targets: "ahri" });
  await drainChain(game);
  expect(game.zoneOf("fof")).toBe("trash");
  expect(game.locationOf("ahri")).toBe("base");
  // A takes Focus and Rides the Wind Ahri back to bfA.
  if (game.decision()?.kind === "action" && game.decision()?.seat === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: "ahri", answers: ["bfA", "battlefield-bfA"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("bfA");
  }
  await drainChain(game);
  expect(game.zoneOf("rtw")).toBe("trash");
  return { game, showdownsOpened };
}

describe("Ruling a0658bc35ab1df0b — a defender bounced out and Ridden back in the same showdown: no re-trigger, no new showdown", () => {
  test("while Ahri is momentarily gone (only the attacker stands at bfA) Player A still controls bfA and the same showdown is still open (323.6)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bfA");
    await game.acceptTriggerOrder();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("raider");
    }
    await drainChain(game);
    await game.p2.cast("fof", { targets: "ahri" });
    await drainChain(game);
    expect(game.locationOf("ahri")).toBe("base");
    expect(game.cardsAt("battlefield-bfA")).toEqual(["raider"]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bfA" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("Ride the Wind returns Ahri (ready) to bfA: it is STILL the one original showdown — same attacker (B) / defender (A) roles, bfA never changed hands, no second showdown was opened", async () => {
    const { game, showdownsOpened } = await outAndBack();
    expect(game.locationOf("ahri")).toBe("bfA");
    expect(game.state("ahri").isReady).toBe(true);
    expect(game.gameState.interaction?.showdownStack?.length ?? 0).toBe(showdownsOpened);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfA", isCombatShowdown: true });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("ahri").combatRole).toBe("defender"); // re-designated by Cleanup (323.2.a), not by a new combat opening
  });

  test("Ahri's 'When I … defend' does NOT trigger a second time: nothing goes on the chain, A is asked nothing, and the Raider keeps exactly one −2 (6 → 4)", async () => {
    const { game } = await outAndBack();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.state("raider")).toMatchObject({ might: 4, mightModifier: -2 });
  });

  test("the combat then simply finishes: Raider (4) kills Ahri (3) and survives with 3 damage — had Ahri re-triggered (Raider → 2) the Raider would have died instead", async () => {
    const { game } = await outAndBack();
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bfA");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
