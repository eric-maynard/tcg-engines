/**
 * Ruling b5cedcaf7e643f0e — Gangplank, Naval (VEN-181 → ven-181-166) · Unit · [6] · 6 [Might]
 *   "[Empower] [body][body]. [Empowered] If a spell or ability that chooses me would stun me, give me -[Might], or
 *    return me to hand, give me +3 [Might] instead."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] [1] · "Give a unit -1 [Might] this turn. Draw 1."
 *   × Rune Prison (OGN-050 → ogn-050-298) · [Action] [2][calm] · "Stun a unit."
 *
 * Q: Is Gangplank's +3 [Might] an until-end-of-turn effect?
 * A: Yes — the errata's "this turn" wording is literal. The replacement swaps the stun / -[Might] / bounce for
 *    +3 [Might], and that +3 expires with every other "this turn" effect in the Ending Phase's Expiration Step.
 * Rules: 317.2.c ("this turn" effects all expire simultaneously in the Ending Phase), 370–372 (replacement effects).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GANGPLANK_NAVAL = "ven-181-166";
const STUPEFY = "ogn-095-298";
const RUNE_PRISON = "ogn-050-298";

/** P2's turn: an Empowered Gangplank holds P1's bf1 and P2 has removal in hand. */
function board(empowered: boolean) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GANGPLANK_NAVAL, "gp", { empowered })
    .hand(P2, STUPEFY, "stupefy")
    .hand(P2, RUNE_PRISON, "prison")
    .resources(P2, { energy: 3, power: { calm: 1 } });
}

describe("Ruling b5cedcaf7e643f0e — Gangplank's Empowered +3 [Might] lasts exactly the turn", () => {
  test("a -[Might] spell aimed at the Empowered Gangplank becomes +3 instead: 6 → 9", async () => {
    const game = await board(true).build();
    expect(game.state("gp")).toMatchObject({ isEmpowered: true, might: 6 });
    await game.p2.cast("stupefy", { targets: "gp" });
    await game.settle();
    expect(game.state("gp")).toMatchObject({ might: 9, mightModifier: 3 });
    expect(game.zoneOf("gp")).toBe("battlefield-bf1");
  });

  test("a stun is replaced the same way — he is not stunned and gains +3", async () => {
    const game = await board(true).build();
    await game.p2.cast("prison", { targets: "gp" });
    await game.settle();
    expect(game.state("gp")).toMatchObject({ isStunned: false, might: 9 });
  });

  test("the +3 is a 'this turn' effect — it is gone once that turn ends", async () => {
    const game = await board(true).build();
    await game.p2.cast("stupefy", { targets: "gp" });
    await game.settle();
    expect(game.state("gp").might).toBe(9);
    await game.advanceTurn(); // P2's Ending Phase runs its Expiration Step
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("gp")).toMatchObject({ might: 6, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("without [Empowered] there is no replacement at all — the -1 simply applies", async () => {
    const game = await board(false).build();
    expect(game.state("gp").isEmpowered).toBe(false);
    await game.p2.cast("stupefy", { targets: "gp" });
    await game.settle();
    expect(game.state("gp")).toMatchObject({ might: 5, mightModifier: -1 });
    await game.advanceTurn();
    expect(game.state("gp").might).toBe(6);
  });
});
