/**
 * Ruling af6dd2dca2742ee9 — Unyielding Spirit (OGN-145 → ogn-145-298) · Spell · [1][body] · [Reaction]
 *   "Prevent all spell and ability damage this turn."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [1][fury] · [Action] · "Deal 3 to a unit at a battlefield."
 *   × Caitlyn, Patrolling (OGN-068 → ogn-068-298) · "[Exhaust]: Deal damage equal to my Might to a unit at
 *     a battlefield." (ability damage)
 *
 * Q: Can Unyielding Spirit negate damage from Challenger?
 * A: No. It only prevents damage whose source is a SPELL or an ABILITY. Challenger makes one unit damage
 *    another, so the source is the unit — like combat damage, which Unyielding Spirit never touches, and
 *    which sticks until a heal (combat cleanup, turn cleanup or an effect).
 * Rules: 355 / 383 (source of damage), 465 (combat damage), 461.1.a.1 + 317.2 (healing).
 *
 * NOTE: no card in the implemented pool prints [Challenger], so the unit-sourced side of the ruling is
 * exercised through COMBAT damage — which the ruling itself names as the thing Challenger behaves like.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const HEXTECH_RAY = "ogn-009-298";
const CAITLYN = "ogn-068-298";

/** P2's turn: P2 aims Hextech Ray at P1's unit standing on a contested-free bf1; P1 holds the Reaction. */
function opponentsRay() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Stalwart" }, "stalwart")
    .hand(P1, UNYIELDING_SPIRIT, "spirit")
    .hand(P2, HEXTECH_RAY, "ray")
    .resources(P1, { energy: 1, power: { body: 1 } })
    .resources(P2, { energy: 1, power: { fury: 1 } });
}

describe("Ruling af6dd2dca2742ee9 — Unyielding Spirit stops spell and ability damage only", () => {
  test("SPELL damage: the Ray is answered by the Reaction and deals nothing", async () => {
    const game = await opponentsRay().build();
    await game.p2.cast("ray", { targets: "stalwart" });
    await game.p2.passPriority();
    await game.p1.cast("spirit");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "spirit"]);
    await game.settle();
    expect(game.state("stalwart").damage).toBe(0);
    expect(game.zoneOf("stalwart")).toBe("battlefield-bf1");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control — without the Reaction the same Ray marks 3 damage", async () => {
    const game = await opponentsRay().build();
    await game.p2.cast("ray", { targets: "stalwart" });
    await game.settle();
    expect(game.state("stalwart").damage).toBe(3);
  });

  test("ABILITY damage is prevented too — Caitlyn's exhaust ability marks nothing after the Spirit resolves", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CAITLYN, "caitlyn")
      .unit(P2, "bf2", { might: 6, name: "Target Dummy" }, "dummy")
      .hand(P1, UNYIELDING_SPIRIT, "spirit")
      .resources(P1, { energy: 1, power: { body: 1 } })
      .build();
    await game.p1.cast("spirit");
    await game.settle();
    await game.p1.activate("caitlyn", 1, { targets: "dummy" }); // #0 is the printed Backline keyword
    await game.settle();
    expect(game.state("caitlyn").isExhausted).toBe(true); // the ability did happen…
    expect(game.state("dummy").damage).toBe(0); // …its damage was prevented
  });

  test("COMBAT damage — unit-sourced, exactly like Challenger — is NOT prevented: both bodies still trade and die", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Blocker" }, "blocker")
      .unit(P1, "base", { might: 4, name: "Charger" }, "charger")
      .hand(P1, UNYIELDING_SPIRIT, "spirit")
      .resources(P1, { energy: 1, power: { body: 1 } })
      .build();
    await game.p1.cast("spirit");
    await game.settle();
    await game.p1.move("charger", "bf1");
    await game.settle();
    expect(game.zoneOf("charger")).toBe("trash");
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
