/**
 * Ruling ad92226af84fb384 — Guerilla Warfare (OGN-264 → ogn-264-298) · Spell · Mind/Chaos · [2][rainbow] · [Action]
 *   "Return up to two cards with [Hidden] from your trash to your hand. You can hide cards ignoring costs this turn."
 *   × Zhonya's Hourglass (ogn-077-298) / Teemo, Scout (ogn-197-298) — cards with [Hidden].
 *
 * Q: What does "You can hide ignoring costs this turn" mean?
 * A: You don't pay the [rainbow] power to hide cards this turn — the verb is "hide", performed while ignoring
 *    its cost. (It is a this-turn licence.)
 * Rules: 811.1.b (Hide = pay [A] to put a [Hidden] card facedown at a battlefield you control), 517.2.b / "this
 *        turn" effects lapse in the Expiration Step (317.2).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUERILLA_WARFARE = "ogn-264-298";
const ZHONYAS = "ogn-077-298";
const TEEMO_SCOUT = "ogn-197-298";

/**
 * P1's turn. P1 controls bf1 and bf2 (a unit on each), holds a Zhonya's in hand and has a Teemo, Scout in the trash;
 * P1 has EXACTLY Guerilla Warfare's [2] + one [rainbow] — after casting it there is no power left to hide with.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder One" }, "h1")
    .unit(P1, "bf2", { might: 2, name: "Holder Two" }, "h2")
    .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
    .hand(P1, ZHONYAS, "zh")
    .trash(P1, TEEMO_SCOUT, "teemo")
    .hand(P1, GUERILLA_WARFARE, "gw");
}

describe("Ruling ad92226af84fb384 — 'hide ignoring costs this turn' = hide without paying the [rainbow]", () => {
  test("baseline: hiding normally costs one power — with the pool emptied of power P1 cannot hide the Zhonya's", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder One" }, "h1")
      .hand(P1, ZHONYAS, "zh")
      .build();
    expect(game.p1.can("hide", "zh")).toBe(false);
    const r = await game.p1.try((p) => p.hide("zh", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("zh")).toBe("hand");
  });

  test("(and with one [rainbow] available the same hide is legal and SPENDS it)", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder One" }, "h1")
      .hand(P1, ZHONYAS, "zh")
      .build();
    await game.p1.hide("zh", "bf1");
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.p1.power()).toBe(0);
  });

  test("Guerilla Warfare resolves (returning Teemo from the trash); P1 now has 0 energy and 0 power — and can STILL hide: Zhonya's at bf1 and the returned Teemo at bf2, paying nothing", async () => {
    const game = await board().build();
    await game.p1.cast("gw", { targets: "teemo" }); // "up to two cards with [Hidden] from your trash"
    await game.settle();
    expect(game.zoneOf("gw")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["teemo", "zh"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    // The licence: hide is offered and costs nothing.
    expect(game.p1.can("hide", "zh")).toBe(true);
    await game.p1.hide("zh", "bf1");
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.state("zh").isHidden).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.p1.hide("teemo", "bf2");
    expect(game.zoneOf("teemo")).toBe("facedown-bf2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("'this turn' only: on P1's NEXT turn, with no power in the pool, hiding is back to costing [rainbow] and is not legal", async () => {
    const game = await board().build();
    await game.p1.cast("gw", { targets: "teemo" });
    await game.settle();
    expect(game.zoneOf("gw")).toBe("trash");
    expect(game.p1.can("hide", "zh")).toBe(true); // free this turn
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (channels runes, but the pool holds no power until one is recycled)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.power()).toBe(0);
    expect(game.zoneOf("zh")).toBe("hand");
    expect(game.p1.can("hide", "zh")).toBe(false);
  });
});
