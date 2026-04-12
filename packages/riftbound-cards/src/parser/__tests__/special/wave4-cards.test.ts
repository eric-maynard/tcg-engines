/**
 * Wave 4 (Agent A) parser coverage tests.
 *
 * Verifies that previously-broken cards now parse without raw effects.
 * Covers the specific buckets in card-parser-wave4-plan.md:
 *   - Bucket 1a: [Exhaust]: <effect> activated abilities
 *   - Bucket 1b: self-referential triggers with simple inner effects
 *   - Bucket 1c: static effects on battlefields
 *   - Bucket 1d: misc one-liners
 *   - Bucket 3: static auras with self-condition or location scoping
 *   - Small fixes: Backline keyword, AmountExpression `multiplier`
 */

import { describe, expect, it } from "bun:test";
import type { Ability } from "@tcg/riftbound-types";
import { parseAbilities } from "../../index";

function findRawEffects(ability: Ability): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {return;}
    const obj = node as Record<string, unknown>;
    if (obj.type === "raw" && typeof obj.text === "string") {
      out.push(obj.text);
    }
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) {v.forEach(visit);}
      else if (v && typeof v === "object") {visit(v);}
    }
  };
  visit(ability);
  return out;
}

function expectClean(text: string): Ability[] {
  const r = parseAbilities(text);
  expect(r.success).toBe(true);
  const abilities = r.abilities ?? [];
  expect(abilities.length).toBeGreaterThan(0);
  for (const ab of abilities) {
    const raws = findRawEffects(ab);
    expect(raws).toEqual([]);
  }
  return abilities;
}

describe("Wave 4 Bucket 1a: [Exhaust]: <effect> activated abilities", () => {
  it("parses Sun Disc: '[Exhaust]: [Legion] — The next unit you play this turn enters ready.'", () => {
    const abs = expectClean("[Exhaust]: [Legion] — The next unit you play this turn enters ready.");
    expect((abs[0] as { type: string }).type).toBe("activated");
  });

  it("parses Ravenborn Tome: '[Exhaust]: The next spell you play this turn deals 1 Bonus Damage.'", () => {
    expectClean("[Exhaust]: The next spell you play this turn deals 1 Bonus Damage.");
  });

  it("parses Pack of Wonders: '[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand.'", () => {
    expectClean(
      "[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand.",
    );
  });

  it("parses Ultrasoft Poro with [1] [Might] token tokens", () => {
    expectClean(
      "[Exhaust]: Play two [1] [Might] Bird unit tokens with [Deflect]. Use this ability only while I'm at a battlefield.",
    );
  });

  it("parses Dragonsoul Sage: '[Reaction] [Exhaust]: [Add] [1].'", () => {
    const abs = expectClean("[Reaction][>] [Exhaust]: [Add] [1].");
    expect((abs[0] as { timing?: string }).timing).toBe("reaction");
  });

  it("parses Scorn of the Moon with showdown energy restriction", () => {
    expectClean("[Reaction][>] [Exhaust]: [Add] [1]. Spend this Energy only during showdowns.");
  });

  it("parses Assembly Rig compound cost", () => {
    expectClean(
      "[1][fury], Recycle a unit from your trash, [Exhaust]: Play a 3 [Might] Mech unit token to your base.",
    );
  });
});

describe("Wave 4 Bucket 1b: self-referential triggers", () => {
  it("parses Flame Chompers: 'When you discard me, you may pay [fury] to play me.'", () => {
    expectClean("When you discard me, you may pay [fury] to play me.");
  });

  it("parses Wraith of Echoes 'first time per turn' trigger", () => {
    expectClean("The first time a friendly unit dies each turn, draw 1.");
  });

  it("parses Scrapheap multi-event trigger", () => {
    expectClean("When this is played, discarded, or killed, draw 1.");
  });

  it("parses Zaunite Bouncer 'another unit at a battlefield' return-to-hand", () => {
    expectClean("When you play me, return another unit at a battlefield to its owner's hand.");
  });

  it("parses Loyal Poro [Deathknell] with 'didn't die alone' condition", () => {
    expectClean("[Deathknell][>] If I didn't die alone, draw 1.");
  });

  it("parses Sumpworks Map 'When an opponent scores' trigger", () => {
    expectClean("[Reaction] [Temporary] When an opponent scores, draw 1.");
  });

  it("parses Yordle Explorer Power-cost predicate", () => {
    expectClean("When you play a card with Power cost [rainbow][rainbow] or more, draw 1.");
  });
});

describe("Wave 4 Bucket 1c: battlefield-scoped statics and triggers", () => {
  it("parses Frozen Fortress 'each player's Beginning Phase' trigger", () => {
    expectClean("At the start of each player's Beginning Phase, deal 1 to each unit here.");
  });

  it("parses Valley of Idols 'they may pay [N]' trigger", () => {
    expectClean("When a player plays a unit here, they may pay [1] to [Buff] it.");
  });

  it("parses Ripper's Bay 'that player may pay' trigger", () => {
    expectClean(
      "When a unit here is returned to a player's hand, that player may pay [1] to channel 1 rune exhausted.",
    );
  });

  it("parses Void Gate 'Spells and abilities deal N Bonus Damage' static", () => {
    expectClean("Spells and abilities deal 1 Bonus Damage to units here.");
  });

  it("parses Forbidding Waste 'While a unit here is defending alone' static", () => {
    expectClean("While a unit here is defending alone, it has -2 [Might].");
  });
});

describe("Wave 4 Bucket 1d: misc one-liners", () => {
  it("parses Loose Cannon 'one or fewer cards in your hand' condition", () => {
    expectClean(
      "At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand.",
    );
  });

  it("parses Might of Demacia Starter 'N+ units at that battlefield'", () => {
    expectClean("When you conquer, if you have 4+ units at that battlefield, draw 2.");
  });

  it("parses Right of Conquest 'draw N for each battlefield' sequence", () => {
    expectClean("Draw 1, then draw 1 for each battlefield you or allies control.");
  });

  it("parses Seat of Power 'each other battlefield you or allies control'", () => {
    expectClean("When you conquer here, draw 1 for each other battlefield you or allies control.");
  });

  it("parses Piltover Enforcer 'excess damage' condition + exhaust-to", () => {
    expectClean(
      "When you conquer, if you assigned 3 or more excess damage, you may exhaust me to ready a unit.",
    );
  });
});

describe("Wave 4 Bucket 3: static auras with self-condition / location", () => {
  it("parses Vex, Cheerless 'While I'm in combat' compound spell-cost static", () => {
    expectClean(
      "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy spells cost [1][rainbow] more.",
    );
  });

  it("parses Vex, Apathetic 'When an opponent plays a unit while I'm at a battlefield'", () => {
    expectClean(
      "[Deflect] When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn.",
    );
  });

  it("parses Ornn's Forge 'first friendly non-token gear played each turn costs less'", () => {
    expectClean(
      "While you control this battlefield, the first friendly non-token gear played each turn costs [1] less.",
    );
  });

  it("parses Forgotten Library 'while you control this battlefield' wrapping a triggered ability", () => {
    expectClean(
      "While you control this battlefield, when you play a spell, if you spent [4] or more, [Predict].",
    );
  });
});

describe("Wave 4 small fixes", () => {
  it("recognises Backline as a simple keyword", () => {
    const r = parseAbilities("[Backline]");
    expect(r.success).toBe(true);
    expect(r.abilities?.[0]).toMatchObject({ keyword: "Backline", type: "keyword" });
  });

  it("emits AmountExpression.multiplier on 'gain N XP for each ...' (N>1)", () => {
    const r = parseAbilities("When you play me, gain 3 XP for each friendly unit.");
    expect(r.success).toBe(true);
    const ab = r.abilities?.[0] as {
      effect: { amount: { count: unknown; multiplier?: number } };
    };
    expect(ab.effect.amount.multiplier).toBe(3);
  });

  it("emits AmountExpression.multiplier on 'draw N for each ...' (N>1)", () => {
    const r = parseAbilities("Draw 2 for each friendly unit.");
    expect(r.success).toBe(true);
    const ab = r.abilities?.[0] as {
      effect: { amount: { count: unknown; multiplier?: number } };
    };
    expect(ab.effect.amount.multiplier).toBe(2);
  });
});

// ============================================================================
// Wave 4 Agent B coverage — replacement effects, pendingValue sequences,
// XP additional costs, and other compound effect patterns.
// ============================================================================

describe("Wave 4 Agent B — Bucket 2: replacement effects", () => {
  it("parses Tactical Retreat replacement body as a recursive sequence (not raw)", () => {
    const abs = expectClean(
      "[Reaction] Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall it instead.",
    );
    const spell = abs[0] as { effect: { replacement?: { effects?: { type: string }[] } } };
    const {replacement} = spell.effect;
    expect(replacement).toBeDefined();
    expect(replacement?.effects?.map((e) => e.type)).toEqual(["heal", "exhaust", "recall"]);
  });

  it("parses Highlander replacement the same shape as Tactical Retreat", () => {
    expectClean(
      "[Reaction] Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall it instead.",
    );
  });

  it("parses Noxian Guillotine 'EFFECT the next time it takes damage this turn'", () => {
    const abs = expectClean("Kill it the next time it takes damage this turn.");
    const repl = abs[0] as {
      type: string;
      replaces: string;
      duration: string;
      replacement: { type: string };
    };
    expect(repl.type).toBe("replacement");
    expect(repl.replaces).toBe("take-damage");
    expect(repl.duration).toBe("next");
    expect(repl.replacement.type).toBe("kill");
  });

  it("parses Imperial Decree turn-duration take-damage replacement", () => {
    const abs = expectClean("[Action] When any unit takes damage this turn, kill it.");
    const spell = abs[0] as { effect: { replaces?: string; duration?: string } };
    expect(spell.effect.replaces).toBe("take-damage");
    expect(spell.effect.duration).toBe("turn");
  });

  it("parses Symbol of the Solari combat-tie replacement", () => {
    const abs = expectClean(
      "If a combat where you are the attacker ends in a tie, recall ALL units instead.",
    );
    const repl = abs[0] as { type: string; replaces: string };
    expect(repl.type).toBe("replacement");
    expect(repl.replaces).toBe("combat-tie");
  });

  it("parses Void Hatchling reveal-replacement", () => {
    const abs = expectClean(
      "If you would reveal cards from a deck, look at the top card first. You may recycle it. Then reveal those cards.",
    );
    const repl = abs[0] as { type: string; replaces: string };
    expect(repl.type).toBe("replacement");
    expect(repl.replaces).toBe("reveal");
  });
});

describe("Wave 4 Agent B — Bucket 4: pendingValue sequences", () => {
  it("parses Portal Rescue 'banish, then play it' with pendingValue binding", () => {
    const abs = expectClean(
      "[Action] Banish a friendly unit, then its owner plays it to their base, ignoring its cost.",
    );
    const spell = abs[0] as {
      effect: {
        type: string;
        pendingValue?: { source: number };
        effects: { type: string }[];
      };
    };
    expect(spell.effect.type).toBe("sequence");
    expect(spell.effect.pendingValue).toEqual({ source: 0 });
    expect(spell.effect.effects[0].type).toBe("banish");
    expect(spell.effect.effects[1].type).toBe("play");
  });

  it("pending-value play target carries the correct marker type", () => {
    const abs = expectClean("Banish it, then play it, ignoring its cost.");
    const spell = abs[0] as {
      effect: { effects: { type: string; target?: { type: string } }[] };
    };
    expect(spell.effect.effects[1].target).toEqual({ type: "pending-value" });
  });
});

describe("Wave 4 Agent B — Bucket 5: XP / Level / Ambush", () => {
  it("recognises Ambush as a simple keyword", () => {
    const r = parseAbilities("[Ambush]");
    expect(r.success).toBe(true);
    expect(r.abilities?.[0]).toMatchObject({ keyword: "Ambush", type: "keyword" });
  });

  it("parses 'You may spend N XP as an additional cost' with an ifPaid payoff", () => {
    const abs = expectClean(
      "You may spend 3 XP as an additional cost to play me. If you do, I cost [3] less.",
    );
    const ab = abs[0] as {
      effect: {
        additionalCost: { xp: number };
        optional: boolean;
        ifPaid?: { type: string };
      };
    };
    expect(ab.effect.additionalCost.xp).toBe(3);
    expect(ab.effect.optional).toBe(true);
    expect(ab.effect.ifPaid?.type).toBe("cost-reduction");
  });

  it("splits Voidreaver's paired 'Spend N XP, [Exhaust]:' activated abilities", () => {
    const abs = expectClean(
      "Spend 1 XP, [Exhaust]: Buff a unit. Spend 2 XP, [Exhaust]: Move a unit.",
    );
    expect(abs.length).toBe(2);
    const first = abs[0] as { cost: { xp?: number; exhaust?: boolean } };
    const second = abs[1] as { cost: { xp?: number; exhaust?: boolean } };
    expect(first.cost.xp).toBe(1);
    expect(first.cost.exhaust).toBe(true);
    expect(second.cost.xp).toBe(2);
    expect(second.cost.exhaust).toBe(true);
  });

  it("parses Arachnoid Horror's 'can be played to occupied battlefield' static", () => {
    expectClean(
      "I can be played to an occupied battlefield if an enemy unit is alone there.",
    );
  });

  it("parses 'if an enemy unit is alone here' condition on a Hunt/Ambush trigger", () => {
    const abs = expectClean(
      "When I attack, if an enemy unit is alone here, give me +2 [Might] this turn and gain 2 XP.",
    );
    const trig = abs[0] as { condition?: { type: string } };
    expect(trig.condition?.type).toBe("alone-in-combat");
  });
});

describe("Wave 4 Agent B — misc unblocks", () => {
  it("parses Solari Chief 'If it is stunned, kill it. Otherwise, stun it' as a conditional effect", () => {
    const abs = expectClean(
      "When you play me, choose an enemy unit. If it is stunned, kill it. Otherwise, stun it.",
    );
    const trig = abs[0] as {
      effect: { type: string; then?: { type: string }; else?: { type: string } };
    };
    expect(trig.effect.type).toBe("conditional");
    expect(trig.effect.then?.type).toBe("kill");
    expect(trig.effect.else?.type).toBe("stun");
  });

  it("parses 'Move an exhausted friendly unit from a battlefield to its base'", () => {
    expectClean("Move an exhausted friendly unit from a battlefield to its base.");
  });

  it("parses Tryndamere 'When I conquer after an attack, if you assigned N excess damage...'", () => {
    expectClean(
      "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you score 1 point.",
    );
  });

  it("parses Viktor, Leader 'When another non-Recruit unit you control dies' trigger", () => {
    expectClean(
      "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token at your base.",
    );
  });

  it("parses Janna, Savior's [Reaction]-wrapped trigger sequence", () => {
    expectClean(
      "[Reaction] When you play me, heal your units here, then move up to one enemy unit from here to its base.",
    );
  });

  it("parses Safety Inspector 'each player must kill one of their units'", () => {
    expectClean(
      "You may spend 3 XP as an additional cost to play me. When you play me, each player must kill one of their units.",
    );
  });
});
