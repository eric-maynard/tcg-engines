/**
 * Mystic Reversal — ogn-080-298 · Spell (Reaction) · Calm · 4 energy + [calm][calm][calm]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Gain control of a spell. You may make new choices for it.
 *
 * "A spell" = a spell on the chain (the only place a spell exists as a targetable object).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const MYSTIC_REVERSAL = "ogn-080-298";
const CLEAVE = "ogn-004-298"; // "Give a unit [Assault 3] this turn."
const DISCIPLINE = "ogn-058-298"; // [Reaction] "Give a unit +2 [Might] this turn. Draw 1."

/** P2's turn; P2 is about to Cleave their own unit; P1 holds Mystic Reversal with exact mana. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .resources(P1, { energy: 4, power: { calm: 3 } })
    .unit(P1, "base", { might: 3 }, "mine")
    .unit(P2, "base", { might: 3 }, "theirs")
    .hand(P2, CLEAVE, "cleave")
    .hand(P1, MYSTIC_REVERSAL, "mr");
}

/** Everyone passes until exactly the top chain item has resolved. */
async function resolveTop(game: Game): Promise<void> {
  const n = game.chain().length;
  while (game.chain().length === n && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

async function cleaveThenReverse(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("cleave", { targets: "theirs" });
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  await game.p1.cast("mr");
  return game;
}

describe("Mystic Reversal (ogn-080-298)", () => {
  test("Reaction: playable on the opponent's turn in response to their spell; costs 4 energy + 3 calm", async () => {
    const game = await cleaveThenReverse();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "mr"]);
    await game.settle();
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("mr")).toBe("trash");
  });

  test("not affordable with 2 calm power or 3 energy", async () => {
    const lowPower = await board().resources(P1, { energy: 4, power: { calm: 2 } }).build();
    await lowPower.p2.cast("cleave", { targets: "theirs" });
    if (lowPower.actingSeat() === P2) {
      await lowPower.p2.passPriority();
    }
    expect(lowPower.p1.can("cast", "mr")).toBe(false);
    const lowEnergy = await board().resources(P1, { energy: 3, power: { calm: 3 } }).build();
    await lowEnergy.p2.cast("cleave", { targets: "theirs" });
    if (lowEnergy.actingSeat() === P2) {
      await lowEnergy.p2.passPriority();
    }
    expect(lowEnergy.p1.can("cast", "mr")).toBe(false);
  });

  test("needs a spell to choose — not playable when no spell is on the chain (rule 355.6)", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 3 } }).hand(P1, MYSTIC_REVERSAL, "mr").build();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "mr")).toBe(false);
  });

  test("on resolution P1 gains control of the targeted spell (its chain item is now controlled by P1)", async () => {
    // Expected: after Mystic Reversal resolves, Cleave is still on the chain but controlled by
    // player-1. Actual: gain-control-of-spell is a no-op; Cleave stays with player-2.
    const game = await cleaveThenReverse();
    await resolveTop(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cleave", controller: P1 })]);
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("mr")).toBe("trash");
  });

  test("with two spells on the chain the caster chooses WHICH one to take, not just the topmost", async () => {
    // rule 355.8 — "a spell" is a caster-chosen chain item locked when Mystic
    // Reversal is PLAYED, so P1 can reach P2's Cleave underneath their own
    // Discipline instead of silently stealing the topmost spell (their own).
    const game = await board()
      .resources(P1, { energy: 6, power: { calm: 5 } })
      .hand(P1, DISCIPLINE, "disc")
      .build();
    await game.p2.cast("cleave", { targets: "theirs" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("disc", { targets: "mine" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "disc"]);
    // Both chain items are offered as targets — the caster picks, the engine
    // does not silently take the topmost.
    const offered = game.p1.option("cast", "mr")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual([["cleave"], ["disc"]]);
    await game.p1.cast("mr", { targets: "cleave" });
    await resolveTop(game);
    expect(game.chain().find((c) => c.cardId === "cleave")?.controller).toBe(P1);
    expect(game.chain().find((c) => c.cardId === "disc")?.controller).toBe(P1);
  });

  test("“You may make new choices for it” — P1 may retarget the stolen Cleave onto their own unit", async () => {
    // Expected: P1 is offered a (declinable) re-choice of Cleave's target; picking "mine" means
    // mine ends the chain with Assault 3 and theirs with nothing. Actual: no prompt; Cleave
    // resolves for P2 on "theirs".
    const game = await cleaveThenReverse();
    await resolveTop(game);
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(["pick", "yes-no"]).toContain(d?.kind);
    if (d?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.p1.pick("mine");
    await game.settle();
    expect(game.state("mine").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("theirs").grantedKeywords).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash"); // still goes to its owner's trash
  });
});
