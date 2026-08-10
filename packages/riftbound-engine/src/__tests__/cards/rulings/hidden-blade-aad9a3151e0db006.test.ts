/**
 * Ruling aad9a3151e0db006 — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] "Kill a unit at a battlefield. Its controller draws 2."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction "Move up to 2 friendly units to base."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Does Hidden Blade's "draw 2" still happen if the target is moved off the battlefield (Flash) before it resolves?
 * A: No — the unit is no longer "a unit at a battlefield", the kill can't be performed and the linked "its controller draws 2" is
 *    skipped. Contrast: if the unit is instead SAVED by Zhonya's (target legal when the Blade resolves; the death is replaced), its
 *    controller still draws 2.
 * Rules: 359.3.e.2 / 359.3.e.14.a (illegal target → instruction and linked instruction ignored), 371–372 (die replacement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";
const ZHONYAS = "ogn-077-298";

/**
 * P2's turn 3. P1 holds bf1 with a Defender (2) and hid Hidden Blade there earlier. P2's Attacker (5) is in base with Flash in hand
 * and [2][chaos]. `withZhonyas` adds a face-up Zhonya's Hourglass to P2's board.
 */
function board(withZhonyas = false) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P2, "base", { might: 5, name: "Attacker" }, "atk")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P2, FLASH, "flash")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"]);
  return withZhonyas ? s.gear(P2, ZHONYAS, "zhonyas") : s;
}

/** P2 attacks bf1 and passes Focus; P1 plays the facedown Hidden Blade on the Attacker and passes → P2 has priority. */
async function bladeOnAttacker(withZhonyas = false): Promise<Game> {
  const game = await board(withZhonyas).build();
  await game.p2.move("atk", "bf1");
  await game.p2.passFocus();
  await game.p1.reveal("blade", { answers: ["atk"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["atk"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling aad9a3151e0db006 — Hidden Blade's 'its controller draws 2' needs the kill to land on a unit at a battlefield", () => {
  test("control: no response → the Attacker (at bf1) is killed and P2, its controller, draws 2", async () => {
    const game = await bladeOnAttacker();
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("Flash in response moves the Attacker to base: when the Blade resolves its target is no longer at a battlefield → nothing is killed and NOBODY draws", async () => {
    const game = await bladeOnAttacker();
    await game.p2.cast("flash", { targets: "atk" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.locationOf("atk")).toBe("base");
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.settle(); // Blade resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("base"); // alive
    expect(game.zoneOf("def")).toBe("battlefield-bf1"); // no substitute victim
    expect(game.p2.hand()).toHaveLength(p2Hand); // no draw 2
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.deck()[0]).toBe("d1");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — saved by Zhonya's instead: the target is legal as the Blade resolves, the death is replaced (Zhonya's dies; Attacker healed, exhausted, recalled) and P2 STILL draws 2", async () => {
    const game = await bladeOnAttacker(true);
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("base");
    expect(game.state("atk")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["d1", "d2"]));
    expect(game.violations()).toEqual([]);
  });
});
