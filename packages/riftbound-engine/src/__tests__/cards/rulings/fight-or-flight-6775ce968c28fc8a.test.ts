/**
 * Ruling 6775ce968c28fc8a — Fight or Flight (OGN-168 → ogn-168-298) · Action · [2] · "Move a unit from a battlefield to its base."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and
 *     recall it."  (unl-060-219 Vilemaw is listed by the scrape; the answer concerns the Lair.)
 *   Kill source for the recall contrast: Hextech Ray (ogn-009-298) "Deal 3 to a unit at a battlefield."
 *
 * Q: Can I Fight or Flight a unit out of Vilemaw's Lair?
 * A: No. The spell can legally be PLAYED targeting a unit at the Lair (it is cast, costs are paid, "when you play a spell" effects would
 *    see it), but the move fails on resolution — "can't" beats "can" — and the unit stays. Recalls (Zhonya's, end of combat) are not
 *    moves and are not blocked.
 * Rules: 105 ("can't" overrides), 446–447 (move to an illegal destination isn't performed), 453–456 (recall ≠ move).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const VILEMAWS_LAIR = "ogn-295-298";
const ZHONYAS = "ogn-077-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn with [3][fury]. P1 controls the live Lair with a 3-Might Spider there; Fight or Flight + Hextech Ray in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere")
    .unit(P1, "lair", { might: 3, name: "Spider" }, "spider")
    .hand(P1, FIGHT_OR_FLIGHT, "fof")
    .hand(P1, HEXTECH_RAY, "ray");
}

describe("Ruling 6775ce968c28fc8a — Fight or Flight can be cast at a unit in Vilemaw's Lair but cannot move it to base", () => {
  test("valid activation: the Spider at the Lair is offered as a target and the spell is cast and paid for ([2])", async () => {
    const game = await board().build();
    expect(game.state("spider").keywords).toContain("NoMoveToBase");
    expect(game.p1.can("cast", "fof")).toBe(true);
    const field = game.p1.option("cast", "fof")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("spider");
    await game.p1.cast("fof", { targets: "spider" });
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1, targets: ["spider"] })]);
  });

  test("…but on resolution the move fails: Fight or Flight goes to the trash, the Spider is still at the Lair, no move was counted", async () => {
    const game = await board().build();
    await game.p1.cast("fof", { targets: "spider" });
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("spider")).toBe("battlefield-lair");
    expect(game.p1.energy()).toBe(1); // nothing refunded
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: the same spell on a unit at an ordinary battlefield moves it home", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("plain", { controller: P1 })
      .unit(P1, "plain", { might: 3, name: "Spider" }, "spider")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    await game.p1.cast("fof", { targets: "spider" });
    await game.settle();
    expect(game.zoneOf("spider")).toBe("base");
  });

  test("recall ≠ move: a Zhonya's Hourglass save DOES bring the Lair Spider to base (healed, exhausted) when Hextech Ray would kill it", async () => {
    const game = await board().gear(P1, ZHONYAS, "zhonyas").build();
    await game.p1.cast("ray", { targets: "spider" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("spider")).toBe("base");
    expect(game.state("spider")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0); // a recall is not a move
  });
});
