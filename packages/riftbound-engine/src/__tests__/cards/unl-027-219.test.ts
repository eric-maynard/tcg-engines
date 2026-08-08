/**
 * Inviolus Vox — unl-027-219 · Unit · Fury · 8 energy + [fury][fury] · 8 Might
 *
 *   When I conquer, give a friendly unit +8 [Might] this turn.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - 383.4.c.2: "When I conquer" only triggers if Vox itself is PRESENT at the battlefield when
 *    control is established. A co-attacker conquering after Vox died in that combat, or another
 *    unit conquering elsewhere, must not trigger it. Holding (469.2) is not conquering.
 *  - The target is "a friendly unit" anywhere (base or any battlefield) — Vox may pick itself
 *    (no "another"/"other" restriction) and units in base are legal.
 *  - Mandatory (no "may"): with several friendly units the controller must choose; no decline.
 *  - "+8 this turn" is a temporary modification that ends at end of turn (game.advanceTurn()).
 *  - Conquer via combat (defender killed) and conquer of an empty battlefield both count.
 *  - Cost: 8 energy AND two fury power; a rainbow/universal power may stand in for a fury pip.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-027-219";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "vox")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally");
}

describe("Inviolus Vox (unl-027-219)", () => {
  test("conquering an empty enemy battlefield puts the trigger on the chain; the chosen friendly unit (in base) gets +8 this turn", async () => {
    const game = await board().build();
    await game.p1.move("vox", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "vox" } });
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally").might).toBe(10);
    expect(game.state("vox").might).toBe(8);
    expect(game.violations()).toEqual([]);
  });

  test("the trigger is mandatory: both friendly units are offered, min 1, no decline", async () => {
    const game = await board().build();
    await game.p1.move("vox", "bf1");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card).sort()).toEqual(["ally", "vox"]);
      expect(d.min).toBe(1);
      expect(d.max).toBe(1);
      expect(d.allowDecline).toBe(false);
    }
  });

  test("Vox may target itself (no 'another' restriction) → 16 Might this turn", async () => {
    const game = await board().build();
    await game.p1.move("vox", "bf1");
    await game.settle();
    await game.p1.pick("vox");
    await game.settle();
    expect(game.state("vox").might).toBe(16);
    expect(game.state("ally").might).toBe(2);
  });

  test("'+8 this turn' expires at end of turn", async () => {
    const game = await board().build();
    await game.p1.move("vox", "bf1");
    await game.settle();
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally").might).toBe(10);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ally").might).toBe(2);
    expect(game.state("vox").might).toBe(8);
  });

  test("with Vox as the only friendly unit the single legal target is taken and Vox ends at 16", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "vox").build();
    await game.p1.move("vox", "bf1");
    await game.settle(); // passive policy takes the forced single pick
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("vox").might).toBe(16);
  });

  test("conquering through combat (Vox kills a 3-Might defender) also triggers", async () => {
    const game = await board().unit(P2, "bf1", { might: 3, name: "Defender" }, "def").build();
    await game.p1.move("vox", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("vox").damage).toBe(0); // 466.1.a.1 — combat cleanup heals all units
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally").might).toBe(10);
  });

  test("383.4.c.2 — Vox dies in the combat while a co-attacker survives and conquers: NO Vox trigger", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 10, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "vox")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .script(P2, [{ allocation: { ally: 2, vox: 8 }, kind: "distribute" }])
      .build();
    await game.p1.move(["vox", "ally"], "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("vox")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // No pick pending, no chain item, ally un-pumped.
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain()).toEqual([]);
    expect(game.state("ally").might).toBe(3);
  });

  test("another friendly unit conquering while Vox sits in base does NOT trigger", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain()).toEqual([]);
    expect(game.state("ally").might).toBe(2);
    expect(game.state("vox").might).toBe(8);
  });

  test("holding is not conquering: Vox holding bf1 at the start of its turn scores but nothing is pumped", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "vox")
      .unit(P1, "base", { might: 2 }, "ally")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("vox").might).toBe(8);
    expect(game.state("ally").might).toBe(2);
  });

  test("an enemy unit is never a legal target for the pump", async () => {
    const game = await board().unit(P2, "base", { might: 1, name: "Foe" }, "foe").build();
    await game.p1.move("vox", "bf1");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card)).not.toContain("foe");
    }
    const r = await game.p1.try((p) => p.pick("foe"));
    expect(r.ok).toBe(false);
  });

  test("cost: 8 energy + [fury][fury] deducted, enters base exhausted at 8 Might; 1 fury or 7 energy is not enough; rainbow covers a fury pip", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { fury: 2 } }).hand(P1, CARD, "vox").build();
    await game.p1.play("vox");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("vox")).toBe("base");
    expect(game.state("vox")).toMatchObject({ baseMight: 8, isExhausted: true, might: 8 });
    expect((await scenario().resources(P1, { energy: 8, power: { fury: 1 } }).hand(P1, CARD, "vox").build()).p1.can("play", "vox")).toBe(false);
    expect((await scenario().resources(P1, { energy: 7, power: { fury: 2 } }).hand(P1, CARD, "vox").build()).p1.can("play", "vox")).toBe(false);
    expect((await scenario().resources(P1, { energy: 8, power: { fury: 1, rainbow: 1 } }).hand(P1, CARD, "vox").build()).p1.can("play", "vox")).toBe(true);
  });

  test("parsed abilities: one conquer trigger on self → modify-might +8, friendly unit, duration turn", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 8, might: 8, powerCost: ["fury", "fury"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 8, duration: "turn", target: { controller: "friendly", type: "unit" }, type: "modify-might" },
      trigger: { event: "conquer", on: "self" },
      type: "triggered",
    });
  });
});
