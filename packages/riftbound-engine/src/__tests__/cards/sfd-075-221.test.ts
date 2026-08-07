/**
 * Prize of Progress — sfd-075-221 · Unit · Mind · 4 energy + [mind] · 3 might
 *
 *   When you use an activated ability of a gear, give me +1 [Might] this turn.
 *
 * Head-judge notes (trickiest situations for this card):
 *  - Only GEAR abilities YOU use: a legend ability, a unit ability, or the opponent using their own
 *    gear must not pump it. Equipment is gear and [Equip] is an activated ability keyword, so
 *    equipping counts (Equip onto the Prize itself: +2 bonus +1 trigger = 6 this turn, 5 next turn).
 *  - "When you use" triggers as the ability is activated (cf. 206.1's "when you play an activated
 *    ability" example), so the +1 goes on the chain ABOVE the gear ability and resolves first —
 *    visible with Orb of Regret aimed at the Prize: +1 then −1, net printed 3.
 *  - [Add] abilities (Seal of Insight) resolve immediately and can't be reacted to (429.2) but are
 *    still activated gear abilities: they trigger it too.
 *  - Each use is a separate trigger (+1 each); everything expires at end of turn; two Prizes each
 *    trigger off the same single use.
 *  - Plain body: 4 energy + 1 mind power, 3 might, enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-075-221";
const SEAL_OF_INSIGHT = "ogn-120-298"; // Gear · Mind · 0 energy + [mind] · [Exhaust]: [Reaction] — [Add] [mind]
const ORB_OF_REGRET = "ogn-090-298"; // Gear · Mind · [Exhaust]: Give a unit −1 Might this turn (min 1)
const WORLD_ATLAS = "sfd-086-221"; // Equipment · Mind · [Equip] [mind] · +2 Might
const HERALD_OF_THE_ARCANE = "ogn-265-298"; // Legend · [1], [Exhaust]: Play a 1-Might Recruit token
const TINKER = {
  abilities: [{ cost: { exhaust: true }, effect: { amount: 1, type: "draw" }, type: "activated" }],
  might: 2,
  name: "Tinker",
  rulesText: "[Exhaust]: Draw 1.",
};

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { mind: 1 } })
    .unit(P1, "base", CARD, "pp")
    .gear(P1, SEAL_OF_INSIGHT, "seal")
    .gear(P1, ORB_OF_REGRET, "orb")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe");
}

describe("Prize of Progress (sfd-075-221)", () => {
  test.failing("BUG: parsed trigger should be scoped to GEAR abilities; the payload has no gear qualifier (would also fire on legend/unit abilities)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, might: 3, powerCost: ["mind"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 1, duration: "turn", target: "self", type: "modify-might" },
      trigger: { event: "use-activated-ability", on: "controller" },
      type: "triggered",
    });
    expect(JSON.stringify((def?.abilities?.[0] as { trigger?: unknown })?.trigger)).toMatch(/gear/i);
  });

  test("cost: 4 energy + 1 mind for a 3-might unit that enters exhausted; missing the mind power or 1 energy short → not legal", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, CARD, "pp").build();
    await game.p1.play("pp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("pp")).toBe("base");
    expect(game.state("pp")).toMatchObject({ isExhausted: true, might: 3 });
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "pp").build()).p1.can("play", "pp")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "pp").build()).p1.can("play", "pp")).toBe(false);
  });

  test.failing("BUG: using Seal of Insight ([Exhaust]: Add [mind]) gives the Prize +1 Might this turn; it wears off next turn", async () => {
    // Expected: trigger → 4 might (mightModifier 1) until end of turn. Actual: no `use-activated-ability` event exists; stays 3.
    const game = await board().build();
    await game.p1.activate("seal");
    expect(game.p1.power("mind")).toBe(2); // the Add resolved immediately (429.2)
    await game.settle();
    expect(game.state("pp").might).toBe(4);
    expect(game.state("pp").mightModifier).toBe(1);
    expect(game.state("foe").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("pp").might).toBe(3);
  });

  test.failing("BUG: each use is its own trigger — Seal then Orb (on the enemy) makes it 3 → 5 this turn", async () => {
    const game = await board().build();
    await game.p1.activate("seal");
    await game.settle();
    await game.p1.activate("orb", 0, { targets: "foe" });
    await game.settle();
    expect(game.state("orb").isExhausted).toBe(true);
    expect(game.state("foe").might).toBe(2);
    expect(game.state("pp").might).toBe(5);
  });

  test.failing("BUG: chain order — Orb of Regret aimed at the Prize: the +1 trigger sits above the Orb ability and resolves first; net 3", async () => {
    const game = await board().build();
    await game.p1.activate("orb", 0, { targets: "pp" });
    // Orb's ability is chain item 1; the Prize trigger must be stacked on top of it.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "orb", triggered: false }),
      expect.objectContaining({ cardId: "pp", controller: P1, triggered: true }),
    ]);
    await game.settle();
    expect(game.state("pp").might).toBe(3); // +1 (trigger) then −1 (orb), both "this turn"
    await game.advanceTurn();
    expect(game.state("pp").might).toBe(3);
  });

  test.failing("BUG: [Equip] is an activated gear ability — equipping World Atlas onto the Prize gives 3 + 2 + 1 = 6 this turn, 5 next turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { mind: 1 } })
      .unit(P1, "base", CARD, "pp")
      .gear(P1, WORLD_ATLAS, "atlas")
      .build();
    await game.p1.choose("equipCard", { params: { equipmentId: "atlas", unitId: "pp" } });
    await game.settle();
    expect(game.state("atlas").attachedTo).toBe("pp");
    expect(game.state("pp").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("pp").might).toBe(5);
  });

  test.failing("BUG: two Prizes on the board each get +1 from one single gear activation", async () => {
    const game = await board().unit(P1, "base", CARD, "pp2").build();
    await game.p1.activate("seal");
    await game.settle();
    expect(game.state("pp").might).toBe(4);
    expect(game.state("pp2").might).toBe(4);
  });

  test("NOT a gear: using your LEGEND's activated ability (Herald of the Arcane) does not pump the Prize", async () => {
    const game = await board().legend(P1, HERALD_OF_THE_ARCANE, "herald").build();
    await game.p1.activate("herald");
    expect(game.p1.energy()).toBe(0);
    await game.settle({ policy: "first" });
    expect(game.state("herald").isExhausted).toBe(true);
    expect(game.state("pp").might).toBe(3);
    expect(game.state("pp").mightModifier).toBe(0);
  });

  test("NOT a gear: using a friendly UNIT's activated ability does not pump the Prize", async () => {
    const game = await board().unit(P1, "base", TINKER, "tinker").build();
    const handBefore = game.p1.hand().length;
    await game.p1.activate("tinker");
    await game.settle();
    expect(game.state("tinker").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.state("pp").might).toBe(3);
  });

  test("NOT you: the opponent using THEIR gear's ability on their turn does not pump my Prize", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", CARD, "pp")
      .gear(P2, SEAL_OF_INSIGHT, "theirSeal")
      .build();
    await game.p2.activate("theirSeal");
    expect(game.p2.power("mind")).toBe(1);
    await game.settle();
    expect(game.state("pp").might).toBe(3);
    expect(game.chain()).toEqual([]);
  });

  test("no gear ability used at all (just playing a gear) → no bonus", async () => {
    const game = await scenario().resources(P1, { energy: 0, power: { mind: 1 } }).unit(P1, "base", CARD, "pp").hand(P1, SEAL_OF_INSIGHT, "seal").build();
    await game.p1.play("seal");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.power("mind")).toBe(0);
    expect(game.state("pp").might).toBe(3);
  });
});
