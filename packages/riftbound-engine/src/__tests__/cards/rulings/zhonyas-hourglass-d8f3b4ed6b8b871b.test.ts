/**
 * Ruling d8f3b4ed6b8b871b — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "If a friendly unit would die, kill this instead.
 *     Heal that unit, exhaust it, and recall it."
 *
 * Q: When Zhonya's saves a unit from death, does the unit keep its buffs?
 * A: Yes — the unit never actually dies (it is healed, exhausted and recalled, none of which removes a buff; nothing banishes it).
 * Rules: 366–370 (replacement: the death does not happen), 702 (buffs persist while the unit stays on the board), 426 (recall
 *        is not a zone change off the board).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
/** P2's removal: deal 6 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

describe("Ruling d8f3b4ed6b8b871b — a unit saved by Zhonya's keeps its buff", () => {
  test("P1's BUFFED Veteran (3+1) at bf1 takes 6: Zhonya's is killed instead; the Veteran is healed, exhausted, recalled to base — and STILL buffed (4 Might), never having visited the trash", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Veteran" }, "vet", { buffed: true })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .gear(P1, ZHONYAS, "zhonya")
      .hand(P2, BOLT, "bolt")
      .build();
    expect(game.state("vet")).toMatchObject({ isBuffed: true, might: 4 });

    await game.p2.cast("bolt", { targets: "vet" });
    await game.settle();

    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("vet")).toBe("base");
    expect(game.p1.trash()).not.toContain("vet");
    expect(game.state("vet")).toMatchObject({ damage: 0, isBuffed: true, isExhausted: true, location: "base", might: 4 });
    expect(game.violations()).toEqual([]);
  });
});
