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
const BOOST = "unl-031-219"; // 1 energy Reaction — "Give a unit +1 [Might] this turn."

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
    // rule 444.2 / 355.10.c.1 — with no power left the Pay is still ASKED (canAccept
    // false); settle hands that prompt back once, then declines it into the counter.
    const asked = await game.settle();
    expect(asked.decision).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    await game.settle();
    // No second power to pay with — the counter branch lands.
    expect(game.state("theirs").grantedKeywords).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("reb")).toBe("trash");
  });

  test("with two legal spells on the chain the caster chooses which one", async () => {
    // rule 355.8 — "Choose a spell with Energy cost no more than [4]" is a
    // caster-chosen target locked at play time, so both pending spells must be
    // offered; the counter branch must not silently take the topmost one.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .unit(P2, "base", { might: 3 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .hand(P2, BOOST, "boost")
      .hand(P1, REBUTTAL, "reb")
      .build();
    await game.p2.cast("cleave", { targets: "theirs" });
    await game.p2.cast("boost", { targets: "theirs" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    const offered = game.p1
      .option("cast", "reb")
      ?.fields.find((f) => f.name === "targets")
      ?.options;
    expect(offered?.length).toBe(2);
    // Choose the BOTTOM spell, not the topmost the fallback would take.
    await game.p1.cast("reb", { targets: "cleave" });
    // rule 444.2 — the unpayable Pay is asked once before it can be declined.
    await game.settle();
    await game.settle();
    // Cleave was countered (no [Assault 3]); the untargeted Boost resolved.
    expect(game.state("theirs").grantedKeywords ?? []).toEqual([]);
    expect(game.state("theirs").might).toBe(4);
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
