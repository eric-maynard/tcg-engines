/**
 * Parser tests for reflexive triggers (rule 387 / 388): "<main>. Then [you may] do this[ N times]: <body>".
 * The body is emitted as `{ type: "reflexive", effect, times?, optional? }` sequenced after <main>;
 * the engine turns it into its own triggered chain item when <main> resolves.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

const effectOf = (text: string) => parseAbilities(text).abilities?.[0]?.effect as Record<string, any> | undefined;

describe("Effect: reflexive trigger ('do this:')", () => {
  it("'<main>. Then do this: <body>' → sequence [main, reflexive(body)]", () => {
    expect(effectOf("Draw 1. Then do this: Deal 2 to an enemy unit.")).toEqual({
      effects: [
        { amount: 1, type: "draw" },
        { effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" }, type: "reflexive" },
      ],
      type: "sequence",
    });
  });

  it("387.1.a — 'do this twice' / 'do this 3 times' carries `times` (one chain item per time)", () => {
    expect(effectOf("Draw 1. Then do this twice: Deal 1 to an enemy unit.")?.effects?.[1]).toMatchObject({ times: 2, type: "reflexive" });
    expect(effectOf("Draw 1. Then do this 3 times: Deal 1 to an enemy unit.")?.effects?.[1]).toMatchObject({ times: 3, type: "reflexive" });
  });

  it("'Then you may do this:' is an optional reflexive (opt-in when the item is finalized)", () => {
    expect(effectOf("Kill a unit. Then you may do this: Draw 2.")?.effects?.[1]).toEqual({
      effect: { amount: 2, type: "draw" },
      optional: true,
      type: "reflexive",
    });
  });

  it("387.2 — a bare leading 'Do this:' with no main instruction is just the reflexive node", () => {
    expect(effectOf("Do this: Draw 1.")).toEqual({ effect: { amount: 1, type: "draw" }, type: "reflexive" });
  });

  it("359.3.e.14 — a pronoun in the body ('Ready it' / 'two of them') is linked to what the main instruction produced (pending-value)", () => {
    expect(effectOf("Play a 3 [Might] Recruit unit token. Then do this: Ready it.")).toEqual({
      effects: [
        { token: { might: 3, name: "Recruit", type: "unit" }, type: "create-token" },
        { effect: { target: { type: "pending-value" }, type: "ready" }, type: "reflexive" },
      ],
      pendingValue: { source: 0 },
      type: "sequence",
    });
    expect(effectOf("Play two 2 [Might] Sand Soldier unit tokens. Then do this: Ready up to two of them.")?.effects?.[1]).toEqual({
      effect: { target: { quantity: { upTo: 2 }, type: "pending-value" }, type: "ready" },
      type: "reflexive",
    });
  });

  it("leaves CONDITIONED 'do this' clauses to their own parsers, but 'do this:' still makes the body reflexive (387.2/388.1)", () => {
    expect(effectOf("Deal 3 to a unit at a battlefield. If this kills it, do this: draw 1.")).toMatchObject({
      effects: [
        { type: "damage" },
        {
          condition: { type: "this-kills-target" },
          then: { effect: { amount: 1, type: "draw" }, type: "reflexive" },
          type: "conditional",
        },
      ],
      type: "sequence",
    });
    // no "do this:" wording ⇒ the rider stays inline
    expect(effectOf("Deal 2 to a unit at a battlefield. If this kills it, draw 1.")).toMatchObject({
      effects: [{ type: "damage" }, { condition: { type: "this-kills-target" }, then: { type: "draw" } }],
      type: "sequence",
    });
  });

  it("leaves the Look → banish → play idiom's 'Then you may do this: Empower it' on the look effect", () => {
    expect(
      effectOf(
        "Look at the top 5 cards of your Main Deck. You may banish a unit or gear from among them and play it, reducing its Energy cost by [5]. Recycle the rest. Then you may do this: Empower it.",
      ),
    ).toMatchObject({ followUp: { type: "optional" }, type: "look" });
  });
});
