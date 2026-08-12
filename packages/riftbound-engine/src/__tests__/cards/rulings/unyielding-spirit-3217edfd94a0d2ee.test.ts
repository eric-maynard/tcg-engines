/**
 * Ruling 3217edfd94a0d2ee — Unyielding Spirit (OGN-145 → ogn-145-298) · [Reaction] · Body · [1][body]
 *     "Prevent all spell and ability damage this turn."
 *   × Wages of Pain (SFD-070 → sfd-070-221) · [Action] · "Deal 3 to a unit at a battlefield. …"
 *   × Decree of Unity (VEN-131 → ven-131-166) · "Kill an enemy Chaos ([chaos]) unit or gear."
 *
 * Q: Does Unyielding Spirit stop effects that KILL a unit?
 * A: No. It is a damage-prevention shield only: spell/ability DAMAGE is prevented, but an effect that
 *    kills a unit outright deals no damage, so nothing is prevented and the unit still dies.
 * Rules: 437 (damage prevention), 465.2 (prevention applies to damage), 370 (kill is not damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const WAGES_OF_PAIN = "sfd-070-221";
const DECREE_OF_UNITY = "ven-131-166";

/** P2's turn. P1 holds bf1 with a 6-Might Chaos unit there and Unyielding Spirit + [1][body] in hand. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 6, domain: "chaos", name: "Ward" }, "ward")
    .resources(P1, { energy: 1, power: { body: 1 } })
    .resources(P2, { energy: 3, power: { order: 1 } })
    .hand(P1, UNYIELDING_SPIRIT, "spirit");
}

describe("Ruling 3217edfd94a0d2ee — Unyielding Spirit prevents spell damage, not a kill effect", () => {
  test("spell DAMAGE is prevented: Wages of Pain's 3 never lands", async () => {
    const game = await board().hand(P2, WAGES_OF_PAIN, "wages").build();
    await game.p2.cast("wages", { targets: "ward" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["wages"]);
    await game.p2.passPriority();
    await game.p1.cast("spirit"); // Reaction, on top of Wages
    expect(game.chain().map((c) => c.cardId)).toEqual(["wages", "spirit"]);
    await game.settle();
    expect(game.zoneOf("spirit")).toBe("trash");
    expect(game.zoneOf("ward")).toBe("battlefield-bf1");
    expect(game.state("ward").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: a KILL effect goes right through it — Decree of Unity still kills the Chaos unit", async () => {
    const game = await board().hand(P2, DECREE_OF_UNITY, "unity").build();
    await game.p2.cast("unity", { targets: "ward" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["unity"]);
    await game.p2.passPriority();
    await game.p1.cast("spirit");
    await game.settle();
    expect(game.zoneOf("spirit")).toBe("trash");
    expect(game.zoneOf("unity")).toBe("trash");
    expect(game.zoneOf("ward")).toBe("trash"); // dead despite the shield
    expect(game.state("ward").damage).toBe(0); // it was never damaged — nothing to prevent
  });

  test("control: with no Unyielding Spirit, Wages of Pain marks its 3 damage as usual", async () => {
    const game = await board().hand(P2, WAGES_OF_PAIN, "wages").build();
    await game.p2.cast("wages", { targets: "ward" });
    await game.settle();
    expect(game.state("ward").damage).toBe(3);
    expect(game.zoneOf("ward")).toBe("battlefield-bf1"); // 3 damage on a 6-Might unit is survivable
  });
});
