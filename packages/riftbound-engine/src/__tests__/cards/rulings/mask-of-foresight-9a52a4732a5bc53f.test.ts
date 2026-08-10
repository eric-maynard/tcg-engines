/**
 * Ruling 9a52a4732a5bc53f — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · 2
 *     "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] · 2+[chaos] "Move a friendly unit and ready it."
 *
 * Q: Moving a unit into an OPEN (uncontrolled, empty) battlefield — are there attacker/defender designations for
 *    effects like Mask of Foresight?
 * A: No. It opens a non-combat showdown: the battlefield is contested by the mover but nobody is an attacker or a
 *    defender, so Mask does not trigger and Assault/Shield give nothing. If the opponent later moves a unit in
 *    (e.g. Ride the Wind), THEY become the defender and the first mover the attacker — only then do such effects apply.
 * Rules: 344 (non-combat showdown at an uncontrolled battlefield), 457/464.2 (designations exist only in combat),
 *        740.2.a (alone), 802/818 (Assault/Shield only while attacker/defender).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. bf1 is open (no controller, no units). P1: Mask in base + a ready 3-Might [Assault 2] Raider. P2: a 3-Might Guard in base, Ride the Wind + 2+[chaos]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "base", { keywords: ["Assault"], might: 3, name: "Raider", abilities: [{ keyword: "Assault", type: "keyword", value: 2 }] }, "raider")
    .unit(P2, "base", { might: 3, name: "Guard" }, "guard")
    .hand(P2, RIDE_THE_WIND, "rtw")
    .resources(P2, { energy: 2, power: { chaos: 1 } });
}

function openShowdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);
}

describe("Ruling 9a52a4732a5bc53f — no attackers/defenders in a showdown at an open battlefield", () => {
  test("moving the Raider into open bf1 contests it (by P1) and opens a NON-combat showdown: no combat role, Mask does not trigger, no Assault bonus", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(openShowdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.chain()).toEqual([]); // Mask of Foresight did not trigger
    expect(game.state("raider").might).toBe(3); // neither Mask's +1 nor Assault
    expect(game.state("raider").mightModifier).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("nobody acts: P1 simply conquers bf1 — Mask never triggered during the whole thing", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(openShowdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("raider").might).toBe(3);
    expect(game.state("raider").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("if P2 Rides the Wind its Guard into bf1 during that showdown, a combat follows in which P1 (first to contest) attacks and P2 DEFENDS — and only now Mask triggers for the lone attacker", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rtw")).toBe(true);
    await game.p2.cast("rtw", { targets: "guard" });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("battlefield-bf1");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
    // While Ride the Wind is pending the showdown is still the non-combat one: no roles.
    expect(openShowdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("raider").combatRole).toBeNull();
    // Let Ride the Wind resolve (both pass once).
    while (game.chain().some((c) => c.cardId === "rtw") && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("guard")).toBe("bf1");
    // Still no designations while the non-combat showdown is the open one.
    if (openShowdown(game)?.isCombatShowdown === false) {
      expect(game.state("raider").combatRole).toBeNull();
      expect(game.state("guard").combatRole).toBeNull();
      for (let i = 0; i < 4 && openShowdown(game)?.isCombatShowdown === false; i++) {
        await game.acting().passFocus();
      }
    }
    // The combat showdown: P1 attacks (contested first), P2 defends.
    expect(openShowdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    // Mask of Foresight: the Raider attacks alone → its trigger is now on the chain.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("raider").mightModifier).toBe(1);
    expect(game.state("raider").might).toBe(3 + 1 + 2); // Mask +1 and Assault 2 while attacking
    expect(game.violations()).toEqual([]);
  });
});
