/**
 * Ruling a32c9f9215131b03 — Jinx, Rebel (OGN-202 → ogn-202-298) "When you discard one or more cards, ready me and give me
 *     +1 Might this turn."
 *   × Super Mega Death Rocket! (OGN-252 → ogn-252-298) "…When you conquer, you may discard 1 to return this from your
 *     trash to your hand."
 *
 * Q: Jinx on board, 3 cards in hand, 3 SMDR in trash; I conquer. (1) May I discard all 3 to get all 3 rockets and +3 on
 *    Jinx off the one conquer? (2) May I instead discard 1 card for rocket #1, then discard rocket #1 for #2, then #2 for #3?
 * A: Yes to both. All three SMDR abilities trigger together and go on the chain, then resolve one at a time (order of
 *    your choosing); the "you may discard" is decided as EACH resolves, so a just-returned rocket can be pitched to the
 *    next one. Jinx gets +1 per discard (three events → +3).
 * Rules: 383 / 385.2 (triggers from trash, simultaneous triggers all go on the chain), 340 (resolve one by one),
 *        383.1 (one trigger per discard event).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JINX_REBEL = "ogn-202-298";
const SMDR = "ogn-252-298";
const junk = (n: string) => ({ cardType: "unit", energyCost: 1, might: 1, name: `Junk ${n}` }) as const;

/** P1's turn: exhausted Jinx (5) + a Runner in base, three SMDR in trash, three junk cards in hand; P2's bf1 is empty. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", JINX_REBEL, "jinx", { exhausted: true })
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .trash(P1, SMDR, "smdrA")
    .trash(P1, SMDR, "smdrB")
    .trash(P1, SMDR, "smdrC")
    .hand(P1, junk("A"), "ja")
    .hand(P1, junk("B"), "jb")
    .hand(P1, junk("C"), "jc");
}

/** Runner walks onto bf1; pass focus through the (empty) showdown until the conquer has put the SMDR triggers up. */
async function conquer(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("runner", "bf1");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context !== "main" && game.chain().length === 0) {
      await game.acting().pass();
    } else {
      break;
    }
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game;
}

/**
 * Answer every SMDR prompt YES; `chooseDiscard` picks what to pitch from the offered keys. Soft-accepts an ordering offer
 * (all three items are identical copies). Returns the number of "you may" questions answered.
 */
async function driveRockets(game: Game, chooseDiscard: (offered: string[], n: number) => string): Promise<number> {
  let asked = 0;
  let discards = 0;
  for (let i = 0; i < 24; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || !d) {
      break;
    }
    if (d.kind === "order" && d.seat === P1) {
      await game.p1.order(d.items.map((it) => it.key));
    } else if (d.kind === "yes-no" && d.seat === P1) {
      asked++;
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      const offered = d.options.map((o) => String(o.card ?? o.key));
      await game.p1.pick(chooseDiscard(offered, discards++));
    } else {
      break;
    }
  }
  return asked;
}

describe("Ruling a32c9f9215131b03 — three SMDR conquer-triggers resolve one by one; Jinx +1 per discard", () => {
  test("the single conquer puts ALL THREE SMDR abilities on the chain at once (P1's, triggered)", async () => {
    const game = await conquer();
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["smdrA", "smdrB", "smdrC"]);
    for (const item of game.chain()) {
      expect(item).toMatchObject({ controller: P1, triggered: true });
    }
  });

  test("(1) discard all three hand cards, one per trigger → all three rockets return to hand, and Jinx is +3 (5 → 8) and READY", async () => {
    const game = await conquer();
    const asked = await driveRockets(game, (offered) => offered.find((k) => k.startsWith("j"))!);
    expect(asked).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().sort()).toEqual(["smdrA", "smdrB", "smdrC"]);
    expect(game.p1.trash().sort()).toEqual(["ja", "jb", "jc"]);
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 8 });
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge a32c9f9215131b03 says the "you may discard" is decided as each SMDR RESOLVES (so a
  // just-returned rocket can be pitched to the next one); CR 383.3.a/383.3.b say a "you may" that opens the effect,
  // plus the cost immediately following it, IS the trigger's base cost and is settled during FINALIZATION, and CR
  // 337.1/337.3 finalize every pending item (oldest first) before anything resolves — engine follows CR, matching the
  // green core-rules tests trigger-finalization.test.ts and trigger-object-costs-at-fin.test.ts.
  // Consequence: the chain-discard line of answer (2) is impossible — only the hand as it stood at the conquer is ever
  // offered, so the three discards come from the three junk cards and Jinx still ends +3.
  test("ruling a32c9f9215131b03 (2) under CR: all three 'discard 1' payments are settled at finalization, so no returned rocket is ever offered", async () => {
    const game = await conquer();
    const asked = await driveRockets(game, (offered, n) => {
      // Every payment reads the pre-resolution hand: three junk, never a rocket.
      expect(offered.filter((k) => k.startsWith("smdr"))).toEqual([]);
      return offered.find((k) => k.startsWith("j"))!;
    });
    expect(asked).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().sort()).toEqual(["smdrA", "smdrB", "smdrC"]);
    expect(game.p1.trash().sort()).toEqual(["ja", "jb", "jc"]);
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 8 }); // three discard events all the same
  });

  // RULING-CONFLICT (same pair as above): the ruling puts the "you may" at resolution; CR 383.3.b + 337.3 put it at
  // finalization — engine follows CR. After paying for trigger #1 the next opt-in is asked immediately, with all three
  // SMDR still on the chain and rocket #1 still in the trash.
  test("ruling a32c9f9215131b03 under CR: paying for trigger #1 does not resolve it — #2 is asked next with rocket #1 still in the trash", async () => {
    const game = await conquer();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    const first = String(game.decision()?.source?.cardId);
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("ja");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.zoneOf(first)).toBe("trash");
    // The payment's discard already fired Jinx's own trigger onto the chain (383.1), above the three untouched SMDR.
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["jinx", "smdrA", "smdrB", "smdrC"]);
  });
});
