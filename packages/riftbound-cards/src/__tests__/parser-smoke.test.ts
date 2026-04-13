/**
 * Parser Smoke Tests
 *
 * Verifies the parser works on real Riftbound card text.
 */

import { describe, expect, test } from "bun:test";
import { parseAbilities, parseAbilityText } from "../parser";

describe("Parser: Keywords", () => {
  test("parses [Tank]", () => {
    const result = parseAbilities("[Tank] (I must be assigned combat damage first.)");
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
    expect(result.abilities?.[0]).toEqual({ keyword: "Tank", type: "keyword" });
  });

  test("parses [Ganking]", () => {
    const result = parseAbilities("[Ganking] (I can move from battlefield to battlefield.)");
    expect(result.success).toBe(true);
    expect(result.abilities?.[0]).toEqual({ keyword: "Ganking", type: "keyword" });
  });

  test("parses [Temporary]", () => {
    const result = parseAbilities("[Temporary] (I die at the start of my controller's next turn.)");
    expect(result.success).toBe(true);
    expect(result.abilities?.[0]).toEqual({ keyword: "Temporary", type: "keyword" });
  });

  test("parses [Weaponmaster]", () => {
    const result = parseAbilities("[Weaponmaster]");
    expect(result.success).toBe(true);
    expect(result.abilities?.[0]).toEqual({ keyword: "Weaponmaster", type: "keyword" });
  });

  test("parses [Assault 2]", () => {
    const result = parseAbilities("[Assault 2] (+2 :rb_might: while I'm an attacker.)");
    expect(result.success).toBe(true);
    expect(result.abilities?.[0]).toEqual({
      keyword: "Assault",
      type: "keyword",
      value: 2,
    });
  });

  test("parses [Shield 1]", () => {
    const result = parseAbilities(
      "[Shield 1] (Prevent 1 damage to me each time I'm dealt damage.)",
    );
    expect(result.success).toBe(true);
    expect(result.abilities?.[0]).toEqual({ keyword: "Shield", type: "keyword", value: 1 });
  });

  test("parses [Deflect]", () => {
    const result = parseAbilities(
      "[Deflect] (Opponents must pay :rb_rune_rainbow: to choose me with a spell or ability.)",
    );
    expect(result.success).toBe(true);
    expect(result.abilities?.[0]).toEqual({
      keyword: "Deflect",
      type: "keyword",
      value: 1,
    });
  });
});

describe("Parser: Triggered Abilities", () => {
  test("parses 'When you play me' trigger", () => {
    const result = parseAbilities("When you play me, draw 1.");
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
    const ability = result.abilities?.[0];
    expect(ability?.type).toBe("triggered");
  });

  test("parses 'When I attack' trigger", () => {
    const result = parseAbilities("When I attack, deal 3 to all enemy units here.");
    expect(result.success).toBe(true);
    const ability = result.abilities?.[0];
    expect(ability?.type).toBe("triggered");
  });

  test("parses 'When I conquer' trigger", () => {
    const result = parseAbilities("When I conquer, draw 1.");
    expect(result.success).toBe(true);
    const ability = result.abilities?.[0];
    expect(ability?.type).toBe("triggered");
  });

  test("parses 'When I hold' trigger", () => {
    const result = parseAbilities("When I hold, you score 1 point.");
    expect(result.success).toBe(true);
    const ability = result.abilities?.[0];
    expect(ability?.type).toBe("triggered");
  });

  test("parses optional trigger with 'you may'", () => {
    const result = parseAbilities("When I conquer, you may draw 1.");
    expect(result.success).toBe(true);
    const ability = result.abilities?.[0];
    expect(ability?.type).toBe("triggered");
    if (ability?.type === "triggered") {
      expect(ability.optional).toBe(true);
    }
  });
});

describe("Parser: Multi-ability cards", () => {
  test("parses keyword + triggered", () => {
    const result = parseAbilities(
      "[Tank] (I must be assigned combat damage first.)\nWhen you play me, draw 1.",
    );
    expect(result.success).toBe(true);
    expect(result.abilities?.length).toBeGreaterThanOrEqual(2);
    expect(result.abilities?.[0].type).toBe("keyword");
    expect(result.abilities?.[1].type).toBe("triggered");
  });

  test("parses real card: Ahri, Alluring", () => {
    const result = parseAbilities("When I hold, you score 1 point.");
    expect(result.success).toBe(true);
    expect(result.abilities).toHaveLength(1);
  });

  test("parses real card: Alpha Wildclaw with Tank", () => {
    const result = parseAbilities(
      "[Tank] (I must be assigned combat damage first.)\nYour units here with less Might than me can't be chosen by enemy spells or abilities.",
    );
    expect(result.success).toBe(true);
    expect(result.abilities?.length).toBeGreaterThanOrEqual(2);
  });

  test("parses real card: Ancient Warmonger with Accelerate and Assault", () => {
    const result = parseAbilities(
      "[Accelerate] (You may pay :rb_energy_1::rb_rune_chaos: as an additional cost to have me enter ready.)\n[Assault] (+1 :rb_might: while I'm an attacker.)",
    );
    expect(result.success).toBe(true);
    expect(result.abilities?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Parser: Spell abilities", () => {
  test("parses [Action] spell", () => {
    const result = parseAbilities(
      "[Action] (Play on your turn or in showdowns.)\nEach player kills one of their gear.",
    );
    expect(result.success).toBe(true);
  });

  test("parses [Reaction] spell", () => {
    const result = parseAbilities(
      "[Reaction] (Play any time, even before spells and abilities resolve.)\nCounter a spell.",
    );
    expect(result.success).toBe(true);
  });
});

describe("Parser: Parse rate on real cards", () => {
  test("measures parse success rate on sample cards", () => {
    const sampleTexts = [
      "When I hold, you score 1 point.",
      "[Tank] (I must be assigned combat damage first.)",
      "[Assault 2] (+2 :rb_might: while I'm an attacker.)",
      "[Ganking] (I can move from battlefield to battlefield.)",
      "When you play me, draw 1.",
      "When I attack, deal 3 to all enemy units here.",
      "When I conquer, you may kill a gear. If you do, buff me.",
      "[Deflect] (Opponents must pay :rb_rune_rainbow: to choose me.)",
      "When a friendly unit dies, you may exhaust me to draw 1.",
      "[Action] (Play on your turn or in showdowns.)\nDeal 3 to a unit.",
      "[Reaction] (Play any time.)\nCounter a spell.",
      "When I move to a battlefield, draw 1.",
      "At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand.",
    ];

    let successes = 0;
    for (const text of sampleTexts) {
      const result = parseAbilities(text);
      if (result.success) {
        successes++;
      }
    }

    const rate = (successes / sampleTexts.length) * 100;
    console.log(`Parser success rate: ${successes}/${sampleTexts.length} (${rate.toFixed(0)}%)`);
    expect(rate).toBeGreaterThan(70);
  });
});
