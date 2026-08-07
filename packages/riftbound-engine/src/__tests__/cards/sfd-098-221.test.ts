/**
 * Sea Monkey — sfd-098-221 · Unit · Body · 2 energy · 2 might
 *
 *   You may pay [1] as an additional cost to play me.
 *   When you play me, if you paid the additional cost, buff me. (Give me a +1 [Might] buff if I
 *   don't already have one.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *  1. Optional additional cost (356.2.b): 2 energy plain / 3 energy paid; with exactly 2 energy only
 *     the plain play is legal; the [1] is generic energy — no power of any domain is involved.
 *  2. The buff comes from a PLAY TRIGGER on the chain (383.4.a.2), not instantly: before it resolves
 *     Sea Monkey is an unbuffed 2; the opponent may respond (Reaction) and kill it first → the trigger
 *     resolves on nothing, no crash, no stray buff.
 *  3. Declined cost → the trigger's "if you paid" is false → no buff (and no phantom chain item that
 *     does something).
 *  4. A buff is a counter object (701): +1 Might, at most one per unit — a later "buff" (Pit Rookie)
 *     on the already-buffed Monkey changes nothing; it persists across turns (not "this turn"); it can
 *     be SPENT later (Wallop) dropping it back to 2; it is removed if the unit leaves play.
 *  5. Lethality uses buffed Might: a paid Sea Monkey (3) survives 2 combat damage that kills a plain one.
 *  6. "When you buff a friendly unit" listeners (Mistfall) see the trigger's buff.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-098-221";
const PIT_ROOKIE = "ogn-136-298"; // 2-cost Body unit: When you play me, buff another friendly unit.
const WALLOP = "ogn-146-298"; // 2-cost Body [Action]: may spend a buff as additional cost (→ free). Ready a unit.
const MISTFALL = "ogn-152-298"; // 3-cost Body gear: When you buff a friendly unit, you may pay [body] and exhaust this to ready it.
const ZAP = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Zap",
  rulesText: "[Reaction] Deal 2 to a unit.",
  timing: "reaction",
};

function inHand(energy: number) {
  return scenario().resources(P1, { energy }).hand(P1, CARD, "monkey");
}

describe("Sea Monkey (sfd-098-221)", () => {
  test("parsed abilities: an optional [1] additional-cost static + a play trigger that buffs self only if the cost was paid", async () => {
    const abilities = (await import("../../../../riftbound-cards/src/data/all-cards")).getAllCards().find((c) => c.id === CARD)?.abilities as unknown as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { optional: true, type: "additional-cost-option" }, type: "static" });
    expect(JSON.stringify((abilities[0] as { effect: { additionalCost: unknown } }).effect.additionalCost)).toMatch(/energy_1|"energy":1/);
    expect(abilities[1]).toEqual({
      condition: { type: "paid-additional-cost" },
      effect: { target: "self", type: "buff" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });

  test("plain play: 2 energy, no power; enters exhausted as an unbuffed 2; 1 energy is not enough", async () => {
    const game = await inHand(2).build();
    expect(game.p1.option("play", "monkey")?.fields.find((f) => f.arg === "payOptional")?.options ?? [false]).not.toContain(true);
    await game.p1.play("monkey", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("monkey")).toBe("base");
    expect(game.state("monkey")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
    expect((await inHand(1).build()).p1.can("play", "monkey")).toBe(false);
  });

  test("paying the extra [1]: 3 energy total, the play trigger goes on the chain, and on resolution Sea Monkey is buffed to 3", async () => {
    const game = await inHand(3).build();
    expect(game.p1.option("play", "monkey")?.fields.find((f) => f.arg === "payOptional")?.options).toContain(true);
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("monkey")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "monkey", controller: P1, triggered: true })]);
    expect(game.state("monkey")).toMatchObject({ isBuffed: false, might: 2 }); // not before the trigger resolves
    await game.settle();
    expect(game.state("monkey")).toMatchObject({ baseMight: 2, isBuffed: true, might: 3 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("declining with 3 energy available: only 2 spent, no buff", async () => {
    const game = await inHand(3).build();
    await game.p1.play("monkey", { payOptional: false, to: "base" });
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.state("monkey")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("with exactly 2 energy the paid variant is refused and nothing is spent; the plain play still works", async () => {
    const game = await inHand(2).build();
    const t = await game.p1.try((p) => p.play("monkey", { payOptional: true, to: "base" }));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("monkey")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
    await game.p1.play("monkey", { to: "base" });
    await game.settle();
    expect(game.zoneOf("monkey")).toBe("base");
  });

  test("the [1] is generic energy: power of any domain cannot stand in for it (2 energy + 1 body → no paid variant)", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { body: 1 } }).hand(P1, CARD, "monkey").build();
    expect(game.p1.option("play", "monkey")?.fields.find((f) => f.arg === "payOptional")?.options ?? [false]).not.toContain(true);
    await game.p1.play("monkey", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
  });

  test("the buff persists across turns (it is a counter, not a 'this turn' effect)", async () => {
    const game = await inHand(3).build();
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("monkey")).toMatchObject({ isBuffed: true, isReady: true, might: 3 });
  });

  test("one buff max (701): Pit Rookie 'buffing' the already-buffed Monkey leaves it at 3", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "monkey").hand(P1, PIT_ROOKIE, "rookie").build();
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    await game.settle();
    expect(game.state("monkey").might).toBe(3);
    await game.p1.play("rookie", { to: "base" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("monkey");
      await game.settle();
    }
    expect(game.zoneOf("rookie")).toBe("base");
    expect(game.state("monkey")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("rookie").isBuffed).toBe(false); // "another" — never itself
  });

  test("the buff can be spent later: Wallop's optional buff-cost removes it (back to 2 Might) and makes Wallop free", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 4, name: "Tired" }, "tired", { exhausted: true })
      .hand(P1, CARD, "monkey")
      .hand(P1, WALLOP, "wallop")
      .build();
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("monkey").isBuffed).toBe(true);
    await game.p1.cast("wallop", { payOptional: true, targets: "tired" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("monkey")).toMatchObject({ isBuffed: false, might: 2 });
    await game.settle();
    expect(game.state("tired").isReady).toBe(true);
  });

  test("responding to the play trigger: the opponent Zaps (2) the still-unbuffed 2-Might Monkey — it dies, the trigger then fizzles cleanly", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "monkey").hand(P2, ZAP, "zap").build();
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.cast("zap", { targets: "monkey" });
    expect(game.chain()).toHaveLength(2);
    await game.settle();
    expect(game.zoneOf("monkey")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test.failing("BUG: while P1 still holds priority over the pending play trigger, P2's Reaction is not yet legal (one decision cursor at a time)", async () => {
    // Expected: right after the paid play only P1 may act; P2 gets priority once P1 passes.
    // Actual: the `singleDecisionCursor` invariant reports priority-class moves legal for both seats.
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "monkey").hand(P2, ZAP, "zap").build();
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "zap")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: 'buff ME' must do nothing once Sea Monkey has left the board — killed in response, it sits in the trash unbuffed (701: buffs are removed when a unit leaves play)", async () => {
    // Expected: the trigger resolves with its source gone → no buff anywhere. Actual: the card in the
    // trash is flagged buffed.
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "monkey").hand(P2, ZAP, "zap").build();
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    await game.p1.passPriority();
    await game.p2.cast("zap", { targets: "monkey" });
    await game.settle();
    expect(game.zoneOf("monkey")).toBe("trash");
    expect(game.state("monkey").isBuffed).toBe(false);
  });

  test("once the trigger has resolved, the buffed 3-Might Monkey survives the same 2 damage that kills a plain one", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "monkey").hand(P1, ZAP, "zap").build();
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    await game.settle(); // both pass → buffed
    expect(game.state("monkey").might).toBe(3);
    await game.p1.cast("zap", { targets: "monkey" });
    await game.settle();
    expect(game.zoneOf("monkey")).toBe("base");
    expect(game.state("monkey").damage).toBe(2);
    const plain = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "monkey").hand(P1, ZAP, "zap").build();
    await plain.p1.play("monkey", { to: "base" });
    await plain.settle();
    await plain.p1.cast("zap", { targets: "monkey" });
    await plain.settle();
    expect(plain.zoneOf("monkey")).toBe("trash");
  });

  test("combat: a paid Monkey (3) defending against a 2-Might attacker survives and holds; a plain one (2) trades", async () => {
    const defending = (buffed: boolean) =>
      scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "monkey", buffed ? { buffed: true } : undefined).unit(P2, "base", { might: 2, name: "Raider" }, "raider").build();
    const paid = await defending(true);
    expect(paid.state("monkey").might).toBe(3);
    await paid.p2.move("raider", "bf1");
    await paid.settle();
    expect(paid.zoneOf("raider")).toBe("trash");
    expect(paid.locationOf("monkey")).toBe("bf1");
    expect(paid.gameState.battlefields.bf1?.controller).toBe(P1);
    const plain = await defending(false);
    await plain.p2.move("raider", "bf1");
    await plain.settle();
    expect(plain.zoneOf("monkey")).toBe("trash");
    expect(plain.zoneOf("raider")).toBe("trash");
  });

  const withMistfall = () => scenario().resources(P1, { energy: 3, power: { body: 1 } }).gear(P1, MISTFALL, "mist").hand(P1, CARD, "monkey").build();

  test("Mistfall sees the trigger's buff: 'when you buff a friendly unit' offers to pay [body] + exhaust Mistfall to ready the freshly played Monkey", async () => {
    const game = await withMistfall();
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    await game.settle();
    expect(game.state("monkey").isBuffed).toBe(true);
    // Mistfall's optional trigger: accept it.
    for (let i = 0; i < 4 && game.decision()?.kind !== "action"; i++) {
      const d = game.decision()!;
      if (d.kind === "yes-no") await game.p1.yes();
      else if (d.kind === "pick") await game.p1.pick(d.options[0]!.key);
      await game.settle();
    }
    expect(game.state("mist").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
    expect(game.state("monkey")).toMatchObject({ isBuffed: true, isReady: true, might: 3 });
  });

  test("negative: Mistfall never triggers off an unpaid (unbuffed) Sea Monkey", async () => {
    const game = await withMistfall();
    await game.p1.play("monkey", { payOptional: false, to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("mist").isReady).toBe(true);
    expect(game.p1.power("body")).toBe(1);
    expect(game.state("monkey")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
  });
});
