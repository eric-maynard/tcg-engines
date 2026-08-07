/**
 * Here to Help — sfd-111-221 · Spell · Body · 2 energy · Action
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   You may play a unit from hand to a battlefield you control, reducing its cost by [3].
 *
 * Rules: 355.10.a (the played card comes from HAND — a private zone the board
 * target resolver never scans, so it is not a play-time target), 356.1.b (a
 * cost reduction leaves the rest of the cost payable), 355.2 (the destination
 * is restricted to a battlefield its controller controls).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-111-221";
// 4-energy Body unit so the [3] reduction is observable.
const UNIT = "ogn-141-298";

function board() {
  return scenario()
    .active(P1)
    .resources(P1, { energy: 10, power: { body: 5 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Homebody" }, "home")
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .hand(P1, CARD, "help")
    .hand(P1, UNIT, "recruit");
}

describe("Here to Help (sfd-111-221)", () => {
  test("the unit played comes from HAND — friendly board units are not offered as targets", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "help")?.fields.find((f) => f.arg === "targets")?.options;
    // No caster-chosen board target: the hand card is picked as the spell resolves.
    expect(targets === undefined || targets.length === 0).toBe(true);
    await game.p1.cast("help");
    await game.settle();
    // The board units stayed exactly where they were — nothing was moved.
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
  });

  test("plays a hand unit to a battlefield you control, reducing its cost by [3]", async () => {
    const game = await board().build();
    const before = game.p1.energy();
    await game.p1.cast("help");
    await game.settle();
    if (game.decision()) {
      await game.p1.pick("recruit");
      await game.settle();
    }
    // Only the controlled battlefield is a legal destination (never bf2).
    expect(game.zoneOf("recruit")).toBe("battlefield-bf1");
    // 2 for the spell + (4 - 3) for the unit = 3 energy.
    expect(before - game.p1.energy()).toBe(3);
  });

  test("with two battlefields you control, only YOUR battlefields are offered as destinations", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 10, power: { body: 5 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: P1 })
      .hand(P1, CARD, "help")
      .hand(P1, UNIT, "recruit")
      .build();
    await game.p1.cast("help");
    await game.settle();
    await game.p1.pick("recruit");
    const zones = game.decision()?.options ?? [];
    expect(zones).not.toContain("battlefield-bf2");
    await game.p1.pick("battlefield-bf3");
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("battlefield-bf3");
  });

  test("is castable with no friendly unit on the board at all", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 10, power: { body: 5 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, CARD, "help")
      .hand(P1, UNIT, "recruit")
      .build();
    expect(game.p1.can("cast", "help")).toBe(true);
  });
});
