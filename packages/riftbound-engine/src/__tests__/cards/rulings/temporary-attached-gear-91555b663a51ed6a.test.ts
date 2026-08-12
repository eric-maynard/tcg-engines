/**
 * Ruling 91555b663a51ed6a — Spinning Axe (SFD-186 → sfd-186-221, Equipment) "[Quick-Draw] · [Equip]
 *   [rainbow] · [Temporary] (If this is unattached, kill it at the start of its controller's
 *   Beginning Phase, before scoring.)" × an inline [Action] "Give a friendly gear [Temporary]."
 *
 * Q: Do equipped gear get killed in the Beginning Phase if they are [Temporary]?
 * A: It depends where the keyword came from. A PRINTED [Temporary] goes inactive while the card is
 *    attached — an attached card's rules text is Inactive — so it is not killed. A GRANTED
 *    [Temporary] comes from an outside effect that is still active, so it does kill the gear at
 *    the start of its controller's next Beginning Phase even while attached.
 * Rules: 135.4 / 718.2 (an attached card's printed rules text is Inactive), 816 / 816.1.b
 *        ([Temporary] kills at the start of the controller's Beginning Phase, before scoring),
 *        728.1.b (before the Hold score), 705 (granted abilities are not the card's printed text).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPINNING_AXE = "sfd-186-221"; // printed [Temporary]

/** [Action] "Give a friendly gear [Temporary]." */
const CURSE = {
  abilities: [
    {
      effect: {
        duration: "permanent",
        keyword: "Temporary",
        target: { controller: "friendly", type: "gear" },
        type: "grant-keyword",
      },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Curse of Impermanence",
  rulesText: "[Action] Give a friendly gear [Temporary].",
  timing: "action",
} as const;

/** It is P2's turn, so one `advanceTurn()` reaches P1's Beginning Phase (the kill step). */
const board = (attached: boolean) =>
  scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .unit(P1, "base", { might: 4, name: "Bearer" }, "bearer")
    .gear(P1, SPINNING_AXE, "axe", attached ? { attachedTo: "bearer" } : undefined);

describe("Ruling 91555b663a51ed6a — printed [Temporary] sleeps while attached, granted [Temporary] does not", () => {
  test("UNATTACHED: the printed [Temporary] is active and the Axe dies at the start of P1's Beginning Phase", async () => {
    const game = await board(false).build();
    expect(game.state("axe").attachedTo).toBeUndefined();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("axe")).toBe("trash");
  });

  test("ATTACHED: the printed [Temporary] is inactive — the Axe survives P1's Beginning Phase", async () => {
    const game = await board(true).build();
    expect(game.state("axe").attachedTo).toBe(game.card("bearer"));
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe").attachedTo).toBe(game.card("bearer"));
    expect(game.zoneOf("bearer")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("…and it stays alive turn after turn while it remains attached", async () => {
    const game = await board(true).build();
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    expect(game.zoneOf("axe")).toBe("base");
  });

  test("GRANTED [Temporary] on an ATTACHED gear is active and does kill it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .unit(P1, "base", { might: 4, name: "Bearer" }, "bearer")
      .gear(P1, { cardType: "gear", name: "Plain Gear" }, "plain", { attachedTo: "bearer" })
      .hand(P1, CURSE, "curse")
      .build();
    await game.p1.cast("curse", { targets: "plain" });
    await game.settle();
    expect(game.state("plain").grantedKeywords.map((k) => k.keyword)).toContain("Temporary");
    expect(game.state("plain").attachedTo).toBe(game.card("bearer"));
    await game.advanceTurn(); // → P2's turn
    await game.advanceTurn(); // → P1's next Beginning Phase, where [Temporary] kills
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.zoneOf("bearer")).toBe("base"); // only the gear died
    expect(game.violations()).toEqual([]);
  });
});
