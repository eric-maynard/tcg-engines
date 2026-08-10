/**
 * Ruling c8f5bc1f4c81589f — Rek'Sai, Breacher (SFD-029 → sfd-029-221) · Champion Unit · Fury · [3][fury] · 3 Might
 *   "[Accelerate] … [Assault] (+1 [Might] while I'm an attacker.) Friendly units played from anywhere other than a
 *    player's hand have [Accelerate]."
 *
 * Q: Moving Rek'Sai to conquer an OPEN battlefield (no enemy units) — does it get Assault's +1 as an "attacker"?
 * A: No. Assault is "+1 Might while I'm an attacker" and units are only designated attackers in a Combat. An empty
 *    battlefield gives a NON-combat showdown: no opposing units, no combat, no attacker designation → 3 Might.
 *    Same for an uncontrolled empty battlefield.
 * Rules: 807.1.c / 807.1.d (Assault; attacker only during combat), 446.1 (attacker/defender designations are a
 *        combat thing), 344/348 (non-combat showdown at an empty battlefield).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const REKSAI = "sfd-029-221";

function board() {
  return scenario()
    .turn(3)
    .battlefield("open", { controller: null })
    .battlefield("held", { controller: P2 })
    .unit(P2, "held", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", REKSAI, "reksai");
}

describe("Ruling c8f5bc1f4c81589f — Assault is off in a non-combat showdown: Rek'Sai takes an empty battlefield at 3 Might", () => {
  test("moving alone to the uncontrolled, empty battlefield opens a NON-combat showdown: Rek'Sai has no attacker designation and reads 3 Might throughout", async () => {
    const game = await board().build();
    expect(game.state("reksai")).toMatchObject({ keywords: expect.arrayContaining(["Assault"]), might: 3 });
    await game.p1.move("reksai", "open");
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "open" });
    expect(sd?.isCombatShowdown).not.toBe(true);
    expect(game.state("reksai").combatRole).not.toBe("attacker");
    expect(game.state("reksai").might).toBe(3);
    // Focus passes around the (empty) showdown; still 3.
    await game.p1.passFocus();
    expect(game.state("reksai").might).toBe(3);
    await game.settle();
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("reksai")).toMatchObject({ combatRole: null, might: 3, zone: "battlefield-open" });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — moving into the enemy-held battlefield IS a combat: Rek'Sai is the attacker and Assault makes it 4 during that combat (then 3 again afterwards)", async () => {
    const game = await board().build();
    await game.p1.move("reksai", "held");
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "held", isCombatShowdown: true });
    expect(game.state("reksai")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.state("sentry")).toMatchObject({ combatRole: "defender", might: 2 });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.held?.controller).toBe(P1);
    expect(game.state("reksai")).toMatchObject({ combatRole: null, might: 3, zone: "battlefield-held" });
  });
});
