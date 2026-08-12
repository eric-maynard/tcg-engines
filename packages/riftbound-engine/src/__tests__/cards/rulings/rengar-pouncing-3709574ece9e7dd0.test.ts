/**
 * Ruling 3709574ece9e7dd0 — Rengar, Pouncing (sfd-025-221) · Unit/Champion · Fury · [3][fury] · 3 Might
 *   "[Reaction] · [Assault 2] · I can be played to a battlefield you're attacking."
 *   × Relentless Storm (ogn-249-298) · Legend — "When you play a [Mighty] unit, you may exhaust me to
 *   channel 1 rune exhausted." (the "Volibear-style" play-a-Mighty-unit trigger of the question)
 *
 * Q: Is Rengar [Mighty] when he is played into a battlefield you are attacking, for effects that trigger
 *    on playing a Mighty unit?
 * A: No. He enters at 3 Might WITHOUT the Attacker designation; his play triggers see a 3-Might unit. He
 *    only gains the designation — and with it [Assault 2], reaching 5 — in the Cleanup his arrival
 *    causes. (A unit whose own passive puts it at 5+ on entry IS Mighty straight away.)
 * Rules: 464.2.c.3.a (a unit arriving after Attacker/Defender were established gains its designation in
 *        the following Cleanup), 807.1 ([Assault X] applies only while the Attacker designation lasts),
 *        708/710 ([Mighty] = 5+ Might), 419.4 (the play trigger reads the board as the card resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "sfd-025-221";
const RELENTLESS_STORM = "ogn-249-298";

/** P1 is attacking bf1 with a Brute and holds Rengar; Relentless Storm is P1's legend. */
async function attacking(): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .legend(P1, RELENTLESS_STORM, "storm")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Brute" }, "brute")
    .hand(P1, RENGAR, "rengar")
    .build();
  await game.p1.move("brute", "bf1");
  return game;
}

describe("Ruling 3709574ece9e7dd0 — Rengar is not [Mighty] at the moment he is played", () => {
  test("playing him into the battlefield you are attacking does NOT trigger 'when you play a [Mighty] unit'", async () => {
    const game = await attacking();
    expect(game.state("rengar").baseMight).toBe(3);
    await game.p1.play("rengar", { to: "bf1" });
    // no opt-in prompt for the legend: he was a 3-Might unit when he was played
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("storm").isExhausted).toBe(false);
    expect(game.p1.runes().length).toBe(0);
  });

  test("the designation and [Assault 2] arrive with the Cleanup: he then stands at bf1 as a 5-Might attacker", async () => {
    const game = await attacking();
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.state("rengar")).toMatchObject({ baseMight: 3, combatRole: "attacker", might: 5 });
    expect(game.state("rengar").keywords).toContain("Assault");
  });

  test("contrast — a unit that is genuinely 5 Might on entry DOES trigger the Storm", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .legend(P1, RELENTLESS_STORM, "storm")
      .hand(P1, { cardType: "unit", energyCost: 3, might: 5, name: "Test Titan" }, "titan")
      .build();
    await game.p1.play("titan");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("storm").isExhausted).toBe(true);
    expect(game.p1.runes().length).toBe(1);
  });

  test("contrast — Rengar played to the BASE never gets the designation at all, so he stays a 3-Might non-Mighty unit", async () => {
    const game = await attacking();
    await game.p1.play("rengar", { to: "base" });
    expect(game.zoneOf("rengar")).toBe("base");
    expect(game.state("rengar")).toMatchObject({ combatRole: null, might: 3 });
    expect(game.state("storm").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the [Assault] bonus is tied to the designation: once the combat ends it is gone and he is 3 again", async () => {
    const game = await attacking();
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.state("rengar").might).toBe(5);
    await game.settle(); // the 9-Might Wall wins the combat
    expect(game.zoneOf("rengar")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
