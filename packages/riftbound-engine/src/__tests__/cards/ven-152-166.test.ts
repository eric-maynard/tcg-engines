/**
 * Rebuttal — ven-152-166 · Spell (Reaction) · Mind/Chaos · 1 energy + [rainbow]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a spell with Energy cost no more than [4]. You may pay [rainbow].
 *   If you do, gain control of it and you may make new choices for it.
 *   Otherwise, counter it.
 *
 * rule 355.6 / 355.8 — a spell exists as an object only on the chain, so with
 * no pending spell Rebuttal has no legal choice and cannot be played.
 * rule 356.1 — "You may pay [rainbow]" is a cost paid WITHIN the instructions,
 * on resolution: accept → gain control, decline (or cannot pay) → counter.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const REBUTTAL = "ven-152-166";
const CLEAVE = "ogn-004-298"; // 1 energy — "Give a unit [Assault 3] this turn."

/** P2's turn; P2 casts Cleave; P1 holds Rebuttal with `power` power available. */
async function cleaveThenRebuttal(power: Record<string, number>): Promise<Game> {
  const game = await scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .resources(P1, { energy: 1, power })
    .unit(P1, "base", { might: 3 }, "mine")
    .unit(P2, "base", { might: 3 }, "theirs")
    .hand(P2, CLEAVE, "cleave")
    .hand(P1, REBUTTAL, "reb")
    .build();
  await game.p2.cast("cleave", { targets: "theirs" });
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  await game.p1.cast("reb");
  return game;
}

describe("Rebuttal (ven-152-166)", () => {
  test("needs a spell to choose — not playable with an empty chain (rule 355.6)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1, mind: 1 } })
      .hand(P1, REBUTTAL, "reb")
      .build();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "reb")).toBe(false);
  });

  test("declining the [rainbow] payment counters the chosen spell", async () => {
    const game = await cleaveThenRebuttal({ mind: 1 });
    await game.settle();
    // No second power to pay with — the counter branch lands.
    expect(game.state("theirs").grantedKeywords).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("reb")).toBe("trash");
  });

  test("paying [rainbow] gains control of the spell instead of countering it", async () => {
    const game = await cleaveThenRebuttal({ mind: 1, rainbow: 1 });
    // Resolution asks the controller whether to pay the [rainbow].
    while (game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.decision()?.kind).toBe("yes-no");
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.yes();
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.chain().some((c) => c.cardId === "cleave" && c.controller === P1)).toBe(true);
  });
});
