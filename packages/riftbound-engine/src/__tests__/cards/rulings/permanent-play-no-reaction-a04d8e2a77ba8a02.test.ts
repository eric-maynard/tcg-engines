/**
 * Ruling a04d8e2a77ba8a02 — (no specific card) reacting to a permanent being played.
 *
 * Q: Can players react to a unit or gear being played? Can they react to its triggered abilities?
 * A: Playing a permanent makes a one-item chain that nobody can answer — the item is Pending while it
 *    is being played and is gone from the chain the moment it is Finalized. A "When I'm played"
 *    ability, by contrast, is a separate chain item that DOES linger, and it can be reacted to,
 *    with priority starting at the player who controls that ability.
 * Rules: 352.2 / 354.2 (Pending → Finalized), 337.1.a (finalizing passes no Priority),
 *        337.4 (the controller of the newest chain item receives Priority first),
 *        340.1 (LIFO resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** Vanilla permanents — nothing triggers. */
const VANILLA_UNIT = { cardType: "unit", domain: "fury", energyCost: 1, might: 3, name: "Test Recruit" } as const;
const VANILLA_GEAR = { cardType: "gear", domain: "fury", energyCost: 1, name: "Test Trinket" } as const;

/** The same shapes with a "When you play me" trigger. */
const TRIGGER_UNIT = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" }],
  cardType: "unit",
  domain: "fury",
  energyCost: 1,
  might: 3,
  name: "Test Scryer",
  rulesText: "When you play me, draw 1.",
} as const;
const TRIGGER_GEAR = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" }],
  cardType: "gear",
  domain: "fury",
  energyCost: 1,
  name: "Test Lantern",
  rulesText: "When you play me, draw 1.",
} as const;

/** [Reaction] "Deal 1 to a unit." — P2's would-be answer. */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 4 } })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, VANILLA_UNIT, "vunit")
    .hand(P1, VANILLA_GEAR, "vgear")
    .hand(P1, TRIGGER_UNIT, "tunit")
    .hand(P1, TRIGGER_GEAR, "tgear")
    .hand(P2, STING, "sting");
}

describe("Ruling a04d8e2a77ba8a02 — the permanent's play is unanswerable; its 'when played' ability is not", () => {
  test("a vanilla UNIT: chain empty afterwards, P1 still acting, P2's Reaction is not castable", async () => {
    const game = await board().build();
    await game.p1.play("vunit");
    expect(game.zoneOf("vunit")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "sting")).toBe(false);
    expect((await game.p2.try((p) => p.cast("sting", { targets: "ally" }))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("a vanilla GEAR behaves identically — no window at all", async () => {
    const game = await board().build();
    await game.p1.play("vgear");
    expect(game.zoneOf("vgear")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "sting")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("a unit WITH 'when you play me': the ability lingers, and priority starts with its controller (P1) before P2 may answer", async () => {
    const game = await board().build();
    await game.p1.play("tunit");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tunit", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // 337.4
    expect(game.p2.can("cast", "sting")).toBe(false); // not P2's turn to speak yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "sting")).toBe(true);
    await game.p2.cast("sting", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["tunit", "sting"]);
    await game.settle();
    expect(game.state("ally").damage).toBe(1); // the reaction resolved above the trigger
    expect(game.violations()).toEqual([]);
  });

  test("a gear WITH 'when you play me' opens the same window — the gear itself is already in play and untouchable", async () => {
    const game = await board().build();
    await game.p1.play("tgear");
    expect(game.zoneOf("tgear")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tgear", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sting")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
