/**
 * Ruling 9828670e89a39b6e — Mask of Foresight (OGN-060 → ogn-060-298: "When a friendly unit attacks or defends alone, give
 *   it +1 [Might] this turn.") × Sprite token (OGN-274 → ogn-274-298, 3 Might [Temporary]) × an [Ambush] unit
 *   (Inferna, unl-002-219: "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.) [Assault 2]").
 *
 * Q: I start a showdown with only a Sprite token (Mask out) and then react with an Ambush unit — does the Sprite still
 *    get Mask's +1?
 * A: Yes. "Alone" is checked once, when the Sprite gains the attacker designation; the Mask trigger is then locked in on
 *    the chain and gives +1 when it resolves, whether the Ambush unit arrives before or after — the bonus never
 *    retroactively disappears.
 * Rules: 383.4.e (attack triggers evaluated at designation), 740.2.a (alone), 822 (Ambush = Reaction-speed play), 359.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const SPRITE = "ogn-274-298";
const INFERNA = "unl-002-219"; // [2], 1 Might, [Ambush], [Assault 2]

/** P1's turn, [2] floating. P1: Mask in base, a ready Sprite token (3) in base, Inferna in hand. P2's Guard (3) holds bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "base", SPRITE, "sprite")
    .hand(P1, INFERNA, "inferna");
}

async function spriteAttacksAlone(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("sprite", "bf1");
  expect(game.state("sprite").combatRole).toBe("attacker");
  expect(game.p1.units("bf1")).toEqual(["sprite"]); // alone at designation
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
  expect(game.state("sprite").might).toBe(3);
  return game;
}

describe("Ruling 9828670e89a39b6e — the Sprite keeps Mask's 'attacks alone' +1 even though an Ambush unit joins the fight", () => {
  test("let Mask resolve first (Sprite 3 → 4), then with Focus Ambush Inferna into bf1 as a Reaction-speed play: two attackers now, and the Sprite is STILL 4", async () => {
    const game = await spriteAttacksAlone();
    await game.acting().pass();
    await game.acting().pass(); // Mask resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("sprite")).toMatchObject({ might: 4, mightModifier: 1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "inferna")).toBe(true);
    expect(game.p1.option("playUnit", "inferna")?.fields.find((f) => f.arg === "to")?.options).toEqual(["battlefield-bf1"]); // Ambush: where you have units
    await game.p1.play("inferna", { to: "bf1" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.locationOf("inferna")).toBe("bf1");
    expect(game.state("inferna").combatRole).toBe("attacker");
    expect(game.p1.units("bf1").sort()).toEqual(["inferna", "sprite"]); // no longer alone …
    expect(game.state("sprite")).toMatchObject({ might: 4, mightModifier: 1 }); // … bonus does not disappear
    expect(game.p1.energy()).toBe(0);
  });

  test("or Ambush Inferna in RESPONSE to the Mask trigger (before it resolves): the trigger was locked in at designation and still resolves +1 onto the Sprite with Inferna already there", async () => {
    const game = await spriteAttacksAlone();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("play", "inferna")).toBe(true); // Reaction-speed thanks to Ambush
    await game.p1.play("inferna", { to: "bf1" });
    expect(game.locationOf("inferna")).toBe("bf1"); // a permanent: in at once
    expect(game.chain().map((c) => c.cardId)).toEqual(["mask"]); // Mask still pending, not removed
    expect(game.state("sprite").might).toBe(3);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.chain()).toEqual([]);
    expect(game.p1.units("bf1").sort()).toEqual(["inferna", "sprite"]);
    expect(game.state("sprite")).toMatchObject({ might: 4, mightModifier: 1 });
    // and no second Mask trigger for Inferna (it did not attack alone)
    expect(game.state("inferna").mightModifier).toBe(0);
  });

  test("outcome check: Sprite 4 + Inferna 3 (1 + Assault 2) = 7 into the Guard's 3 — P1 conquers bf1", async () => {
    const game = await spriteAttacksAlone();
    await game.p1.play("inferna", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
