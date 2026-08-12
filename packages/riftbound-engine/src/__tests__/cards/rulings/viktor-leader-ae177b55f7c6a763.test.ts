/**
 * Ruling ae177b55f7c6a763 — Viktor, Leader (OGN-246 → ogn-246-298) · Champion Unit · Order · [4][order] · 4 Might
 *     "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *
 * Q: If the unit with the "when another unit dies" ability dies at the SAME time as the other unit, does it
 *    still get its reward?
 * A: No. A unit has to still be on the board to "see" the death: when both die simultaneously the source is no
 *    longer there as the death condition is evaluated, so its ability does not trigger and no Recruit is made.
 *    (It triggers normally whenever the source survives the death.)
 * Rules: 383.1 (the trigger's source must be able to observe the event), 520/461 (state-based deaths in one
 *        batch), 808.1 (contrast: a [Deathknell] is written to fire on the source's OWN death).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR_LEADER = "ogn-246-298";

const recruits = (game: Game) => game.p1.units("base").filter((u) => /recruit/i.test(game.state(u).name));

/**
 * P2's turn 3. P1 holds bf1 with Viktor (4) and an Ally (3). P2 attacks out of base with `might` per attacker —
 * 8 total kills both P1 units, 3 total kills only the Ally.
 */
function board(attackerMight: number) {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VIKTOR_LEADER, "viktor")
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "base", { might: attackerMight, name: "Raider" }, "raider");
}

/** P2 attacks bf1 and both sides pass Focus so the combat resolves. */
async function fight(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  await game.settle();
}

describe("Ruling ae177b55f7c6a763 — Viktor must survive the death to see it: dying at the same moment gives no Recruit", () => {
  test("control: the Ally dies while Viktor lives → Viktor's trigger fires and a 1-Might Recruit token appears in P1's base", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VIKTOR_LEADER, "viktor")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .resources(P2, { energy: 1 })
      .hand(P2, { abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }], cardType: "spell", domain: "order", energyCost: 1, name: "Execute", timing: "action" }, "execute")
      .build();
    await game.p2.cast("execute", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("viktor")).toBe("battlefield-bf1");
    expect(recruits(game)).toHaveLength(1);
    expect(game.state(recruits(game)[0]!).might).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: an 8-Might attack kills Viktor AND the Ally in the same combat → no Recruit token at all", async () => {
    const game = await board(8).build();
    await fight(game);
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("…and no trigger of Viktor's ever reached the chain in that simultaneous case", async () => {
    const game = await board(8).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.chain().filter((c) => c.cardId === "viktor")).toEqual([]);
  });
});
