/**
 * Ruling 2b691b7694924a8e — Sett, Kingpin (OGN-240 → ogn-240-298) · 5 Might ·
 *     "[Tank] I get +1 [Might] for each buffed friendly unit at my battlefield."
 *   × an inline Action spell "Cataclysm" — "Deal 5 to each enemy unit at a battlefield" — as the source of
 *     simultaneous damage on Sett and the buffed unit that is propping him up.
 *
 * Q: Sett stands at 5 + 1 (a buffed friend at his battlefield). Both are dealt 5 damage at the same time.
 *    Does Sett die?
 * A: Yes. The buffed friend dies to its 5 damage; with it gone Sett's passive drops him back to 5 Might while
 *    5 damage is still marked on him, so he now has lethal damage and is killed by the cleanup that the
 *    friend's departure itself triggers.
 * Rules: 142.4 / 323.5 (a unit with damage ≥ Might is killed in the next Cleanup), 319.6/319.7 (an object
 *        leaving the board or changing status queues another Cleanup at once), 365 (the passive re-evaluates
 *        continuously). The ruling's "alive-but-dead until some later cleanup" gap is exactly that follow-up
 *        Cleanup, which happens before anyone gets priority again.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-240-298";

/** "Deal 5 to each enemy unit at a battlefield" — an Action spell, so both hits land in one resolution. */
const CATACLYSM = {
  abilities: [
    {
      effect: {
        amount: 5,
        target: { controller: "enemy", location: "battlefield", quantity: "all", type: "unit" },
        type: "damage",
      },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 3,
  name: "Cataclysm",
  timing: "action",
} as const;

/** P2's turn. P1 holds bf1 with Sett and a BUFFED 4-Might Bruiser (= 5 Might). P2 holds Cataclysm with [3][fury]×3. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SETT, "sett")
    .unit(P1, "bf1", { might: 4, name: "Bruiser" }, "bruiser", { buffed: true })
    .hand(P2, CATACLYSM, "cata");
}

describe("Ruling 2b691b7694924a8e — losing the buffed friend drops Sett onto his own marked damage and kills him", () => {
  test("baseline: the buffed 4-Might Bruiser is a 5, and it lifts Sett from 5 to 6", async () => {
    const game = await board().build();
    expect(game.state("bruiser")).toMatchObject({ baseMight: 4, isBuffed: true, might: 5 });
    expect(game.state("sett")).toMatchObject({ baseMight: 5, isBuffed: false, might: 6 });
  });

  test("5 damage to each: the Bruiser dies at once (5 ≥ 5) — and Sett, back at 5 Might with 5 damage marked, dies with it", async () => {
    const game = await board().build();
    await game.p2.cast("cata");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cata"]);
    await game.settle();
    expect(game.zoneOf("cata")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("sett")).toBe("trash"); // 5 damage vs a Might that fell back to 5
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: keep the buff alive and Sett lives — the same 5 damage on a 6-Might Sett is not lethal", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SETT, "sett")
      .unit(P1, "bf1", { might: 9, name: "Bruiser" }, "bruiser", { buffed: true })
      .hand(P2, CATACLYSM, "cata")
      .build();
    await game.p2.cast("cata");
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1"); // 5 < 9
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
    expect(game.state("sett")).toMatchObject({ damage: 5, might: 6 });
  });
});
