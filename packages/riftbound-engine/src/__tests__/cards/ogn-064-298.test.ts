/**
 * Wind Wall — ogn-064-298 · Spell · Calm · 3 energy · 2 power
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Counter a spell.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-064-298";
const DECREE = "ven-015-166"; // [Action] Deal 4 to an enemy Calm unit. (1 energy, 1 fury)

describe("Wind Wall (ogn-064-298)", () => {
  // rule-id: ogn-064-298 (rule 355.8) — "Counter a spell" needs a spell on the
  // chain; with an empty chain there is no valid choice, so the play is illegal.
  test("is not playable with no spell on the chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 2 } })
      .hand(P1, CARD, "wall")
      .build();
    expect(game.p1.can("cast", "wall")).toBe(false);
    expect(game.zoneOf("wall")).toBe("hand");
    expect(game.chain()).toHaveLength(0);
  });

  test("becomes playable once an opposing spell is on the chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .unit(P2, "base", { domain: "calm", might: 5 }, "foe")
      .hand(P1, DECREE, "decree")
      .hand(P2, CARD, "wall")
      .build();
    expect(game.p2.can("cast", "wall")).toBe(false);
    await game.p1.cast("decree", { targets: "foe" });
    expect(game.p2.can("cast", "wall")).toBe(true);
  });

  // rule-id: ogn-064-298 (rule 425.1.a / 425.1.a.1) — the countered spell is
  // cleared from the chain and trashed as part of Wind Wall resolving; no
  // extra pass round is needed to pop it.
  test("countered spell leaves the chain immediately when Wind Wall resolves", async () => {
    const BOLT = {
      abilities: [
        { effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" },
      ],
      cardType: "spell",
      domain: "fury",
      energyCost: 1,
      name: "Test Bolt",
      timing: "action",
    };
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .unit(P2, "base", { domain: "calm", might: 5 }, "foe")
      .hand(P1, BOLT, "bolt")
      .hand(P2, CARD, "wall")
      .build();
    await game.p1.cast("bolt", { targets: "foe" });
    await game.p2.cast("wall");
    expect(game.chain()).toHaveLength(2);
    // Both players pass once → Wind Wall (top) resolves.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.state("foe").damage).toBe(0);
  });
});
