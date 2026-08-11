/**
 * Fire Below the Mountain — sfd-189-221 · Legend (Ornn) · Calm/Mind
 *
 *   [Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play gear or use gear abilities.
 *   (Abilities that add resources can't be reacted to.)
 *
 * Rules: 429.2 (Add abilities resolve as soon as they are finalized — never a chain item), 429.3
 * (a [Reaction] Add may be used whenever a cost is being paid), 429.4-ish earmark ("Use only to …"
 * restricts what the added resource may pay for), 135.2.e.5.a (a pooled [rainbow] pays a pip of any
 * domain), 316.5.b (Reaction adds CLOSED states — it is not a licence to act in the opponent's
 * Neutral Open state), 811.1.c.1 (Hide is not Play), 818 (Equip is a gear ABILITY), 819 (Quick-Draw
 * gear has Reaction and attaches on play).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. It adds ONE power usable as any domain — the [calm] pip of Doran's Shield's Equip (a gear
 *     ability) and the [calm] play pip of Svellsongur (a gear) both qualify; energy is never added.
 *  2. The earmark is the whole card: that power must NOT pay a unit's pip, a spell's pip, a legend/unit
 *     ability, or a Hide cost (hiding is not playing — even hiding a GEAR with [Hidden] is not "play gear").
 *  3. [Reaction]: usable inside a chain / showdown on either turn (e.g. to fund a Quick-Draw Sterak's
 *     Gage as a combat trick), but not in the opponent's Neutral Open state; it never joins the chain
 *     and never hands priority away.
 *  4. [Exhaust] is the entire cost: free of energy, once per ready-cycle; an exhausted legend offers
 *     nothing; the legend readies in its controller's next Awaken step and can go again.
 *  5. Unspent, the power simply empties with the pool at end of turn — no carry-over.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-189-221";
const DORANS_SHIELD = "sfd-033-221"; // Calm Equipment · 1 · +1 · [Equip] [calm]
const SVELLSONGUR = "sfd-059-221"; // Calm Equipment · 3 + [calm] · +0 · [Equip] [1][calm]
const STERAKS_GAGE = "sfd-056-221"; // Calm Equipment · 3 + [calm][calm] · +3 · [Quick-Draw] [Equip] [calm]
const EDGE_OF_NIGHT = "sfd-139-221"; // Chaos Equipment · 3 · +2 · [Hidden] …
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 + [fury]: Deal 3 to a unit at a battlefield.
const PIP_UNIT = { cardType: "unit", domain: "calm", energyCost: 0, might: 1, name: "Pip Unit", powerCost: ["calm"] };
const PIP_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Pip Bolt",
  powerCost: ["mind"],
  timing: "action",
};

describe("Fire Below the Mountain (sfd-189-221)", () => {
  test("registry payload: one activated [Exhaust] Reaction ability that Adds a single [rainbow] power earmarked for gear", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Ornn", domain: ["calm", "mind"], name: "Fire Below the Mountain" });
    expect(def?.abilities).toEqual([
      { cost: { exhaust: true }, effect: { power: ["rainbow"], restriction: "gear", type: "add-resource" }, timing: "reaction", type: "activated" },
    ]);
  });

  test("[Exhaust]: [Add] [rainbow] — exhausts the legend, adds exactly one rainbow power and no energy, resolves at once with nothing on the chain (429.2)", async () => {
    const game = await scenario().legend(P1, CARD, "ornn").build();
    expect(game.state("ornn").isReady).toBe(true);
    expect(game.p1.can("activate", "ornn")).toBe(true);
    await game.p1.activate("ornn");
    expect(game.state("ornn").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "ornn")).toBe(false); // [Exhaust] is the whole cost: once per ready-cycle
    expect(game.violations()).toEqual([]);
  });

  test("an already-exhausted legend cannot activate", async () => {
    const game = await scenario().card("ornn", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" }).build();
    expect(game.p1.can("activate", "ornn")).toBe(false);
  });

  test("'use gear abilities': the rainbow pays the [calm] pip of Doran's Shield's Equip — attach, +1, pool empty", async () => {
    const game = await scenario().legend(P1, CARD, "ornn").unit(P1, "base", { might: 2 }, "ally").gear(P1, DORANS_SHIELD, "shield").build();
    expect(game.p1.can("equipCard")).toBe(false);
    await game.p1.activate("ornn");
    expect(game.p1.can("equipCard")).toBe(true);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "shield", unitId: "ally" } });
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.state("shield").attachedTo).toBe("ally");
    expect(game.state("ally").might).toBe(3);
  });

  test("'play gear': the rainbow pays Svellsongur's [calm] PLAY pip (3 energy + it); afterwards its [1][calm] Equip is unaffordable again with the legend spent", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).legend(P1, CARD, "ornn").unit(P1, "base", { might: 2 }, "ally").hand(P1, SVELLSONGUR, "sv").build();
    expect(game.p1.can("play", "sv")).toBe(false);
    await game.p1.activate("ornn");
    expect(game.p1.can("play", "sv")).toBe(true);
    await game.p1.play("sv");
    expect(game.p1.resources().energy).toBe(1);
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.zoneOf("sv")).toBe("base");
    expect(game.p1.can("equipCard")).toBe(false); // 1 energy left but no calm/rainbow for the Equip pip
  });

  test("'Use ONLY to play gear or use gear abilities' — the added power must not pay a UNIT's power pip", async () => {
    // Expected: with the legend's rainbow as the only power, the [calm]-pip unit is NOT playable (a real calm power is the control).
    // Actual: the restriction is recorded for added ENERGY only; the rainbow power is spendable on anything.
    const control = await scenario().resources(P1, { power: { calm: 1 } }).legend(P1, CARD, "ornn").hand(P1, PIP_UNIT, "pip").build();
    expect(control.p1.can("play", "pip")).toBe(true);
    const game = await scenario().legend(P1, CARD, "ornn").hand(P1, PIP_UNIT, "pip").build();
    await game.p1.activate("ornn");
    expect(game.p1.power()).toBe(1);
    expect(game.p1.can("play", "pip")).toBe(false);
  });

  test("the earmarked power must not pay a SPELL's power pip either", async () => {
    // Expected: Pip Bolt (0 + [mind]) stays uncastable when the only power is the gear-only rainbow. Actual: castable.
    const control = await scenario().resources(P1, { power: { mind: 1 } }).legend(P1, CARD, "ornn").unit(P2, "base", { might: 3 }, "foe").hand(P1, PIP_SPELL, "bolt").build();
    expect(control.p1.can("cast", "bolt")).toBe(true);
    const game = await scenario().legend(P1, CARD, "ornn").unit(P2, "base", { might: 3 }, "foe").hand(P1, PIP_SPELL, "bolt").build();
    await game.p1.activate("ornn");
    expect(game.p1.can("cast", "bolt")).toBe(false);
  });

  test("hiding is not playing (811.1.c.1) — the gear-only rainbow cannot pay the [rainbow] Hide cost, not even for a GEAR with [Hidden] (Edge of Night)", async () => {
    // Expected: with the legend's power as the only power, hide is not legal (a real chaos power is the control). Actual: legal.
    const control = await scenario().resources(P1, { power: { chaos: 1 } }).legend(P1, CARD, "ornn").battlefield("bf1", { controller: P1 }).hand(P1, EDGE_OF_NIGHT, "edge").build();
    expect(control.p1.can("hide", "edge")).toBe(true);
    const game = await scenario().legend(P1, CARD, "ornn").battlefield("bf1", { controller: P1 }).hand(P1, EDGE_OF_NIGHT, "edge").build();
    await game.p1.activate("ornn");
    expect(game.p1.can("hide", "edge")).toBe(false);
  });

  test("[Reaction] on the opponent's turn: not in their Neutral Open state (316.5.b), but legal once their spell opens a chain — it adds the power without joining or disturbing the chain", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5 }, "ally")
      .legend(P1, CARD, "ornn")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    expect(game.p1.can("activate", "ornn")).toBe(false);
    await game.p2.cast("ray", { targets: "ally" });
    await game.p2.passPriority();
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "ornn")).toBe(true);
    await game.p1.activate("ornn");
    expect(game.p1.resources().power).toEqual({ rainbow: 1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    expect(game.actingSeat()).toBe(P1); // priority did not move (429.2.a)
  });

  test("combat trick with Focus: defending, P1 exhausts the legend to fund Quick-Draw Sterak's Gage (3 + [calm][calm] with only one real calm) — 2+3 = 5 beats the 4-Might attacker", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .legend(P1, CARD, "ornn")
      .hand(P1, STERAKS_GAGE, "gage")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "gage")).toBe(false); // one calm short
    await game.p1.activate("ornn");
    expect(game.p1.can("play", "gage")).toBe(true);
    await game.p1.play("gage", { answers: ["squire"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("squire");
    }
    expect(game.p1.resources().energy).toBe(0);
    expect(game.p1.power()).toBe(0);
    // rule 819.1.d / 383.4.a.2 — the Quick-Draw attach resolves off the Chain.
    expect(game.state("squire").might).toBe(2);
    await game.settle();
    expect(game.state("squire").might).toBe(5);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("gage").attachedTo).toBe("squire");
  });

  test("unspent, the power empties with the pool at end of turn; the legend readies in P1's next Awaken step and can be used again", async () => {
    const game = await scenario().legend(P1, CARD, "ornn").build();
    await game.p1.activate("ornn");
    expect(game.p1.power()).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.power()).toBe(0);
    expect(game.state("ornn").isExhausted).toBe(true); // nobody readies it on the opponent's turn
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ornn").isReady).toBe(true);
    expect(game.p1.can("activate", "ornn")).toBe(true);
  });
});
