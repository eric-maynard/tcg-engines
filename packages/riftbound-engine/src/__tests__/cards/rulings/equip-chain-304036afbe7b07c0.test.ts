/**
 * Ruling 304036afbe7b07c0 — Long Sword (sfd-022-221) · Equipment · Fury · [2][fury]
 *   "[Quick-Draw] … [Equip] [fury]"
 *
 * Q: Does attaching Gear create a chain that can be reacted to?
 * A: Yes. [Equip] is an activated ability: you pay its cost, name the unit, the ability goes on the chain
 *    as a pending item and the state closes — the opponent may answer with Reactions before it resolves
 *    and the attach actually happens. Nuance: a gear PLAYED from hand with [Quick-Draw] resolves at once
 *    like any permanent (no window), but the "attach it to a unit you control" trigger it then produces
 *    IS a chain item and can be responded to.
 * Rules: 818.1 ([Equip] is an activated ability), 150.2.a / 377.3 (activating puts an item on the chain,
 *        state closes, reactions may answer), 337.2 (a permanent resolves immediately on finalization),
 *        819 ([Quick-Draw]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LONG_SWORD = "sfd-022-221";

/** [Reaction] "Deal 1 to a unit." */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

/** [Reaction] "Kill a unit." — the classic answer to an [Equip] on the chain. */
const SNIPE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Snipe",
  rulesText: "[Reaction] Kill a unit.",
  timing: "reaction",
} as const;

function equipBoard() {
  return scenario()
    .resources(P1, { power: { fury: 1 } })
    .gear(P1, LONG_SWORD, "sword")
    .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
    .hand(P2, STING, "sting")
    .hand(P2, SNIPE, "snipe");
}

describe("Ruling 304036afbe7b07c0 — [Equip] goes on the chain and can be answered", () => {
  test("activating [Equip] adds an ability item to the chain; nothing is attached yet and the state is Closed", async () => {
    const game = await equipBoard().build();
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["sword"]);
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.state("squire").attachments).toEqual([]);
    expect(game.state("squire").might).toBe(3); // no +2 yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("the opponent gets priority and may play a Reaction in response before it resolves", async () => {
    const game = await equipBoard().build();
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "sting")).toBe(true);
    await game.p2.cast("sting", { targets: "squire" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["sword", "sting"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // the Reaction resolves first (LIFO)
    expect(game.state("squire").damage).toBe(1);
    expect(game.state("sword").attachedTo).toBeUndefined(); // the [Equip] is still waiting
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("sword").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(5);
  });

  test("killing the named unit in response makes the [Equip] fizzle: the gear stays unattached in the base", async () => {
    const game = await equipBoard().build();
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    await game.p1.passPriority();
    await game.p2.cast("snipe", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  test("[Quick-Draw]: the gear PLAYED from hand resolves at once (it is in the base immediately) but its attach TRIGGER is a chain item the opponent may answer", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
      .hand(P1, LONG_SWORD, "sword")
      .hand(P2, SNIPE, "snipe")
      .build();
    await game.p1.play("sword");
    expect(game.zoneOf("sword")).toBe("base"); // the permanent itself never waited on the chain
    const chainNow = game.chain().map((i) => i.cardId);
    expect(chainNow).toEqual(["sword"]);
    expect(game.chain()[0]).toMatchObject({ triggered: true });
    expect(game.state("sword").attachedTo).toBeUndefined();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "snipe")).toBe(true);
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("squire");
    expect(game.violations()).toEqual([]);
  });
});
