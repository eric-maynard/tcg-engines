/**
 * Ruling 011d554b0b6c1783 — Hidden Blade (OGN-213 → ogn-213-298) · Order Action spell · [2][order]
 *   "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *   × The Boss (OGN-269 → ogn-269-298) · Legend · Sett — "If a buffed unit you control would die, you may
 *     pay [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) — "If a friendly unit would die, kill this instead. Heal
 *     that unit, exhaust it, and recall it."   (× Retreat OGN-104 as the contrasting case.)
 *
 * Q: Hidden Blade on your OWN buffed unit with Sett's legend available — do you draw the 2 before deciding
 *    on Sett, or decide on Sett first?
 * A: Sett first. The replacement intercedes on the "kill" instruction as it executes, before the later
 *    "draw 2" instruction. If Sett is used the unit is recalled exhausted instead of dying, and its
 *    controller STILL draws 2 (the draw is linked to the unit, not to it actually dying — 359.3.e.14.b).
 *    Zhonya's behaves the same. (Contrast: Retreat in response removes the target → nobody draws.)
 * Rules: 371.2 (optional replacement chosen when the event occurs), 359.3.e.14.b, 359.3.e.14.a, 702.2.b.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const THE_BOSS = "ogn-269-298";
const ZHONYAS = "ogn-077-298";
const RETREAT = "ogn-104-298";

/**
 * P1's turn. P1: The Boss (ready) as legend, a BUFFED 3-Might unit at P1's bf1, Hidden Blade in hand,
 * [2][order] for the Blade + 1 spare [body] for the Boss's [rainbow]. Known deck top so draws are visible.
 */
function bossBoard() {
  return scenario()
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { energy: 2, power: { body: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Brawler" }, "brawler", { buffed: true })
    .hand(P1, HIDDEN_BLADE, "blade")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P1 casts Hidden Blade at its own Brawler and both pass so it starts resolving. */
async function bladeOwnUnit(game: Game): Promise<void> {
  await game.p1.cast("blade", { targets: "brawler" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Ruling 011d554b0b6c1783 — Sett's replacement is decided BEFORE Hidden Blade's draw, and the draw still happens", () => {
  // Expected: the Boss's replacement is decided as the KILL instruction executes, i.e. before the later
  // "Its controller draws 2" instruction — P1's hand is still empty while the yes/no is open.
  // Actual: the engine executes the draw first (P1 already holds d1,d2) and only then surfaces the
  // Boss yes/no for the deferred kill.
  test("ruling 011d554b0b6c1783 — engine draws Hidden Blade's 2 cards BEFORE asking about Sett's replacement (should ask first, 371.2)", async () => {
    const game = await bossBoard().build();
    await bladeOwnUnit(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    // Intermediate facts the ruling relies on: no draw yet, unit not yet dead / moved.
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.zoneOf("brawler")).toBe("battlefield-bf1");
    expect(game.state("boss").isReady).toBe(true);
  });

  test("YES on Sett: Brawler is healed, exhausted, un-buffed and recalled to base instead of dying; Boss exhausted, [rainbow] paid — and THEN P1 draws 2", async () => {
    const game = await bossBoard().build();
    await bladeOwnUnit(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.p1.trash()).not.toContain("brawler");
    expect(game.state("brawler")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    // The controller of the saved unit still draws 2 (359.3.e.14.b).
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.p2.hand()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("NO on Sett: Brawler dies and P1 (its controller) draws 2 all the same", async () => {
    const game = await bossBoard().build();
    await bladeOwnUnit(game);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, order: 0 } });
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
  });

  test("Zhonya's Hourglass works the same way: the Hourglass is killed instead, Brawler recalled exhausted, and P1 still draws 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Brawler" }, "brawler")
      .gear(P1, ZHONYAS, "hourglass")
      .hand(P1, HIDDEN_BLADE, "blade")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .build();
    await bladeOwnUnit(game);
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.state("brawler")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("contrast: Retreat in response returns Brawler to hand BEFORE the Blade resolves → no legal target, nobody draws (359.3.e.14.a)", async () => {
    const game = await bossBoard().hand(P1, RETREAT, "retreat").resources(P1, { energy: 3, power: { body: 1, order: 1 } }).build();
    await game.p1.cast("blade", { targets: "brawler" });
    await game.p1.cast("retreat", { targets: "brawler" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "retreat"]);
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("hand");
    // P1's hand: Brawler only — no d1/d2 drawn. The Boss was never asked (nothing would die).
    expect(game.p1.hand()).toEqual(["brawler"]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.state("boss").isReady).toBe(true);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("retreat")).toBe("trash");
  });
});
