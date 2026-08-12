/**
 * Ruling ad64300f0cb6bf37 — Unlicensed Armory (OGN-023 → ogn-023-298) · Gear · [2]
 *   "Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die this turn, you may pay [fury]
 *    to heal it, exhaust it, and recall it instead."
 *   × Vengeance (OGN-229 → ogn-229-298) · Spell · [4][order][order] · "Kill a unit." (the killing spell)
 *
 * Q: Can the Armory be activated in reaction, on the opponent's turn, to save a unit from a kill spell?
 * A: No. The ability carries no [Reaction] (nor even [Action]) timing keyword, so it is an ordinary activated
 *    ability: your turn, in an Open State only. With the opponent's spell on the Chain it is not offered.
 * Rules: 381 / 416.3 (activated abilities are Open-State, turn-player only unless tagged), 444 (Reaction timing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNLICENSED_ARMORY = "ogn-023-298";
const VENGEANCE = "ogn-229-298";

/** P2's turn. P1 has the Armory ready, a unit worth saving, a card to discard and [fury] for the save. */
function opponentsTurnKillSpell() {
  return scenario()
    .active(P2)
    .resources(P1, { power: { fury: 1 } })
    .resources(P2, { energy: 4, power: { order: 2 } })
    .gear(P1, UNLICENSED_ARMORY, "armory")
    .unit(P1, "base", { might: 3, name: "Recruit Sergeant" }, "ally")
    .hand(P1, { cardType: "spell", energyCost: 1, name: "Chaff" }, "chaff")
    .hand(P2, VENGEANCE, "vengeance");
}

describe("Ruling ad64300f0cb6bf37 — the Armory has no Reaction timing, so it cannot answer a kill spell", () => {
  test("on the opponent's turn, with their kill spell on the Chain, P1 holds priority but the Armory is NOT activatable", async () => {
    const game = await opponentsTurnKillSpell().build();
    await game.p2.cast("vengeance", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vengeance"]);
    await game.p2.passPriority(); // the caster holds priority first (340) — pass it on
    expect(game.actingSeat()).toBe(P1); // P1 does have priority in the Closed State…
    expect(game.p1.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.p1.can("activate", "armory")).toBe(false); // …but not this ability
    const attempt = await game.p1.try((p) => p.activate("armory", 0, { discard: "chaff" }));
    expect(attempt.ok).toBe(false);
    expect(game.state("armory").isExhausted).toBe(false);
    expect(game.zoneOf("chaff")).toBe("hand");
  });

  test("…so the unit simply dies when the spell resolves", async () => {
    const game = await opponentsTurnKillSpell().build();
    await game.p2.cast("vengeance", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("armory")).toBe("base");
    expect(game.state("armory").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control — the same ability IS available on P1's own turn in an Open State", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .gear(P1, UNLICENSED_ARMORY, "armory")
      .unit(P1, "base", { might: 3, name: "Recruit Sergeant" }, "ally")
      .hand(P1, { cardType: "spell", energyCost: 1, name: "Chaff" }, "chaff")
      .build();
    expect(game.p1.can("activate", "armory")).toBe(true);
    await game.p1.activate("armory", 0, { discard: "chaff" });
    await game.settle();
    expect(game.state("armory").isExhausted).toBe(true);
    expect(game.zoneOf("chaff")).toBe("trash");
  });
});
