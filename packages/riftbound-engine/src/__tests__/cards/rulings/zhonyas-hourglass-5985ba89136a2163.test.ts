/**
 * Ruling 5985ba89136a2163 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it. (Send it to base. This
 *      isn't a move.)"
 *   × Yasuo, Windrider (ogn-205-298) · 4 Might · "[Ganking] The third time I move in a turn, you score 1 point."
 *
 * Q: When a unit is recalled (e.g. by Zhonya's) does it keep buffs, counters, "this turn" modifiers and tracking such as
 *    how many times it has moved?
 * A: Yes — a recall keeps everything except the damage; the card never leaves the board. Recall is NOT a move; buffs and
 *    counters stay; move tracking (Yasuo's count) is retained.
 * Rules: 449 / 480 (recall isn't a move; card stays on the board), 366–373 (die replacement), 702 (buff), 143.2 (damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const YASUO_WINDRIDER = "ogn-205-298";

/** A plain 6-damage removal spell (inline) so the death is spell-driven, outside combat. */
const BOLT6 = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt 6",
  timing: "action",
} as const;

describe("Ruling 5985ba89136a2163 — a Zhonya's recall keeps everything on the unit except its damage", () => {
  test("P2 bolts P1's buffed Veteran (3 +1 buff +2 this turn = 6) for lethal: Zhonya's dies instead; Veteran lands in base with damage 0, EXHAUSTED, still buffed, still +2 this turn (6 Might)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Veteran" }, "vet", { buffed: true, damage: 1, mightModifier: 2 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .gear(P1, ZHONYAS, "zh")
      .hand(P2, BOLT6, "bolt")
      .build();
    expect(game.state("vet")).toMatchObject({ damage: 1, isBuffed: true, isReady: true, might: 6, mightModifier: 2, zone: "battlefield-bf1" });
    await game.p2.cast("bolt", { targets: "vet" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // killed instead
    expect(game.state("vet")).toMatchObject({
      damage: 0, // healed — the ONLY thing that changed on the card
      isBuffed: true, // buff retained
      isExhausted: true, // Zhonya's exhausts it
      might: 6, // 3 + buff 1 + the "this turn" +2 retained
      mightModifier: 2,
      zone: "base", // recalled
    });
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("recall is not a move and move tracking is retained: Yasuo moved twice, is bolted (own spell) and saved by Zhonya's → no 3rd-move point; readied and moved once more it IS his third move → P1 scores 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder 1" }, "h1")
      .unit(P1, "bf2", { might: 1, name: "Holder 2" }, "h2")
      .unit(P1, "base", YASUO_WINDRIDER, "yasuo")
      .gear(P1, ZHONYAS, "zh")
      .hand(P1, BOLT6, "bolt")
      .build();
    // move 1: base → bf1; move 2: gank bf1 → bf2
    await game.p1.move("yasuo", "bf1");
    await game.settle();
    await game.p1.do("readyCard", { cardId: "yasuo" });
    await game.p1.gank("yasuo", "bf2");
    await game.settle();
    expect(game.locationOf("yasuo")).toBe("bf2");
    expect(game.p1.points()).toBe(0);

    // P1 bolts its own Yasuo (a friendly unit would die) → Zhonya's replaces the death and RECALLS him.
    await game.p1.cast("bolt", { targets: "yasuo" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("yasuo")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.points()).toBe(0); // the recall was NOT his third move

    // Ready him and move again: tracking survived the recall, so this is move #3 → score 1.
    await game.p1.do("readyCard", { cardId: "yasuo" });
    await game.p1.move("yasuo", "bf1");
    await game.settle();
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
