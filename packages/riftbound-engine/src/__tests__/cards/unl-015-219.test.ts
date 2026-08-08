/**
 * Right of Conquest — unl-015-219 · Spell · Fury · 3 energy + [fury] · (no timing keyword → standard)
 *
 *   Draw 1, then draw 1 for each battlefield you or allies control.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - Total draws = 1 + (# battlefields I control). 0 controlled → exactly 1 (the base draw is not
 *    contingent on controlling anything); 1 → 2; 2 → 3. Uncontrolled and ENEMY-controlled
 *    battlefields never count — the opponent is not an "ally" (allies exist only in team modes).
 *  - The count is read on RESOLUTION (359.3.f.2), so conquering first and casting second in the same
 *    turn draws the extra card; a battlefield that is merely CONTESTED by enemy units but still under my
 *    control still counts.
 *  - No [Action]/[Reaction]: standard timing only — my turn, Open state, no showdown in progress, not
 *    as a response to a chain item, never on the opponent's turn.
 *  - The opponent gets priority before it resolves but (absent a Reaction) cannot stop the draws.
 *  - Cost: 3 energy + one [fury] pip; [rainbow] can pay the pip; 2 energy or a non-fury pip cannot.
 *  - Deck bookkeeping: N draws remove exactly N cards from the top of my main deck; P2 draws nothing.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-015-219";
const RALLY = "sfd-166-221"; // 2-cost order Action spell: "... Draw 1."

/**
 * P1 with exactly the cost, `mine` battlefields controlled by P1, one by P2, one by nobody.
 *
 * rule 190.4.a / 190.4.c / 323.6: control of a battlefield is held by OCCUPYING it — a player with
 * no unit there loses control in the next Open-State cleanup. So each battlefield P1 controls gets a
 * P1 unit standing on it; otherwise the board is a state the game would dismantle at the first
 * cleanup (after any spell resolves) and the counts below would drift for reasons unrelated to the card.
 */
function board(mine: number, energy = 3, power: Record<string, number> = { fury: 1 }) {
  const s = scenario().resources(P1, { energy, power }).battlefield("theirs", { controller: P2 }).battlefield("open", { controller: null });
  for (let i = 1; i <= mine; i++) {
    s.battlefield(`bf${i}`, { controller: P1 });
    s.unit(P1, `bf${i}`, { might: 2, name: `Holder ${i}` }, `holder${i}`);
  }
  return s.unit(P2, "theirs", { might: 2, name: "Sentinel" }, "sentinel").hand(P1, CARD, "roc");
}

describe("Right of Conquest (unl-015-219)", () => {
  test("parsed abilities match the printed text: one spell ability = [draw 1, draw (count of battlefields friendly-or-allies control)]; 3 + [fury], standard timing", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "fury", energyCost: 3, name: "Right of Conquest", powerCost: ["fury"], timing: "standard" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: {
        effects: [
          { amount: 1, type: "draw" },
          { amount: { count: { controller: "friendly-or-allies", type: "battlefield" } }, type: "draw" },
        ],
        type: "sequence",
      },
      type: "spell",
    });
  });

  test("cost: 3 energy + 1 fury deducted on cast, one chain item, spell to trash; 2 energy / no pip / a [calm] pip → not castable; [rainbow] pays the pip", async () => {
    const game = await board(1).build();
    await game.p1.cast("roc");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.zoneOf("roc")).toBe("trash");
    expect((await board(1, 2).build()).p1.can("cast", "roc")).toBe(false);
    expect((await board(1, 3, {}).build()).p1.can("cast", "roc")).toBe(false);
    expect((await board(1, 3, { calm: 1 }).build()).p1.can("cast", "roc")).toBe(false);
    const rainbow = await board(1, 3, { rainbow: 1 }).build();
    expect(rainbow.p1.can("cast", "roc")).toBe(true);
    await rainbow.p1.cast("roc");
    expect(rainbow.p1.power()).toBe(0);
  });

  test("zero controlled battlefields (one enemy, one open): draws exactly 1 — the base draw is unconditional", async () => {
    const game = await board(0).build();
    const deck = game.p1.deck().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("roc");
    expect(game.p1.hand()).toHaveLength(0); // nothing drawn while on the chain
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("one controlled battlefield: 1 + 1 = 2 cards, taken from the top of my deck in order", async () => {
    const game = await board(1).build();
    const [top, second, third] = game.p1.deck();
    await game.p1.cast("roc");
    await game.settle();
    expect(game.p1.hand().sort()).toEqual([top, second].sort() as string[]);
    expect(game.p1.deck()[0]).toBe(third);
  });

  test("two controlled battlefields: 1 + 2 = 3 cards; the enemy's and the uncontrolled battlefield add nothing", async () => {
    const game = await board(2).build();
    const deck = game.p1.deck().length;
    await game.p1.cast("roc");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.deck()).toHaveLength(deck - 3);
  });

  test("the opponent is not an 'ally': with P2 controlling BOTH declared battlefields I still draw only 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("t1", { controller: P2 })
      .battlefield("t2", { controller: P2 })
      .hand(P1, CARD, "roc")
      .build();
    await game.p1.cast("roc");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("counted on resolution — conquer the open battlefield first this turn, then cast: 1 + 1 = 2 (and the conquer point is scored)", async () => {
    const game = await board(0).unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "open");
    await game.settle();
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.cast("roc");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("a battlefield I control that is CONTESTED (enemy unit standing there, control unchanged) still counts: 1 + 1 = 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { contested: true, contestedBy: P2, controller: P1 })
      .unit(P2, "bf1", { might: 2, name: "Squatter" }, "squatter")
      .hand(P1, CARD, "roc")
      .build();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    await game.p1.cast("roc");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("standard timing: NOT castable during a showdown on my turn, nor in response to a chain item, nor on the opponent's turn (even in their showdown with Focus)", async () => {
    const sd = await board(1).unit(P1, "base", { might: 3, name: "Raider" }, "raider").build();
    await sd.p1.move("raider", "theirs");
    expect((sd.decision() as ActionDecision).context).toBe("showdown");
    expect(sd.p1.can("cast", "roc")).toBe(false);
    const chain = await board(1, 6, { fury: 2 }).hand(P1, CARD, "roc2").build();
    await chain.p1.cast("roc");
    expect(chain.chain()).toHaveLength(1);
    expect(chain.p1.can("cast", "roc2")).toBe(false);
    const opp = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Attacker" }, "attacker")
      .hand(P1, CARD, "roc")
      .build();
    expect(opp.p1.can("cast", "roc")).toBe(false);
    await opp.p2.move("attacker", "bf1");
    await opp.p2.passFocus();
    expect(opp.actingSeat()).toBe(P1);
    expect(opp.p1.can("cast", "roc")).toBe(false);
  });

  test("the opponent gets priority before it resolves; passing lets it resolve for the full 3 with two battlefields, and it is my open main phase again afterwards", async () => {
    const game = await board(2).build();
    await game.p1.cast("roc");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.hand()).toHaveLength(0);
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.zoneOf("roc")).toBe("trash");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("a second copy cast later the same turn draws the full 1 + N again (one battlefield: +2, then +2)", async () => {
    // Deck shrinks by 2 on each resolution (hand: roc2 + 2 = 3, then 2 + 2 = 4). The count is
    // re-read on each resolution; nothing about the first copy's draws carries over.
    const game = await board(1, 6, { fury: 2 }).hand(P1, CARD, "roc2").build();
    const deck = game.p1.deck().length;
    await game.p1.cast("roc");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
    await game.p1.cast("roc2");
    await game.settle();
    expect(game.p1.trash().sort()).toEqual(["roc", "roc2"]);
    expect(game.p1.deck()).toHaveLength(deck - 4);
    expect(game.p1.hand()).toHaveLength(4);
  });

  test("an unrelated earlier draw this turn (Rally the Troops' 'Draw 1') must not change the count — Right of Conquest with one battlefield still draws 2", async () => {
    // Rally draws 1, then Right of Conquest draws 1 + 1 — an earlier draw is not part of the count.
    const game = await board(1, 5).hand(P1, RALLY, "rally").build();
    const deck = game.p1.deck().length;
    await game.p1.cast("rally");
    await game.settle();
    expect(game.p1.deck()).toHaveLength(deck - 1);
    await game.p1.cast("roc");
    await game.settle();
    expect(game.zoneOf("roc")).toBe("trash");
    expect(game.p1.deck()).toHaveLength(deck - 3);
    expect(game.p1.hand()).toHaveLength(3);
  });
});
