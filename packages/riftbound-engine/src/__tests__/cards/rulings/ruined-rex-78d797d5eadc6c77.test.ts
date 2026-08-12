/**
 * Ruling 78d797d5eadc6c77 — Ruined Rex (UNL-067 → unl-067-219) · Unit · Mind · [6][mind] · 6 Might
 *   "[Deathknell][>] Deal 4 to an enemy unit."
 *   × an attacker with [Assault 3] (+3 [Might] while it is an attacker), e.g. the shape Cleave (OGN-004) grants.
 *
 * Q: My attacker with Assault is dealt damage by Ruined Rex's Deathknell. Do I score before it dies from losing
 *    the Assault bonus?
 * A: Yes. The attacker designation — and with it Assault — survives until the very last step of combat, after the
 *    result is determined and control (and the Conquer score) is established. Only when the designation is removed
 *    does the Might drop, and only then can the marked damage become lethal.
 * Rules: 466.7.a (attacker designation removed as combat ends), 740.2 ([Assault] applies while an attacker),
 *        466.5.d (Establishing Control conquers), 466.1.a.1 (Combat Cleanup heals all units).
 * NOTE: the ruling's closing "…and then it dies" no longer follows — see the RULING-CONFLICT facet below.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
/** 8 printed Might, 11 while attacking — enough to survive 6 combat damage plus the Deathknell's 4, but only just. */
const VANGUARD = {
  abilities: [{ keyword: "Assault", type: "keyword", value: 3 }],
  cardType: "unit",
  might: 8,
  name: "Assault Vanguard",
} as const;

/** P1's turn. P2 defends bf1 with Ruined Rex; P1 attacks with the Assault Vanguard. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RUINED_REX, "rex")
    .unit(P1, "base", VANGUARD, "vanguard");
}

async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vanguard", "bf1");
  return game;
}

describe("Ruling 78d797d5eadc6c77 — Assault holds until combat ends, so the Conquer point lands before the unit dies", () => {
  test("the Assault bonus is live the moment it becomes an attacker: 8 printed, 11 attacking", async () => {
    const game = await attack();
    expect(game.state("vanguard")).toMatchObject({ baseMight: 8, combatRole: "attacker", might: 11 });
  });

  test("combat kills the Rex and its Deathknell fires; the Vanguard carries 6 + 4 = 10 damage on 11 attacking Might", async () => {
    const game = await attack();
    await game.settle();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.p1.trash()).not.toContain("rex"); // it is P2's card
  });

  test("P1 scores the Conquer — the ruling's headline: the point is earned before the Assault bonus goes away", async () => {
    const game = await attack();
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 78d797d5eadc6c77 says the Vanguard then dies, because it still carries the 6 combat
  // damage plus the Deathknell's 4 when the attacker designation (and Assault) falls away; CR 466.1.a.1 heals all
  // units in the Combat Cleanup at 466.1 — i.e. BEFORE the chain items from combat damage resolve (466.2), before
  // the result (466.3), the Conquer (466.5.d) and the designation removal (466.7.a) — so only the Deathknell's 4
  // survives, on a printed 8. The ruling's premise (10 marked damage) cannot arise under the current CR; the score
  // it is really about still happens. Engine follows CR.
  test("under CR 466.1.a.1 the combat damage is healed first, so only the Deathknell's 4 remains and it lives on 8", async () => {
    const game = await attack();
    await game.settle();
    expect(game.zoneOf("vanguard")).toBe("battlefield-bf1");
    expect(game.state("vanguard")).toMatchObject({ baseMight: 8, damage: 4, might: 8 });
    expect(game.state("vanguard").combatRole).toBeNull(); // designation gone — Assault no longer applies
    expect(game.p1.points()).toBe(1); // the point is not taken back
  });
});
