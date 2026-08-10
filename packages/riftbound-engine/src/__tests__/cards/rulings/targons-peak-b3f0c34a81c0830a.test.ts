/**
 * Ruling b3f0c34a81c0830a — Targon's Peak (OGN-289 → ogn-289-298) · Battlefield
 *     "When you conquer here, ready up to 2 runes at the end of this turn."
 *   × Dazzling Aurora (ogn-160-298) Gear "At the end of your turn, reveal cards from the top of your Main Deck until you
 *     reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *   × Deadbloom Predator (ogn-161-298) 8 Might "[Deflect] You may play me to an occupied enemy battlefield."
 *
 * Q: Aurora's end-of-turn play drops Deadbloom onto the enemy's Targon's Peak, I win the showdown and conquer it. Do I ready
 *    2 runes from the Peak, since we're already "at end of turn"?
 * A: No. All "at end of turn" triggers fire at the moment the Ending Step begins; the Peak's delayed ability only came into
 *    being after that moment, so it never triggers this turn.
 * Rules: 317.1 / 317.1.a (Ending Step: end-of-turn triggers fire once, at that point), 383 (phase triggers), 441 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TARGONS_PEAK = "ogn-289-298";
const DAZZLING_AURORA = "ogn-160-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";

/**
 * P1's turn 2, done acting. P1: Aurora in base, 3 EXHAUSTED fury runes, deck top = Deadbloom Predator.
 * P2 holds the live Targon's Peak with a 3-Might Holder; bf2 is P2's too (Elsewhere 1) so the game goes on.
 */
function board() {
  return scenario()
    .battlefield("peak", { controller: P2, def: TARGONS_PEAK, inert: false })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .runes(P1, "fury", 3, { exhausted: true })
    .unit(P2, "peak", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 1, name: "Elsewhere" }, "elsewhere")
    .deck(P1, [DEADBLOOM_PREDATOR, "ogn-175-298", "ogn-175-298"], ["pred", "d2", "d3"]);
}

/** End P1's turn; resolve Aurora; play the Predator onto the Peak; fight the showdown through to the conquer trigger. */
async function conquerPeakAtEndOfTurn(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.runes({ ready: true })).toHaveLength(0);
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  // 317.1.a: the Ending Step began — Aurora's "at the end of your turn" is THE end-of-turn trigger of this turn.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("battlefield-peak");
  expect(game.state("pred")).toMatchObject({ controller: P1, zone: "battlefield-peak" });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus(); // combat: 8 vs 3 → Holder dies → P1 conquers the Peak
  return game;
}

describe("Ruling b3f0c34a81c0830a — a Targon's Peak conquered by Aurora's end-of-turn Deadbloom does not ready runes this turn", () => {
  test("the conquer happens in the ending step: Holder dies, P1 controls the Peak and scores, and the Peak's 'When you conquer here' trigger DOES go on the chain (still P1's turn, phase ending)", async () => {
    const game = await conquerPeakAtEndOfTurn();
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.peak).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1, triggered: true })]);
  });

  test("…but its delayed 'ready up to 2 runes at the end of this turn' never fires: the Ending Step already began before it existed — P1 is never asked to pick runes and all 3 runes are still exhausted as P2's turn opens", async () => {
    const game = await conquerPeakAtEndOfTurn();
    let runePickSeen = false;
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => game.p1.runes().includes(o.card ?? o.key))) {
        runePickSeen = true;
        break;
      }
      if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(runePickSeen).toBe(false);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runes({ ready: false })).toHaveLength(3);
    expect(game.gameState.battlefields.peak?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: conquering the Peak DURING the turn (before the Ending Step) does ready 2 runes at end of turn", async () => {
    const game = await scenario()
      .battlefield("peak", { controller: P2, def: TARGONS_PEAK, inert: false })
      .battlefield("bf2", { controller: P2 })
      .runes(P1, "fury", 3, { exhausted: true })
      .unit(P2, "peak", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 1, name: "Elsewhere" }, "elsewhere")
      .unit(P1, "base", { might: 8, name: "Brute" }, "brute")
      .build();
    await game.p1.move("brute", "peak");
    await game.settle();
    expect(game.gameState.battlefields.peak?.controller).toBe(P1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    await game.p1.endTurn();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const runes = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    await game.p1.pick(runes[0]!, runes[1]!);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });
});
