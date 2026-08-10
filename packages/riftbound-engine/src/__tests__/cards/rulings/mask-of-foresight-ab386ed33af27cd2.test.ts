/**
 * Ruling ab386ed33af27cd2 — Mask of Foresight (OGN-060 → ogn-060-298) · Gear "When a friendly unit attacks or defends alone, give it
 *     +1 Might this turn."
 *   × Wielder of Water (OGN-055 → ogn-055-298) · 2 Might "While I'm attacking or defending alone, I have +2 Might."
 *   (+ Ride the Wind ogn-173-298 as the mid-showdown "move one away".)
 *
 * Q: Two of my units are at the same battlefield; during the showdown I move one away. Does Mask now give the remaining one +1?
 * A: No. "When I attack/defend" triggers fire only when a unit BECOMES an attacker/defender; the two became attackers together (not
 *    alone) so the trigger missed, and the survivor is not re-designated when its partner leaves. Nuance: a "While … alone" effect
 *    (Wielder of Water) DOES switch on the moment the condition becomes true.
 * Rules: 383.4.e–f (attack/defend triggers checked on gaining the designation), 740.2.a (alone), 364 (While = continuous).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const WIELDER_OF_WATER = "ogn-055-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P2 holds bf1 with a 6-Might Wall. P1: Mask in base, Guard (3) + Wielder of Water (2) ready in base, Ride the Wind + [2][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", WIELDER_OF_WATER, "wielder")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Both attack bf1 together; then P1 (Focus) Rides the Wind `who` back to base and lets it resolve. */
async function attackTogetherThenPull(who: "guard" | "wielder"): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["guard", "wielder"], "bf1");
  expect(game.state("guard").combatRole).toBe("attacker");
  expect(game.state("wielder").combatRole).toBe("attacker");
  // Designated together → not alone: no Mask trigger, no While bonus.
  expect(game.chain()).toEqual([]);
  expect(game.state("guard")).toMatchObject({ might: 3, mightModifier: 0 });
  expect(game.state("wielder")).toMatchObject({ might: 2, mightModifier: 0 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: who });
  for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("base");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("base");
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf(who)).toBe("base");
  return game;
}

describe("Ruling ab386ed33af27cd2 — pulling one of two attackers out mid-showdown doesn't fire Mask of Foresight for the other", () => {
  test("Wielder pulled home: the Guard is now attacking alone but was never RE-designated → no Mask trigger on the chain, Guard stays 3 (+0)", async () => {
    const game = await attackTogetherThenPull("wielder");
    expect(game.p1.units("bf1")).toEqual(["guard"]);
    expect(game.state("guard").combatRole).toBe("attacker");
    expect(game.chain().some((c) => c.cardId === "mask")).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("guard")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — Guard pulled home instead: Wielder of Water's 'WHILE attacking alone' switches on at once (2 → 4), yet Mask ('WHEN') still does not trigger: no chain item, no +1 modifier", async () => {
    const game = await attackTogetherThenPull("guard");
    expect(game.p1.units("bf1")).toEqual(["wielder"]);
    expect(game.state("wielder").combatRole).toBe("attacker");
    expect(game.state("wielder").might).toBe(4); // While-alone +2, continuous
    expect(game.state("wielder").mightModifier).toBe(0); // no Mask "+1 this turn"
    expect(game.chain().some((c) => c.cardId === "mask")).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("control: a unit that attacks alone from the start DOES get Mask's +1 (Guard alone: trigger on the chain, resolves to 4)", async () => {
    const game = await board().build();
    await game.p1.move("guard", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("guard")).toMatchObject({ might: 4, mightModifier: 1 });
  });
});
