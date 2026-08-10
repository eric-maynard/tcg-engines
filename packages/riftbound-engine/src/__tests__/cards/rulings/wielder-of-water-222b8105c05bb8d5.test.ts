/**
 * Ruling 222b8105c05bb8d5 — Wielder of Water (OGN-055 → ogn-055-298, 2 Might)
 *   "While I'm attacking or defending alone, I have +2 [Might]."
 *   × Tideturner (OGN-199 → ogn-199-298, [Hidden], 2 Might) "When you play me, you may choose a unit you control at
 *     another location. Move me to its location and it to my original location."
 *   × Mask of Foresight (OGN-060 → ogn-060-298, Gear) "When a friendly unit attacks or defends alone, give it +1 [Might]
 *     this turn."
 *
 * Q: Does the Wielder keep its +2 for being alone if, mid-showdown, a Tideturner is revealed into its battlefield?
 * A: No — "While … alone" is a static ability checked continuously: the moment Tideturner joins, the +2 is gone.
 *    Mask of Foresight's "When … alone, give it +1 this turn" is a trigger: it fired once and its +1 lasts the turn.
 * Rules: 367 / 522 (static abilities apply only while their condition holds), 383 (triggered abilities check once),
 *        740.2.a ("alone"), 811 (a Hidden card is played from facedown as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WIELDER = "ogn-055-298";
const TIDETURNER = "ogn-199-298";
const MASK = "ogn-060-298";

/**
 * P2's turn (turn 3). P1 controls bf1 with Wielder of Water alone there, Mask of Foresight in base, and a Tideturner
 * hidden at bf1 since an earlier turn. P2's 1-Might Raider attacks from base (its 1 damage kills nobody).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WIELDER, "wielder")
    .gear(P1, MASK, "mask")
    .facedown(P1, "bf1", TIDETURNER, "tide")
    .unit(P2, "base", { might: 1, name: "Raider" }, "raider");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks; the Mask trigger resolves (both pass); P2 passes Focus → P1 holds Focus with the Wielder at 5. */
async function defendAloneThenP1Focus(game: Game): Promise<void> {
  expect(game.state("wielder").might).toBe(2); // not in combat yet
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.state("wielder").combatRole).toBe("defender");
  // Static: defending alone → +2 right away; the Mask's trigger is on the chain.
  expect(game.state("wielder")).toMatchObject({ might: 4, mightModifier: 0, staticMightBonus: 2 });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Mask resolves: +1 this turn
  expect(game.chain()).toEqual([]);
  expect(game.state("wielder")).toMatchObject({ might: 5, mightModifier: 1, staticMightBonus: 2 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

/** P1 flips the hidden Tideturner at bf1 (declining its optional swap) and lets its play settle onto the board. */
async function revealTideturner(game: Game): Promise<void> {
  expect(game.p1.can("reveal", "tide")).toBe(true);
  await game.p1.reveal("tide");
  for (let i = 0; i < 8 && (game.locationOf("tide") !== "bf1" || game.chain().length > 0); i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.no();
    } else if (d?.kind === "pick" && d.seat === P1 && d.allowDecline) {
      await game.p1.decline();
    } else if (d?.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.locationOf("tide")).toBe("bf1");
}

describe("Ruling 222b8105c05bb8d5 — Wielder's 'while alone' +2 switches off when Tideturner joins; the Mask's triggered +1 stays", () => {
  test("defending alone: Wielder is 2 +2 (static, alone) +1 (Mask of Foresight trigger, this turn) = 5", async () => {
    const game = await board().build();
    await defendAloneThenP1Focus(game);
    expect(game.p1.units("bf1")).toEqual(["wielder"]);
  });

  test("Tideturner revealed into bf1 mid-showdown: Wielder is no longer alone → the static +2 is gone IMMEDIATELY, the Mask's +1 remains → 3; the showdown is still open", async () => {
    const game = await board().build();
    await defendAloneThenP1Focus(game);
    await revealTideturner(game);
    expect(game.p1.units("bf1").sort()).toEqual(["tide", "wielder"]);
    expect(game.state("wielder")).toMatchObject({ might: 3, mightModifier: 1, staticMightBonus: 0 });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.violations()).toEqual([]);
  });

  test("the Mask's +1 is 'this turn': it survives the combat (Wielder 3 + Tideturner 2 kill the 1-Might Raider, whose 1 damage is not lethal to either) and only expires at end of turn", async () => {
    const game = await board().build();
    await defendAloneThenP1Focus(game);
    await revealTideturner(game);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("wielder")).toBe("bf1");
    expect(game.state("wielder")).toMatchObject({ might: 3, mightModifier: 1 }); // no longer in combat, not alone: 2 + 1
    await game.advanceTurn(); // → P1's turn: "this turn" modifiers are gone
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("wielder")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
