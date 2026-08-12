/**
 * Ruling 596ea89fc6bac66b — (no specific card) do two Shield values stack?
 *   Exercised with Stalwart Poro (OGN-052 → ogn-052-298) · 2 Might · printed [Shield] (= [Shield 1]).
 *
 * Q: A unit has [Shield 1] and a card gives it [Shield 2] — is it Shield 3 or Shield 2?
 * A: Shield 3. Shield values from different sources add up on the same unit.
 * Rules: 807.1.a [Shield] "+X [Might] while I'm a defender", 807.1.b.3 (an omitted X is 1),
 *        807.2 (values of the same keyword from several sources are summed), 465.2 (combat damage uses
 *        current Might, so the summed Shield is exactly what the attacker must beat).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PORO = "ogn-052-298"; // 2 Might, printed [Shield]

/** [Reaction] "Give a unit [Shield 2] this turn." — the second Shield source. */
const AEGIS = {
  abilities: [
    {
      effect: { duration: "turn", keyword: "Shield", target: { type: "unit" }, type: "grant-keyword", value: 2 },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Aegis",
  rulesText: "[Reaction] Give a unit [Shield 2] this turn.",
  timing: "reaction",
} as const;

/** P1's turn: P2 defends bf1 with the Poro; P1 attacks with a Raider of the given Might. */
function board(raiderMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", PORO, "poro")
    .unit(P1, "base", { might: raiderMight, name: "Raider" }, "raider")
    .hand(P2, AEGIS, "aegis");
}

describe("Ruling 596ea89fc6bac66b — [Shield 1] + [Shield 2] = Shield 3, not Shield 2", () => {
  test("the granted [Shield 2] is added alongside the printed [Shield]; while defending the 2-Might Poro fights at 2 + 1 + 2 = 5", async () => {
    const game = await board(4).build();
    expect(game.state("poro").keywords).toContain("Shield");
    expect(game.state("poro").might).toBe(2); // no role yet
    await game.p1.move("raider", "bf1");
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 3 }); // printed Shield only
    await game.p1.passFocus();
    await game.p2.cast("aegis", { targets: "poro" });
    await game.settle();
    expect(game.state("poro").grantedKeywords).toEqual([{ duration: "turn", keyword: "Shield", value: 2 }]);
    // 4 damage from the Raider is short of the summed 5 ⇒ the Poro lives (Shield 2 alone would have been 4 = lethal),
    // and its own 5 kills the 4-Might Raider.
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control: with only the printed [Shield] the same 4-Might Raider kills the Poro (2 + 1 = 3) and conquers", async () => {
    const game = await board(4).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Shield 3 is exactly 3, not more: a 5-Might Raider does kill the shielded Poro", async () => {
    const game = await board(5).build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("aegis", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash"); // 5 ≥ 2 + 3
    expect(game.zoneOf("raider")).toBe("trash"); // and the Poro's 5 was lethal right back
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // 466.5.b — nobody remains
  });
});
