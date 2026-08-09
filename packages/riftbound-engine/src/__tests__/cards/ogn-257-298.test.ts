/**
 * Blind Monk — ogn-257-298 · Legend (Lee Sin) · Calm/Body
 *
 *   [1], [Exhaust]: Buff a friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)
 *
 * Rules: 376/151-style activated ability with no [Action]/[Reaction] → Neutral Open State on the
 * controller's turn only (343.1.b, 313.1.a); 426/702 Buff (a counter, +1 Might, max one per unit —
 * 426.1.c: an already-buffed unit is still a legal choice but is not buffed); 356.6/577: every
 * cost component ([1] AND [Exhaust]) must be payable; 315.1.b Awaken readies the legend.
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. Choosing an already-buffed unit is LEGAL: the [1] and the exhaust are spent, nothing changes
 *     on the unit (426.1.c) — no second +1.
 *  2. The buff is a counter, not a "this turn" modifier: it survives advanceTurn(); the legend
 *     itself readies in its controller's Awaken Phase so the ability is once-per-turn in practice.
 *  3. "friendly" = controlled: enemy units are never offered; a friendly unit at a battlefield is
 *     as good as one in base; with NO friendly unit on the board the ability cannot be activated.
 *  4. Timing: illegal during a showdown, while a chain is open, and on the opponent's turn.
 *  5. Partners: Lee Sin, Ascetic ("I can have any number of buffs") DOES take a second buff from
 *     the Monk (426.1.b.2); Lee Sin, Centered ("Other buffed friendly units at my battlefield have
 *     +2 Might") turns the Monk's +1 into +3 at his battlefield.
 *  6. Cost funding: an empty pool with a ready rune can still pay the [1].
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-257-298";
const LEE_SIN_ASCETIC = "ogn-078-298"; // 5 might, Shield, [Exhaust]: Buff me. I can have any number of buffs.
const LEE_SIN_CENTERED = "ogn-151-298"; // 6 might, Other buffed friendly units at my battlefield have +2 Might.
const DISINTEGRATE = "ogn-005-298"; // [Action] spell, 4 energy: deal 3 to a unit at a battlefield

function board(energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .legend(P1, CARD, "monk")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Acolyte" }, "acolyte")
    .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe");
}

describe("Blind Monk (ogn-257-298)", () => {
  test("registry payload: one activated ability costing {energy:1, exhaust} that buffs a friendly unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Lee Sin", domain: ["calm", "body"], name: "Blind Monk" });
    expect(def?.abilities).toEqual([
      {
        cost: { energy: 1, exhaust: true },
        effect: { target: { controller: "friendly", type: "unit" }, type: "buff" },
        type: "activated",
      },
    ]);
  });

  test("[1],[Exhaust]: buffs the chosen friendly unit (+1 Might), spends 1 energy and exhausts the legend", async () => {
    const game = await board(2).build();
    await game.p1.activate("monk", 0, { targets: "acolyte" });
    // Costs are paid on activation, before resolution.
    expect(game.p1.energy()).toBe(1);
    expect(game.state("monk").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("acolyte").isBuffed).toBe(true);
    expect(game.state("acolyte").might).toBe(3);
    expect(game.state("scout").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("a friendly unit AT A BATTLEFIELD is a legal recipient; enemy units are never offered", async () => {
    const game = await board().build();
    await game.p1.activate("monk", 0, { targets: "scout" });
    await game.settle();
    expect(game.state("scout").might).toBe(4);
    const enemy = await board().build();
    const r = await enemy.p1.try((p) => p.activate("monk", 0, { targets: "foe" }));
    expect(r.ok).toBe(false);
    expect(enemy.state("foe").isBuffed).toBe(false);
    expect(enemy.state("monk").isExhausted).toBe(false);
  });

  test("already-buffed unit: still a legal choice, costs are paid, but no second buff lands (426.1.c / 702.3)", async () => {
    const game = await board(2).unit(P1, "base", { might: 2, name: "Veteran" }, "vet", { buffed: true }).build();
    expect(game.state("vet").might).toBe(3);
    await game.p1.activate("monk", 0, { targets: "vet" });
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.state("vet").isBuffed).toBe(true);
    expect(game.state("vet").might).toBe(3);
  });

  test("the buff persists across turns; the legend readies in its controller's Awaken Phase and can go again", async () => {
    const game = await board(1).build();
    await game.p1.activate("monk", 0, { targets: "acolyte" });
    await game.settle();
    expect(game.p1.can("activate", "monk")).toBe(false); // exhausted
    await game.advanceTurn(); // → P2
    expect(game.state("acolyte").might).toBe(3);
    expect(game.state("monk").isExhausted).toBe(true); // P2's Awaken does not ready P1's legend
    await game.advanceTurn(); // → P1 (Awaken readies the Monk; 2 runes channeled)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("monk").isExhausted).toBe(false);
    expect(game.state("acolyte").might).toBe(3);
    await game.p1.tapRune();
    await game.p1.activate("monk", 0, { targets: "scout" });
    await game.settle();
    expect(game.state("scout").might).toBe(4);
    expect(game.state("acolyte").might).toBe(3);
  });

  test("cost: not offered with 0 energy and no runes; not offered while the legend is exhausted; a ready rune funds the [1]", async () => {
    const broke = await board(0).build();
    expect(broke.p1.can("activate", "monk")).toBe(false);
    const spent = await scenario().resources(P1, { energy: 3 }).card("monk", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" }).unit(P1, "base", { might: 2 }, "acolyte").build();
    expect(spent.state("monk").isExhausted).toBe(true);
    expect(spent.p1.can("activate", "monk")).toBe(false);
    const runeFunded = await board(0).runes(P1, "calm", 1).build();
    expect(runeFunded.p1.can("activate", "monk")).toBe(true);
    await runeFunded.p1.activate("monk", 0, { targets: "acolyte" });
    await runeFunded.settle();
    expect(runeFunded.p1.runes({ ready: true })).toHaveLength(0);
    expect(runeFunded.p1.energy()).toBe(0);
    expect(runeFunded.state("acolyte").might).toBe(3);
  });

  test("no friendly unit on the board → the targeted ability cannot be activated at all", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).legend(P1, CARD, "monk").unit(P2, "base", { might: 2 }, "foe").build();
    expect(game.p1.can("activate", "monk")).toBe(false);
  });

  test("timing: not during a showdown, not while a chain is open, not on the opponent's turn (no [Action]/[Reaction])", async () => {
    const showdown = await scenario()
      .resources(P1, { energy: 5 })
      .legend(P1, CARD, "monk")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "foe")
      .unit(P1, "base", { might: 3 }, "acolyte")
      .autoProcedures(false)
      .build();
    await showdown.p1.move("acolyte", "bf1");
    expect((showdown.decision() as ActionDecision).context).toBe("showdown");
    expect(showdown.p1.can("activate", "monk")).toBe(false);

    const chainOpen = await board(5).battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 5 }, "anvil").hand(P1, DISINTEGRATE, "dis").build();
    await chainOpen.p1.cast("dis", { targets: "anvil" });
    expect(chainOpen.chain()).toHaveLength(1);
    expect(chainOpen.p1.can("activate", "monk")).toBe(false);
    await chainOpen.settle();
    expect(chainOpen.p1.can("activate", "monk")).toBe(true);

    const oppTurn = await board(5).active(P2).build();
    expect(oppTurn.p1.can("activate", "monk")).toBe(false);
  });

  test("the ability uses the chain: the opponent gets priority before the buff lands", async () => {
    const game = await board().build();
    await game.p1.activate("monk", 0, { targets: "acolyte" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "monk", controller: P1 })]);
    expect(game.state("acolyte").isBuffed).toBe(false);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("acolyte").isBuffed).toBe(true);
  });

  test("partner — Lee Sin, Ascetic ('any number of buffs') takes a SECOND buff from the Monk: 5 → 6 → 7", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).legend(P1, CARD, "monk").unit(P1, "base", LEE_SIN_ASCETIC, "ascetic").build();
    expect(game.state("ascetic").might).toBe(5);
    await game.p1.activate("ascetic"); // [Exhaust]: Buff me.
    await game.settle();
    expect(game.state("ascetic").might).toBe(6);
    await game.p1.activate("monk", 0, { targets: "ascetic" });
    await game.settle();
    expect(game.state("ascetic").isBuffed).toBe(true);
    expect(game.state("ascetic").might).toBe(7);
  });

  test("partner — Lee Sin, Centered: a unit the Monk buffs at his battlefield gets +1 (buff) +2 (static) = +3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, CARD, "monk")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEE_SIN_CENTERED, "centered")
      .unit(P1, "bf1", { might: 2, name: "Disciple" }, "disciple")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home", { buffed: true })
      .build();
    expect(game.state("disciple").might).toBe(2);
    expect(game.state("home").might).toBe(3); // buffed but not at Centered's battlefield → only +1
    await game.p1.activate("monk", 0, { targets: "disciple" });
    await game.settle();
    expect(game.state("disciple").might).toBe(5);
    expect(game.state("centered").might).toBe(6); // "Other" — never himself
  });
});
