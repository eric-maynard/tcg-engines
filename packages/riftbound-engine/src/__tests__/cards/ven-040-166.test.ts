/**
 * Decree of Focus — ven-040-166 · Spell · Calm · 1 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a friendly unit that's in combat with an enemy Fury ([fury]) unit or
 *   that's being chosen by an enemy Fury spell. Give it +4 [Might] this turn.
 *
 * rule-id: ven-040-166 — the chosen unit is bound at play time (rule 355.8);
 * the +4 Might must land on that unit, never on the spell card itself, and
 * only a friendly unit in combat with an enemy Fury unit (or chosen by a
 * pending enemy Fury spell) is a legal choice.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-040-166";
const DECREE_OF_RAGE = "ven-015-166"; // Fury spell: Deal 4 to an enemy Calm unit.

describe("Decree of Focus (ven-040-166)", () => {
  test("gives a friendly unit in combat with an enemy Fury unit +4 Might this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { domain: "fury", might: 3 }, "foe")
      .hand(P1, CARD, "decree")
      .build();
    await game.p1.move("ally", "bf1"); // opens the combat showdown
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "decree")).toBe(true);
    await game.p1.cast("decree", { targets: "ally" });
    expect(game.gameState.interaction?.chain?.items.map((i) => i.targets)).toEqual([["ally"]]);
    await game.settle();
    // 2 + 4 = 6 ≥ 3 kills the Fury defender; unbuffed, the 2-Might ally would die instead.
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("ally").mightModifier).toBe(4);
    expect(game.zoneOf("decree")).toBe("trash");
  });

  test("not playable on a friendly unit that isn't in combat with an enemy Fury unit", async () => {
    const idle = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "decree")
      .build();
    expect(idle.p1.can("cast", "decree")).toBe(false);
    const err = await idle.p1.try((p) => p.cast("decree", { targets: "ally" }));
    expect(err.ok).toBe(false);

    // In combat, but the opposing unit is not Fury.
    const calmFoe = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { domain: "calm", might: 9 }, "foe")
      .hand(P1, CARD, "decree")
      .build();
    await calmFoe.p1.move("ally", "bf1");
    expect((calmFoe.decision() as ActionDecision).context).toBe("showdown");
    expect(calmFoe.p1.can("cast", "decree")).toBe(false);
  });

  test("a friendly unit being chosen by an enemy Fury spell is a legal choice; other friendly units are not", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .unit(P1, "base", { domain: "calm", might: 2 }, "ally")
      .unit(P1, "base", { domain: "calm", might: 2 }, "other")
      .hand(P1, CARD, "decree")
      .hand(P2, DECREE_OF_RAGE, "rage")
      .build();
    expect(game.p1.can("cast", "decree")).toBe(false);
    await game.p2.cast("rage", { targets: "ally" });
    await game.p2.pass(); // priority to P1 with Decree of Rage still pending
    expect(game.p1.can("cast", "decree")).toBe(true);
    const bad = await game.p1.try((p) => p.cast("decree", { targets: "other" }));
    expect(bad.ok).toBe(false);
    await game.p1.cast("decree", { targets: "ally" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["rage", "decree"]);
  });
});
