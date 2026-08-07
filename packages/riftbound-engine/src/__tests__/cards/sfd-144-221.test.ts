/**
 * Spirit Wheel — sfd-144-221 · Gear · Chaos · 2 energy (no power)
 *
 *   When you choose a friendly unit, you may pay [1] and exhaust this to draw 1.
 *
 * Rules: 383.4.b (Targeting Effect: "choose" = a friendly unit becomes the TARGET of one of my
 * spells/abilities; the trigger is put on the chain right after that spell is finalized, above
 * it), 355.7/355.10 (what is and is not a target — mass effects and standard moves choose
 * nothing), 149.1/359.2.d (gear enters ready in base), 444.2 (may pay; unpayable → ignored).
 *
 * Head-judge corner cases for THIS card:
 *  1. Trigger sits ABOVE the targeting spell and resolves first (draw happens even before the
 *     spell resolves); "pay [1] and exhaust this" is ONE cost — 0 energy or already exhausted
 *     means the option cannot be taken and nothing is drawn.
 *  2. "you choose": an OPPONENT choosing my unit is not me choosing → no trigger.
 *  3. "friendly unit": my spell choosing an ENEMY unit → no trigger.
 *  4. Non-targeting effects (On the Hunt "Ready your units") and the Standard Move choose nothing.
 *  5. Repeat spell choosing friendly units twice → two triggers, but the wheel exhausts on the
 *     first payment so at most ONE card is drawn.
 *  6. Exhausted wheel readies in my next Awaken and works again that turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-144-221";
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.
const FERAL_STRENGTH = "sfd-034-221"; // Reaction · 2 · Repeat [2] · Give a unit +2 Might this turn.
const ON_THE_HUNT = "sfd-204-221"; // 1 + [rainbow]x2 · Ready your units.
const CHARM = "ogn-043-298"; // 1 + [calm] · Move an enemy unit.

function board(energy = 3, wheelMeta?: { exhausted?: boolean }) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: null })
    .gear(P1, CARD, "wheel", wheelMeta)
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, DISCIPLINE, "disc");
}

describe("Spirit Wheel (sfd-144-221)", () => {
  test("playing it: costs 2 energy, enters the base READY as gear, puts nothing on the chain; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "wheel").build();
    await game.p1.play("wheel");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("wheel")).toBe("base");
    expect(game.state("wheel")).toMatchObject({ cardType: "gear", isReady: true });
    expect(game.p1.gear()).toEqual(["wheel"]);
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "wheel").build()).p1.can("play", "wheel")).toBe(false);
  });

  test("my Discipline on my Ally: trigger goes ABOVE the spell, resolves first; yes → pay 1, wheel exhausts, draw 1 — then Discipline resolves (+2, draw 1)", async () => {
    const game = await board(3).build();
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.p1.energy()).toBe(1);
    expect(game.chain().map((c) => [c.name, c.triggered])).toEqual([
      ["Discipline", false],
      ["Spirit Wheel", true],
    ]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0); // rule 383.3.b.1: cost paid at finalization
    expect(game.state("wheel").isExhausted).toBe(true);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(1); // drawn before Discipline resolved
    expect(game.chain().map((c) => c.name)).toEqual(["Discipline"]);
    expect(game.state("ally").might).toBe(2);
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  test("declining: no energy paid, wheel stays ready, only Discipline's own draw", async () => {
    const game = await board(3).build();
    await game.p1.cast("disc", { targets: "ally" });
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.state("wheel").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("cost is 'pay [1] AND exhaust': with 0 energy left the option cannot be accepted and nothing is drawn", async () => {
    const game = await board(2).build();
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    if (game.decision()?.kind === "yes-no") {
      expect(game.decision()).toMatchObject({ canAccept: false });
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.state("wheel").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(1); // Discipline's draw only
  });

  test("an already-EXHAUSTED wheel cannot pay its cost: still no extra draw even with spare energy", async () => {
    const game = await board(5, { exhausted: true }).build();
    await game.p1.cast("disc", { targets: "ally" });
    if (game.decision()?.kind === "yes-no") {
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("'friendly unit': my spell choosing an ENEMY unit (Discipline on Foe, Charm on Foe) triggers nothing", async () => {
    const game = await board(3).build();
    await game.p1.cast("disc", { targets: "foe" });
    expect(game.chain().map((c) => c.name)).toEqual(["Discipline"]);
    await game.settle();
    expect(game.state("wheel").isReady).toBe(true);
    const charm = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .gear(P1, CARD, "wheel")
      .unit(P2, "bf1", { might: 2 }, "foe")
      .hand(P1, CHARM, "charm")
      .build();
    await charm.p1.cast("charm", { targets: "foe" });
    expect(charm.chain().map((c) => c.name)).toEqual(["Charm"]);
  });

  // BUG — expected (383.4.b, "When YOU choose"): P2's Discipline targeting my Ally is P2 choosing,
  // so only Discipline is on the chain and my wheel/energy/hand are untouched. Actual: the enemy
  // targeting also queues a Spirit Wheel trigger (chain = [Discipline, Spirit Wheel]).
  test("'you choose' — the OPPONENT choosing my Ally with their Discipline must not trigger my wheel", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .resources(P1, { energy: 3 })
      .gear(P1, CARD, "wheel")
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P2, DISCIPLINE, "disc")
      .build();
    await game.p2.cast("disc", { targets: "ally" });
    expect(game.chain().map((c) => c.name)).toEqual(["Discipline"]);
    await game.settle();
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.state("ally").might).toBe(4);
  });

  test("non-targeting effects choose nothing: On the Hunt ('Ready your units') and a Standard Move put no wheel trigger on the chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .gear(P1, CARD, "wheel")
      .unit(P1, "base", { might: 2 }, "ally", { exhausted: true })
      .hand(P1, ON_THE_HUNT, "hunt")
      .build();
    await game.p1.cast("hunt");
    expect(game.chain().map((c) => c.name)).toEqual(["On the Hunt"]);
    await game.settle();
    expect(game.state("ally").isReady).toBe(true);
    await game.p1.move("ally", "bf1");
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.state("wheel").isReady).toBe(true);
  });

  function repeatBoard() {
    return scenario()
      .resources(P1, { energy: 6 })
      .gear(P1, CARD, "wheel")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P1, "base", { might: 1 }, "pal")
      .hand(P1, FERAL_STRENGTH, "fs");
  }

  test("Repeat spell choosing Ally + Pal: however many triggers fire, only ONE can be paid (wheel exhausts) → exactly 1 card drawn, 1 energy spent", async () => {
    const game = await repeatBoard().build();
    await game.p1.cast("fs", { repeat: 1, targets: ["ally", "pal"] });
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()[0]).toMatchObject({ name: "Feral Strength", triggered: false });
    expect(game.chain().slice(1).every((c) => c.name === "Spirit Wheel" && c.triggered)).toBe(true);
    await game.settle({ policy: "first" }); // say yes whenever it is payable
    expect(game.state("wheel").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("ally").might).toBe(4);
    expect(game.state("pal").might).toBe(3);
  });

  // BUG — expected: choosing two friendly units (one per execution, 820.2.a) is two targeting
  // events → exactly two Spirit Wheel triggers above Feral Strength. Actual: three triggers are queued.
  test("a Repeat spell choosing two friendly units queues exactly TWO wheel triggers", async () => {
    const game = await repeatBoard().build();
    await game.p1.cast("fs", { repeat: 1, targets: ["ally", "pal"] });
    expect(game.chain().map((c) => c.name)).toEqual(["Feral Strength", "Spirit Wheel", "Spirit Wheel"]);
  });

  test("across turns: an exhausted wheel readies in my Awaken and pays again on my next turn", async () => {
    const game = await board(3).runes(P1, "chaos", 2).hand(P1, DISCIPLINE, "disc2").build();
    await game.p1.cast("disc", { targets: "ally" });
    await game.p1.yes();
    await game.settle();
    expect(game.state("wheel").isExhausted).toBe(true);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.state("wheel").isReady).toBe(true);
    await game.p1.tapRunes(3);
    const before = game.p1.hand().length;
    await game.p1.cast("disc2", { targets: "ally" });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("wheel").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(before - 1 + 2);
  });

  test("parsed abilities: one optional 'choose a friendly unit' trigger whose cost is 1 energy + exhaust and whose effect draws 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "chaos", energyCost: 2 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { cost: { energy: 1, exhaust: true }, type: "pay-cost" },
      effect: { amount: 1, type: "draw" },
      optional: true,
      trigger: { event: "choose", on: { cardType: "unit", controller: "friendly" } },
      type: "triggered",
    });
  });
});
