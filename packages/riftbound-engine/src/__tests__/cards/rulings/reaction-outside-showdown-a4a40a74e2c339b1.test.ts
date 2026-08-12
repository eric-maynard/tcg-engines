/**
 * Ruling a4a40a74e2c339b1 — (no specific card) when can [Reaction] spells be played outside a showdown?
 *   Exercised with vanilla units, an inline gear, a unit with an activated ability, a "when you
 *   play me" unit, a base-speed spell, an [Action] spell and a [Reaction] spell.
 *
 * Q: When can you use [Reaction] spells in response to an opponent's abilities, spells or gear
 *    outside of a showdown?
 * A: Whenever they create a chain. A spell, a triggered ability or an activated ability puts an
 *    item on the chain (a Closed state) and every player may then answer with Reactions, even in
 *    the Neutral state outside a showdown. You cannot react to a gear or a unit being played,
 *    because permanents never linger on the chain. Action spells can only START a chain (Showdown
 *    or Neutral Open); base-speed spells only in a Neutral Open state.
 * Rules: 332/359.3 (a played spell lingers; permanents do not), 383 (triggered abilities are chain
 *        items), 402 (activated abilities are chain items), 342/343 (Neutral vs Showdown, Open vs
 *        Closed; Reaction timing is legal in all of them), 416.2 (an "Add" finalizes at once and
 *        cannot be reacted to).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRUNT = { cardType: "unit", domain: "fury", energyCost: 1, might: 3, name: "Test Grunt" } as const;

const TRINKET = {
  abilities: [],
  cardType: "gear",
  domain: "mind",
  energyCost: 1,
  name: "Test Trinket",
  rulesText: "",
} as const;

/** 3 Might · "[Exhaust]: Deal 1 to a unit." — an activated ability, so a real chain item. */
const ARTILLERIST = {
  abilities: [
    {
      cost: { exhaust: true },
      effect: { amount: 1, target: { type: "unit" }, type: "damage" },
      type: "activated",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 1,
  might: 3,
  name: "Test Artillerist",
  rulesText: "[Exhaust]: Deal 1 to a unit.",
} as const;

/** [Exhaust]: [Add] [fury]. — an "Add", which never uses the chain. */
const CRYSTAL = {
  abilities: [
    { cost: { exhaust: true }, effect: { power: ["fury"], type: "add-resource" }, timing: "reaction", type: "activated" },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 1,
  might: 3,
  name: "Test Crystal Bearer",
  rulesText: "[Exhaust]: [Add] [fury].",
} as const;

const SCRYER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" }],
  cardType: "unit",
  domain: "mind",
  energyCost: 1,
  might: 3,
  name: "Test Scryer",
  rulesText: "When you play me, draw 1.",
} as const;

const BASE_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Base Spell",
  rulesText: "Deal 1 to a unit.",
  timing: "standard",
} as const;

const ACTION_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Action Spell",
  rulesText: "[Action] Deal 1 to a unit.",
  timing: "action",
} as const;

const REACTION_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Reaction Spell",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

/** P2's turn, no battlefield contested anywhere: the Neutral state. P1 waits with a Reaction. */
const board = () =>
  scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { fury: 3, mind: 3 } })
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .unit(P1, "base", { might: 5, name: "Watcher" }, "watcher")
    .hand(P1, REACTION_SPELL, "react")
    .hand(P1, ACTION_SPELL, "action")
    .hand(P1, BASE_SPELL, "base");

describe("Ruling a4a40a74e2c339b1 — Reactions live off the chain, not off the showdown", () => {
  test("with nothing on the chain in the opponent's Neutral Open state, you have no window at all", async () => {
    const game = await board().hand(P2, GRUNT, "grunt").build();
    expect(game.p1.can("cast", "react")).toBe(false);
    expect(game.p1.can("cast", "action")).toBe(false);
    expect(game.p1.can("cast", "base")).toBe(false);
  });

  test("an opponent's SPELL creates a chain outside any showdown — Reactions become legal, Actions and base speed do not", async () => {
    const game = await board().hand(P2, ACTION_SPELL, "theirAction").build();
    await game.p2.cast("theirAction", { targets: "watcher" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["theirAction"]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P1 });
    expect(game.p1.can("cast", "react")).toBe(true);
    expect(game.p1.can("cast", "action")).toBe(false);
    expect(game.p1.can("cast", "base")).toBe(false);
  });

  test("an opponent's TRIGGERED ability does the same, even though the unit itself was unanswerable", async () => {
    const game = await board().hand(P2, SCRYER, "scryer").build();
    await game.p2.play("scryer");
    expect(game.zoneOf("scryer")).toBe("base"); // the unit itself was never reactable
    expect(game.chain().map((i) => i.cardId)).toEqual(["scryer"]);
    await game.p2.passPriority();
    expect(game.p1.can("cast", "react")).toBe(true);
  });

  test("an opponent's ACTIVATED ability does the same", async () => {
    const game = await board().unit(P2, "base", ARTILLERIST, "gunner").build();
    await game.p2.activate("gunner", 0, { answers: ["watcher"] });
    expect(game.chain().map((i) => i.cardId)).toEqual(["gunner"]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P1 });
    expect(game.p1.can("cast", "react")).toBe(true);
    await game.p1.cast("react", { targets: "gunner" });
    await game.settle();
    expect(game.state("gunner").damage).toBe(1);
  });

  test("you cannot react to a GEAR being played — it never lingers on the chain", async () => {
    const game = await board().hand(P2, TRINKET, "trinket").build();
    await game.p2.play("trinket");
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "react")).toBe(false);
  });

  test("…nor to a UNIT with no play trigger", async () => {
    const game = await board().hand(P2, GRUNT, "grunt").build();
    await game.p2.play("grunt");
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "react")).toBe(false);
  });

  test("…nor to anything that says 'Add': it finalizes at once and makes no chain", async () => {
    const game = await board().unit(P2, "base", CRYSTAL, "crystal").build();
    const before = game.p2.power("fury");
    await game.p2.activate("crystal", 0);
    expect(game.p2.power("fury")).toBe(before + 1); // already added
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "react")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
