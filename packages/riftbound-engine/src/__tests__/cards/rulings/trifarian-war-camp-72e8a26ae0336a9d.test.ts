/**
 * Ruling 72e8a26ae0336a9d — Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield "Units here have +1 [Might]."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · 7+[mind] · 7 Might "When you play me, give enemy units -3 [Might] this
 *     turn, to a minimum of 1 [Might]."
 *
 * Q: How do the Camp's +1 and the Watcher's "-3, to a minimum of 1" interact — is the +1 snapshotted, and what happens when
 *    the unit later leaves the Camp?
 * A: The Camp's +1 is continuous (only while there). The Watcher's reduction is applied once, against the Might the unit has
 *    at that moment, clamped so it lands on 1: a printed-2 unit at the Camp (3) goes to 1 — effectively a -2 for the rest of
 *    the turn. Leaving the Camp then removes the +1 and the -2 keeps applying to what is left: 2 - 2 = 0. Might can be 0; a
 *    unit only dies from positive damage ≥ Might, so an undamaged 0-Might unit lives. Nothing is recomputed retroactively.
 * Rules: 706–708 (continuous/passive battlefield ability), 359 ("to a minimum of 1" evaluated on application), 140.3 (lethal
 *        damage needs damage > 0).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const WATCHER = "ogn-116-298";
/** Inline P2 spell that just relocates a unit to its base — the "unit leaves the Camp" step, on P2's turn. */
const SHOVE = {
  abilities: [{ effect: { target: { type: "unit" }, to: "base", type: "move" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Shove",
  timing: "action",
} as const;

/** P2's turn. P1 controls the War Camp with a printed-2 Scout there. P2: Watcher + Shove in hand, 8 energy + [mind]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8, power: { mind: 1 } })
    .battlefield("camp", { controller: P1, def: WAR_CAMP, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "camp", { might: 2, name: "Scout" }, "scout")
    .hand(P2, WATCHER, "watcher")
    .hand(P2, SHOVE, "shove");
}

async function playWatcher(game: Game): Promise<void> {
  await game.p2.play("watcher", { to: "base" });
  await game.settle();
  expect(game.zoneOf("watcher")).toBe("base");
}

describe("Ruling 72e8a26ae0336a9d — War Camp +1 is continuous; the Watcher's clamped -3 is applied once and keeps applying after the unit leaves", () => {
  test("premise: the printed-2 Scout is 3 Might while at the War Camp (continuous +1, not a modifier on the unit)", async () => {
    const game = await board().build();
    expect(game.state("scout")).toMatchObject({ baseMight: 2, might: 3, mightModifier: 0 });
  });

  test("Watcher played: '-3 to a minimum of 1' against the Scout's CURRENT 3 lands on exactly 1 — i.e. an effective -2 recorded on the unit", async () => {
    const game = await board().build();
    await playWatcher(game);
    expect(game.locationOf("scout")).toBe("camp");
    expect(game.state("scout").might).toBe(1);
    expect(game.state("scout").mightModifier).toBe(-2);
    expect(game.state("scout").damage).toBe(0);
  });

  test("the Scout then leaves the Camp (moved to base): the +1 is gone, the -2 still applies to what is left → 0 Might; undamaged, it does NOT die", async () => {
    const game = await board().build();
    await playWatcher(game);
    await game.p2.cast("shove", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("shove")).toBe("trash");
    expect(game.locationOf("scout")).toBe("base");
    expect(game.state("scout")).toMatchObject({ damage: 0, might: 0, mightModifier: -2 }); // not re-clamped to 1, not recomputed to -3
    expect(game.zoneOf("scout")).toBe("base"); // alive at 0 Might
    expect(game.violations()).toEqual([]);
  });

  test("the +1 is continuous, never snapshotted: in base the Watcher's full -3 applies (5 → 2); once that expires and the unit enters the Camp it simply reads +1 while there (5 → 6)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 7, power: { mind: 1 } })
      .battlefield("camp", { controller: null, def: WAR_CAMP, inert: false })
      .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
      .hand(P2, WATCHER, "watcher")
      .build();
    await playWatcher(game);
    expect(game.state("brute")).toMatchObject({ might: 2, mightModifier: -3 });
    await game.advanceTurn(); // → P1's turn; "this turn" modifier has expired
    expect(game.state("brute")).toMatchObject({ might: 5, mightModifier: 0 });
    await game.p1.move("brute", "camp");
    await game.settle();
    expect(game.locationOf("brute")).toBe("camp");
    expect(game.state("brute").might).toBe(6); // 5 + 1 while here
  });

  test("'this turn': after the turn ends the Watcher's reduction expires and the Scout in base is back to its printed 2", async () => {
    const game = await board().build();
    await playWatcher(game);
    await game.p2.cast("shove", { targets: "scout" });
    await game.settle();
    expect(game.state("scout").might).toBe(0);
    await game.advanceTurn();
    expect(game.state("scout")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
