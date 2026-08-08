/**
 * Combat sides follow CONTROL, not ownership (rules 181/182, 323.2.b, 464.2).
 *
 * A unit whose control has changed (Possession / Conscription / Hostile Takeover)
 * keeps its owner but fights for its new controller. Two consequences the engine
 * used to get wrong by reading `getCardOwner`:
 *
 *  1. Contest detection (Cleanup): a battlefield holding only P2-OWNED units is
 *     still contested when P1 controls one of them — two sides are present.
 *  2. Combat designations (464.2.c.3.a): the stolen body is the thief's
 *     Attacker/Defender, so combat Might is summed on the controller's side.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const STEAL = {
  abilities: [
    {
      effect: {
        target: { controller: "enemy", location: "battlefield", type: "unit" },
        type: "take-control",
      },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Steal",
  rulesText: "[Reaction] Take control of an enemy unit at a battlefield.",
  timing: "reaction",
} as const;

describe("control changes and combat sides (181/182, 323.2.b, 464.2)", () => {
  test("a stolen unit standing among its OWNER's units contests the battlefield for the thief and fights as the thief's attacker", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
      .unit(P2, "bf1", { might: 2, name: "Picket" }, "picket")
      .hand(P1, STEAL, "steal")
      .build();

    await game.p1.cast("steal", { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ controller: P1, owner: P2 });

    await game.settle();
    // 5 (thief's side) vs 2 (owner's side): the picket dies, the conscript lives.
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("a stolen unit DEFENDS for its thief against its own owner: P2 attacking into the 5-Might body it still owns loses its raider", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .card("brute", { controller: P1, def: { cardType: "unit", might: 5, name: "Brute" }, owner: P2, zone: "bf1" })
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();

    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
