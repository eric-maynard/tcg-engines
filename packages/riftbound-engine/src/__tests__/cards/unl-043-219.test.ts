/**
 * Enthusiastic Promoter — unl-043-219 · Unit · Calm · 3 energy (no power) · 2 Might
 *
 *   [Backline] (I must be assigned combat damage last.)
 *   When I hold, [Buff] all units here. (Give each a +1 [Might] buff if it doesn't have one.)
 *
 * Rules: 826 (Backline ≡ "assign me lethal damage after every other unit of my controller without
 * Backline"; among several Backline units any order, 826.4.b; Tank → plain → Backline, 465.2.c.6),
 * 383.4.d (hold effects: the unit must be AT the held battlefield during your Scoring Step, 315.2.b),
 * 383.3.d (simultaneous triggers of one controller: that player orders them), 702.2.a / 702.3 / 703
 * (a buff is a +1 Might counter, max one per unit, and it stays — it is not a "this turn" bonus).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "all units here" = every unit at the HELD battlefield, Promoter included; your units in base or
 *     at another battlefield you also hold get nothing.
 *  2. Buffs don't stack: an already-buffed ally stays at +1, and holding again next turn adds nothing.
 *  3. Backline is a restriction on the OPPONENT's assignment: with two plain 2-Might allies and 2
 *     incoming damage the attacker picks WHICH ally eats it, but any point on the Promoter is refused;
 *     with Tank + plain + Promoter the order is forced Tank → plain → Promoter; two Promoters alone
 *     may be hit in either order; a lone Promoter is hit normally.
 *  4. Simultaneous hold triggers (Trevor Snoozebottom's "play a Sprite here"): P1 orders them —
 *     Sprite first ⇒ the Sprite is "here" when the Buff resolves and gets +1 too.
 *  5. Hold is YOUR Scoring Step only; nothing on the opponent's turn start, nothing from base.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-043-219";
const TREVOR = "unl-048-219"; // Calm 3: [Shield] / When I hold, play a ready 3 [Might] Sprite unit token with [Temporary] here.

/** P2 is about to end the turn; P1 holds bf1 with the Promoter and friends spread around. */
function holding() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", CARD, "promo")
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P1, "bf1", { might: 2, name: "Veteran" }, "vet", { buffed: true })
    .unit(P1, "bf2", { might: 3, name: "Far" }, "far")
    .unit(P1, "base", { might: 3, name: "Homebody" }, "home");
}

describe("Enthusiastic Promoter (unl-043-219)", () => {
  test("cost: 3 energy, no power → 2-Might Backline unit, enters exhausted, no play effect; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "promo").build();
    await game.p1.play("promo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("promo")).toMatchObject({ baseMight: 2, isExhausted: true, might: 2, zone: "base" });
    expect(game.state("promo").keywords).toContain("Backline");
    expect(game.chain()).toEqual([]);
    expect((await scenario().resources(P1, { energy: 2, power: { calm: 2 } }).hand(P1, CARD, "x").build()).p1.can("play", "x")).toBe(false);
  });

  test("When I hold: the trigger waits on the chain in your Beginning Phase, then EVERY unit at that battlefield (Promoter included) is buffed; base / other-battlefield units are not; +1 point per held battlefield", async () => {
    const game = await holding().build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "promo", controller: P1, triggered: true })]);
    expect(game.state("ally").isBuffed).toBe(false); // not before resolution
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2); // bf1 + bf2
    expect(game.state("promo")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.state("far")).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.state("home")).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("702.3 — an already-buffed unit here does not get a second buff (Veteran stays 3); buffs persist and a second hold next turn adds nothing", async () => {
    const game = await holding().build();
    expect(game.state("vet").might).toBe(3);
    await game.advanceTurn(); // → P1: first hold
    expect(game.state("vet")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn(); // → P2
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 4 }); // a counter, not "this turn"
    await game.advanceTurn(); // → P1: second hold
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.state("promo")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("negative space — the opponent's turn start is not your hold; and a Promoter in BASE never triggers even when you hold elsewhere", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
      .unit(P1, "base", CARD, "promo")
      .build();
    await game.advanceTurn(); // → P2
    expect(game.state("anchor").isBuffed).toBe(false);
    expect(game.state("promo").isBuffed).toBe(false);
    await game.advanceTurn(); // → P1 holds bf1 with Anchor only
    expect(game.p1.points()).toBe(1);
    expect(game.state("anchor").isBuffed).toBe(false);
    expect(game.state("promo").isBuffed).toBe(false);
  });

  test("Backline (826.4.b): 2 damage into Promoter + two plain 2-Might allies — the attacker chooses which ALLY takes it, but putting it on the Promoter is refused", async () => {
    const game = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "promo")
      .unit(P1, "bf1", { might: 2, name: "A" }, "a")
      .unit(P1, "bf1", { might: 2, name: "B" }, "b")
      .unit(P2, "base", { might: 2, name: "Poker" }, "poker")
      .build();
    await game.p2.move("poker", "bf1");
    await game.settle();
    await game.p2.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 2 });
    expect((await game.p2.try((p) => p.distribute({ promo: 2 }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.distribute({ a: 1, promo: 1 }))).ok).toBe(false); // A lacks lethal first (465.2.c.3)
    await game.p2.distribute({ b: 2 });
    await game.p2.choose("resolveFullCombat:bf1"); // manual procedures: finish the combat
    await game.settle();
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("promo")).toBe("battlefield-bf1");
    expect(game.zoneOf("poker")).toBe("trash"); // took 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Backline in a real defence: a 3-Might raider must put lethal on the 3-Might Ally first — Ally dies, the 2-Might Promoter is untouched and keeps bf1, raider dies to 5", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "promo")
      .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("promo")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("465.2.c.6 — Tank → plain → Backline: 5 damage into Tank(2) + Plain(2) + Promoter(2) kills Tank and Plain, the Promoter survives on 1 (healed) and still holds bf1", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "promo")
      .unit(P1, "bf1", { might: 2, name: "Plain" }, "plain")
      .unit(P1, "bf1", { keywords: ["Tank"], might: 2, name: "Bulwark" }, "tank")
      .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
      .build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("tank")).toBe("trash");
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.state("promo")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("brute")).toBe("trash"); // 6 ≥ 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Backline only defers: two Promoters alone may be hit in either order (826.4.b), and a lone Promoter dies normally to a 2-Might attacker who conquers", async () => {
    const pair = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "p1")
      .unit(P1, "bf1", CARD, "p2")
      .unit(P2, "base", { might: 2, name: "Poker" }, "poker")
      .build();
    await pair.p2.move("poker", "bf1");
    await pair.settle();
    await pair.p2.choose("resolveFullCombat:bf1");
    expect(pair.decision()).toMatchObject({ kind: "distribute", seat: P2 });
    await pair.p2.distribute({ p2: 2 }); // the second one — legal
    await pair.p2.choose("resolveFullCombat:bf1");
    await pair.settle();
    expect(pair.zoneOf("p2")).toBe("trash");
    expect(pair.zoneOf("p1")).toBe("battlefield-bf1");

    const lone = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "promo").unit(P2, "base", { might: 2, name: "Poker" }, "poker").build();
    await lone.p2.move("poker", "bf1");
    await lone.settle();
    expect(lone.zoneOf("promo")).toBe("trash");
    expect(lone.zoneOf("poker")).toBe("trash"); // 2-for-2 trade
    expect(lone.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("partner — Trevor Snoozebottom holds beside it: with the Sprite played here BEFORE the Buff resolves, Promoter, Trevor and the fresh Sprite are all buffed (Sprite 4 Might)", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "promo").unit(P1, "bf1", TREVOR, "trevor").build();
    await game.p2.endTurn();
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["promo", "trevor"]);
    // 383.3.d: if the engine asks P1 to order them, put the Buff at the bottom (Sprite resolves first).
    const d = game.decision();
    if (d?.kind === "order") {
      const keys = d.items.map((i) => i.key);
      const promoKey = d.items.find((i) => i.card === "promo")?.key ?? keys[0]!;
      await game.p1.order([promoKey, ...keys.filter((k) => k !== promoKey)]);
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    const sprite = game.cardsAt("bf1").find((id) => game.state(id).name === "Sprite");
    expect(sprite).toBeDefined();
    expect(game.state(sprite!)).toMatchObject({ isBuffed: true, isToken: true, might: 4 });
    expect(game.state("promo")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("trevor").isBuffed).toBe(true);
    expect(game.p1.points()).toBe(1);
  });

  test("BUG: 383.3.d — two simultaneous hold triggers of the same controller (Promoter + Trevor) must let P1 CHOOSE their order; the engine stacks them itself and never asks", async () => {
    // Expected: with the Beginning Phase holding, P1 faces an `order` decision over the two pending
    // items (so P1 could also resolve the Buff first and leave the incoming Sprite unbuffed).
    // Actual: both items are already on the chain in engine order and P1 only gets priority to pass.
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "promo").unit(P1, "bf1", TREVOR, "trevor").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
  });

  test("registry payload matches the printed text: Backline keyword + hold trigger on self that buffs ALL units HERE (no controller filter, no 'other')", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 3, might: 2, name: "Enthusiastic Promoter" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Backline", type: "keyword" },
      {
        effect: { target: { location: "here", quantity: "all", type: "unit" }, type: "buff" },
        trigger: { event: "hold", on: "self" },
        type: "triggered",
      },
    ]);
  });
});
