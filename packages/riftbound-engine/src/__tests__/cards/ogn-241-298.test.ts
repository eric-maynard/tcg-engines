/**
 * Shen, Kinkou — ogn-241-298 · Champion Unit (Shen) · Order · 3 energy + [order] · 3 Might
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve, including to a
 *   battlefield you control.)
 *   [Shield 2] (+2 [Might] while I'm a defender.)
 *   [Tank] (I must be assigned combat damage first.)
 *
 * Rules: 807 Reaction (may be played in any state, incl. the opponent's turn and showdowns),
 * 814 Shield (+X Might only while a defender), 815 Tank (lethal combat damage is assigned to
 * Tank units first), 143.4 (units enter exhausted).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-241-298";

/** P2's turn; P2 has a `might`-Might attacker in base; P1 holds bf1 with a 1-Might unit and Shen in hand. */
function defence(might: number) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1 }, "small")
    .unit(P2, "base", { might }, "atk")
    .hand(P1, CARD, "shen");
}

describe("Shen, Kinkou (ogn-241-298)", () => {
  test("costs 3 energy + 1 order; a 3-Might unit with Shield and Tank; enters exhausted; unaffordable without the order", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "shen").build();
    await game.p1.play("shen", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("base");
    expect(game.state("shen").might).toBe(3);
    expect(game.state("shen").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    expect(game.state("shen").isExhausted).toBe(true);
    const noOrder = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "shen").build();
    expect(noOrder.p1.can("play", "shen")).toBe(false);
    const low = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CARD, "shen").build();
    expect(low.p1.can("play", "shen")).toBe(false);
  });

  test("may be played directly to a battlefield you control (not to an enemy one)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .hand(P1, CARD, "shen")
      .build();
    const to = game.p1.option("play", "shen")?.fields.find((f) => f.arg === "to")?.options;
    expect(to).toEqual(expect.arrayContaining(["base", "battlefield-bf1"]));
    expect(to).not.toContain("battlefield-bf2");
    await game.p1.play("shen", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("shen")).toBe("bf1");
  });

  test("[Reaction] is timing, not priority: in the opponent's Neutral Open State he stays in hand (316.5.b, 813.1.c.1)", async () => {
    // rule 316.5.b: only the Turn Player may play cards in a Neutral Open State.
    // rule 813.1.c.1: Reaction is short for "can be played during CLOSED states on any
    // player's turn" — it opens no window while the opponent's turn sits open.
    const game = await defence(3).build();
    expect(game.p1.can("play", "shen")).toBe(false);
    const r = await game.p1.try((p) => p.play("shen", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("shen")).toBe("hand");
    expect(game.turnPlayer()).toBe(P2);
  });

  test("[Reaction] into a showdown at your battlefield — Shen arrives as a Shield-2 Tank defender and saves the 1-Might ally", async () => {
    // Expected: P2's 3-Might attacker moves in; P1 reacts by playing Shen to bf1. Tank forces the 3
    // damage onto Shen (5 Might as defender) → nobody on P1's side dies; attacker takes 1+3 and dies.
    // Actual: Shen cannot be played during the opponent's showdown at all.
    const game = await defence(3).build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("play", "shen")).toBe(true);
    await game.p1.play("shen", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("shen")).toBe("bf1");
    expect(game.locationOf("small")).toBe("bf1");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Shield 2]: defending alone he is 5 Might — a 4-Might attacker dies, Shen survives and keeps the battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", CARD, "shen")
      .unit(P1, "base", { might: 4 }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash"); // took 5 ≥ 4
    expect(game.zoneOf("shen")).toBe("battlefield-bf1"); // took 4 < 3+2
    expect(game.state("shen").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("[Shield 2] is defender-only: Shen (3) attacking a 3-Might defender trades", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "def")
      .unit(P1, "base", CARD, "shen")
      .build();
    await game.p1.move("shen", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("trash");
  });

  test("[Tank]: defending beside a 1-Might ally, the 3 attacking damage must all go to Shen — both defenders live", async () => {
    const control = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "small")
      .unit(P2, "bf1", { might: 5 }, "big")
      .unit(P1, "base", { might: 3 }, "atk")
      .build();
    await control.p1.move("atk", "bf1");
    await control.settle();
    expect(control.zoneOf("small")).toBe("trash"); // no Tank → the small one eats lethal damage

    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "small")
      .unit(P2, "bf1", CARD, "shen")
      .unit(P1, "base", { might: 3 }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.zoneOf("atk")).toBe("trash"); // took 5 + 1
  });
});
