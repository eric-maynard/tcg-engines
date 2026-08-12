/**
 * Ruling ab922374fb07091d — Salvage (OGN-224 → ogn-224-298) · [Action] · Order · [2][order]
 *     "You may kill up to one gear. Draw 1."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · [Hidden] Gear · [2] "If a friendly unit would die, kill this
 *     instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can the opponent always Salvage Zhonya's Hourglass before combat, so it never saves anything?
 * A: If the Hourglass is face-up in play, yes — the opponent only has to wait until they hold Focus and kill the
 *    gear with Salvage; the unit it would have rescued then dies for real. Kept HIDDEN it dodges that: flipped up
 *    at Reaction speed in the middle of a chain it is on the board when the death happens and does its job before
 *    the opponent gets another window.
 * Rules: 370–373 (die replacements come from gear on the board at the moment of the death), 347 (Action speed /
 *        Focus), 811.1 (a [Hidden] card is played from the facedown zone at Reaction speed).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SALVAGE = "ogn-224-298";
const ZHONYAS_HOURGLASS = "ogn-077-298";
/** P2's removal so a death can be staged on demand. */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Execute",
  timing: "action",
} as const;

/** P2's turn 3 with [3][order]: P2 holds Salvage and Execute. P1 has an Ally (3) in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { order: 1 } })
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .hand(P2, SALVAGE, "salvage")
    .hand(P2, EXECUTE, "execute");
}

describe("Ruling ab922374fb07091d — a face-up Zhonya's Hourglass can simply be Salvaged first; a hidden one cannot", () => {
  test("control: with the face-up Hourglass in play the Ally's death is replaced — the gear dies instead and the Ally is healed, exhausted and recalled", async () => {
    const game = await board().gear(P1, ZHONYAS_HOURGLASS, "zhonya").build();
    await game.p2.cast("execute", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: P2 Salvages the face-up Hourglass first — it is dead before anything else happens", async () => {
    const game = await board().gear(P1, ZHONYAS_HOURGLASS, "zhonya").build();
    expect(game.p2.can("cast", "salvage")).toBe(true);
    await game.p2.cast("salvage", { targets: "zhonya" });
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.p1.gear()).toEqual([]);
  });

  test("…and with the shield gone the very same Execute kills the Ally for real: no replacement is available", async () => {
    const game = await board().gear(P1, ZHONYAS_HOURGLASS, "zhonya").build();
    await game.p2.cast("salvage", { targets: "zhonya" });
    await game.settle();
    await game.p2.cast("execute", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("kept HIDDEN it is out of Salvage's reach: it is not a gear in play, so Salvage has nothing to kill", async () => {
    const game = await board()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .facedown(P1, "bf1", ZHONYAS_HOURGLASS, "zhonya")
      .build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    const bad = await game.p2.try((p) => p.cast("salvage", { targets: "zhonya" }));
    expect(bad.ok).toBe(false);
  });

  test("…and flipped up in reaction to the kill spell it is on the board in time: the Ally is saved after all", async () => {
    const game = await board()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .facedown(P1, "bf1", ZHONYAS_HOURGLASS, "zhonya")
      .build();
    await game.p2.cast("execute", { targets: "ally" });
    await game.p2.passPriority(); // the caster keeps priority first; now it is P1's window
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.reveal("zhonya");
    expect(game.p1.gear()).toEqual(["zhonya"]);
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").isExhausted).toBe(true);
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
