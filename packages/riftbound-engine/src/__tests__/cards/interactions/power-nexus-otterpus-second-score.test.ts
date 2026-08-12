/**
 * Interaction: Power Nexus (sfd-214-221) · Battlefield —
 *     "When you hold here, you may pay [rainbow][rainbow][rainbow][rainbow] to score 1 point."
 *   × Otterpus (ven-053-166) · Unit · Mind · 2 · 2 Might —
 *     "If a player would score 1 point from conquering or holding during their first or second
 *      turn, they draw 1 instead."
 *   (Pouty Poro, ogn-013-298, is the body that makes the Hold happen.)
 *
 * Question: on P1's SECOND turn they hold Power Nexus with Otterpus on the board.
 *   (a) Is the Nexus's own point also replaced by Otterpus's draw, or only the hold point?
 *   (b) Does 470 ("only Score, from either method, once per Battlefield per turn") kill the Nexus
 *       point, since the Hold that triggered it already Scored that battlefield this turn?
 *   (c) If the hold point was replaced by a draw, was the battlefield still Scored — is the hold
 *       trigger even generated, and is the battlefield locked out of a later re-score this turn?
 *
 * Expected — (c) first, because it gates the others: Scoring is the EVENT; gaining the point is only
 * one of its two parts (471.1) and triggering the battlefield's Score abilities is the other
 * (471.2). Otterpus replaces the point-GAIN, not the Score, so the hold happened: the battlefield is
 * recorded as Scored this turn (470) and the Power Nexus hold trigger goes on the chain normally.
 * (a) Otterpus's own text limits it to a point scored "from conquering or holding"; the Nexus point
 * comes from an ability resolving, not from a Conquer (469.1) or a Hold (469.2), so it is NOT
 * replaced — under Otterpus P1 draws for the hold and still gains a real point from the Nexus.
 * (b) 470 caps SCORING that battlefield; the Nexus instructs a point gain (471.1), and 471.1.a.1
 * puts points gained from sources that are not a Conquer outside those restrictions — so the payment
 * really buys a point. The deliberate discriminator: if the engine treated "score 1 point" as a
 * second Score of that battlefield, the four Power would be consumed for nothing. And the prompt
 * must be OFFERED either way (470 does not suppress the optional payment; 367 / 370).
 *
 * Rules: 367 / 370 (optional costs and abilities are offered, then declined or paid), 469.1 / 469.2
 * (Conquering / Holding), 470 (Score once per battlefield per turn), 471.1 / 471.1.a.1 / 471.2
 * (Scoring gains the point AND triggers the battlefield's abilities; gains from other sources are
 * not routed through the Conquer restrictions), 429.3 / 357.1.a (Reaction [Add] during payment).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POWER_NEXUS = "sfd-214-221";
const OTTERPUS = "ven-053-166";
const POUTY_PORO = "ogn-013-298";

const PAY_LINE = "Pay [rainbow][rainbow][rainbow][rainbow] to use Power Nexus [nexus]'s optional ability?";

/** What the open prompt still needs before "yes" may be accepted (undefined = payable now). */
function shortfall(game: Game): Record<string, number> | undefined {
  return (game.decision() as { needsAdd?: { power?: Record<string, number> } } | null)?.needsAdd?.power;
}

/**
 * P2 is about to end the turn; ending it walks P1 into a Beginning Phase where they hold Power
 * Nexus. `turn: 2` makes the next turn P1's SECOND (Otterpus's window), `turn: 6` a late one.
 * `runes` ready runes are seeded so the four [rainbow] pips can be paid from inside the prompt.
 */
function board(o: { otter: boolean; turn: 2 | 6; runes?: number }) {
  let s = scenario()
    .turn(o.turn)
    .active(P2)
    .battlefield("nexus", { controller: P1, def: POWER_NEXUS, inert: false })
    .unit(P1, "nexus", POUTY_PORO, "poro");
  for (let i = 0; i < (o.runes ?? 4); i++) {
    s = s.rune(P1, i % 2 === 0 ? "fury" : "calm", { alias: `r${i}` });
  }
  return o.otter ? s.unit(P1, "base", OTTERPUS, "otter") : s;
}

/** Recycle all four seeded runes into the open payment window (429.3). */
async function payFourPips(game: Game): Promise<void> {
  for (const r of ["r0", "r1", "r2", "r3"]) {
    await game.p1.recycleRune(r);
  }
  expect(shortfall(game)).toBeUndefined();
}

describe("Power Nexus × Otterpus — a second point at a battlefield already Scored this turn", () => {
  test("(c) the Score EVENT happened even though the point was replaced: on P1's second turn the hold gains no point but draws 1, the battlefield is in the Scored-this-turn ledger, and the Nexus hold trigger raised its own prompt (471.1 / 471.2, 470)", async () => {
    const game = await board({ otter: true, turn: 2 }).build();
    const hand = game.p1.hand().length;
    await game.p2.endTurn();

    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(0); // the point-GAIN was replaced …
    expect(game.p1.hand().length).toBe(hand + 1); // … by a draw
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["nexus"]); // … but the battlefield WAS Scored
    expect(game.decision()).toMatchObject({
      kind: "yes-no",
      prompt: PAY_LINE,
      seat: P1,
      source: { battlefieldId: "nexus", cardId: "nexus" },
      timing: "FIN",
    });
  });

  test("(b) 470 does not suppress the optional payment: with an EMPTY pool the prompt is still offered, disabled-but-fundable, quoting all four pips (367 / 370, 429.3)", async () => {
    const game = await board({ otter: true, runes: 0, turn: 2 }).build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", prompt: PAY_LINE, seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false); // listed, not payable
    expect(game.p1.points()).toBe(0);
  });

  test("(a) the Nexus point is NOT replaced by Otterpus — it comes from an ability, not from conquering or holding: paying the four pips takes P1 from 0 to 1 point, with no second replacement draw", async () => {
    const withOtter = await board({ otter: true, turn: 2 }).build();
    const handStart = withOtter.p1.hand().length;
    await withOtter.p2.endTurn();
    const handAfterHold = withOtter.p1.hand().length;
    expect(handAfterHold).toBe(handStart + 1); // the hold's replacement draw
    await payFourPips(withOtter);
    await withOtter.p1.yes();
    await withOtter.settle();

    expect(withOtter.p1.points()).toBe(1); // a REAL point from the Nexus
    expect(withOtter.p1.hand().length).toBe(handAfterHold + 1); // only the Beginning-Phase draw step
    expect(withOtter.p1.resources()).toEqual({ energy: 0, power: {} }); // all four pips spent
    expect(withOtter.violations()).toEqual([]);

    // Control without Otterpus: the same payment, the same one extra point on top of the hold's.
    const plain = await board({ otter: false, turn: 2 }).build();
    const plainHand = plain.p1.hand().length;
    await plain.p2.endTurn();
    expect(plain.p1.points()).toBe(1); // the hold itself scored
    expect(plain.p1.hand().length).toBe(plainHand); // no replacement draw
    await payFourPips(plain);
    await plain.p1.yes();
    await plain.settle();
    expect(plain.p1.points()).toBe(2);
  });

  test("(b) 470 caps SCORING, not ability-granted points (471.1.a.1): the same battlefield yields hold + Nexus in one turn — 2 points with the ledger still naming it once, and the four Power are never consumed for nothing", async () => {
    const game = await board({ otter: false, turn: 2 }).build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    await payFourPips(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["nexus"]); // still one Score of that battlefield
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.violations()).toEqual([]);
  });

  test("declining leaves the Hold standing: no extra point, nothing spent, and the battlefield stays Scored this turn", async () => {
    const game = await board({ otter: true, turn: 2 }).build();
    await game.p2.endTurn();
    await game.p1.no();
    await game.settle();
    expect(game.p1.points()).toBe(0);
    expect(game.p1.runes({ ready: true })).toEqual(expect.arrayContaining(["r0", "r1", "r2", "r3"])); // none recycled
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["nexus"]);
    expect(game.violations()).toEqual([]);
  });

  test("NO side for Otterpus — the same board on a LATE turn: the hold scores normally and the Nexus payment adds the second point (2 total, no draws)", async () => {
    const game = await board({ otter: true, turn: 6 }).build();
    const hand = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand().length).toBe(hand); // outside Otterpus's window: no replacement
    await payFourPips(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["nexus"]);
  });
});
