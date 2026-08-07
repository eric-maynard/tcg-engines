/**
 * Turn to Dust — unl-070-219 · Spell · Mind · 2 energy · [Action]
 *
 *   Give a gear [Temporary].
 *   (Kill it at the start of its controller's Beginning Phase, before scoring.)
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const TURN_TO_DUST = "unl-070-219";
const SERRATED_DIRK = "sfd-009-221";

function ready() {
  return scenario()
    .active(P1)
    .resources(P1, { energy: 2 })
    .gear(P2, SERRATED_DIRK, "dirk")
    .hand(P1, TURN_TO_DUST, "dust");
}

describe("Turn to Dust (unl-070-219)", () => {
  test("grants the gear [Temporary] and the grant outlives the turn it was cast", async () => {
    const game = await ready().build();
    await game.p1.cast("dust", { targets: "dirk" });
    await game.settle();
    expect(game.state("dirk").grantedKeywords.map((k) => k.keyword)).toContain("Temporary");
    // rule 816.1.b: Temporary only acts at the controller's next Beginning Phase,
    // so an unqualified grant must not expire at end of turn — it is still there
    // when P2's Beginning Phase looks for it and kills the gear (the card in the
    // trash is a new object and tracks no grants, rule 124.1).
    await game.advanceTurn(); // → P2's turn begins
    expect(game.zoneOf("dirk")).toBe("trash");
    expect(game.state("dirk").grantedKeywords).toEqual([]);
  });

  test("the gear is killed at the start of its controller's next Beginning Phase", async () => {
    const game = await ready().build();
    await game.p1.cast("dust", { targets: "dirk" });
    await game.settle();
    expect(game.zoneOf("dirk")).toBe("base");
    await game.advanceTurn(); // → P2: Beginning Phase kills the Temporary gear
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("dirk")).toBe("trash");
  });
});
