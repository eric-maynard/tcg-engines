/**
 * Chem-Baroness — sfd-201-221 · Legend (Renata Glasc) · Mind/Order
 *
 *   When you or an ally hold, you may exhaust me to play a Gold gear token exhausted.
 *   While your score is within 3 points of the Victory Score, your Gold [ADD] an additional [1].
 *
 * Rules: 383.4.d (Hold Effects trigger in the Beginning Phase, once per battlefield held —
 * 383.4.d.2.b for "when YOU hold"), 315.2 (Awaken readies everything BEFORE the Beginning Phase, so
 * the legend is always ready for its first hold trigger of the turn), 355.10.c.1 ("you may exhaust me
 * to …" — the exhaust is a cost inside the instruction; unpayable → no Gold), 187.5 (Gold gear token:
 * "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]"), 143.4-style "played exhausted" tokens cannot be
 * cashed the turn they arrive, "ally" = teammate (never an opponent).
 *
 * Head-judge checklist — trickiest situations for THIS card:
 *  1. Two battlefields held → two triggers, but the legend exhausts once: exactly ONE Gold.
 *  2. Declining keeps the legend ready (nothing else is "spent"); the point from holding is unaffected
 *     either way.
 *  3. The Gold enters EXHAUSTED: no cashing it during that turn; next turn it readies and sacrifices for
 *     one power of any domain.
 *  4. Opponent holding is neither "you" nor "an ally" → nothing; holding nothing → nothing.
 *  5. Clause 2 boundary: Victory Score 8 — at 5 points (exactly 3 away) my Gold adds [rainbow] AND [1];
 *     at 4 points it adds only [rainbow]; the opponent's Gold never benefits from MY legend.
 *  6. The parser dropped clause 2 entirely (only the hold trigger is in the registry) → BUG tests.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-201-221";
const GOLD = "sfd-t03"; // printed Gold gear token: Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]

const golds = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].base().filter((id) => game.state(id).name === "Gold");

/** End of P2's turn 2; P1 (Chem-Baroness) controls bf1 with a unit on it, so P1 will hold at the start of turn 3. */
function aboutToHold() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, CARD, "renata")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder");
}

describe("Chem-Baroness (sfd-201-221)", () => {
  test("registry payload, clause 1: optional hold trigger (you or allies), exhaust-self cost, creates an EXHAUSTED Gold gear token", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Renata Glasc", domain: ["mind", "order"], name: "Chem-Baroness" });
    expect(def?.abilities?.[0]).toEqual({
      condition: { cost: { exhaust: true }, type: "pay-cost" },
      effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      optional: true,
      trigger: { event: "hold", on: "controller-or-allies" },
      type: "triggered",
    });
  });

  test("registry payload, clause 2: a second (static) ability — 'while within 3 of the Victory Score, your Gold [ADD] an additional [1]' — must exist", async () => {
    // Expected: two abilities, the second a static keyed on score proximity that augments Gold's [Add].
    // Actual: the parser produced only the hold trigger; clause 2 is silently missing.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[1]).toMatchObject({ type: "static" });
    expect(JSON.stringify(def?.abilities?.[1])).toMatch(/gold/i);
  });

  test("holding bf1: +1 point, the trigger is P1's chain item in the Beginning Phase, P1 is asked; YES → legend exhausted, one exhausted Gold token in base", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.state("renata").isReady).toBe(true); // Awaken already readied it
    await game.p1.yes();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("renata").isExhausted).toBe(true);
    const g = golds(game);
    expect(g).toHaveLength(1);
    expect(game.state(g[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold" });
    expect(golds(game, "p2")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("declining: no Gold, the legend stays ready, the hold point is kept", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    await game.p1.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(golds(game)).toEqual([]);
    expect(game.state("renata").isReady).toBe(true);
    expect(game.p1.points()).toBe(1);
  });

  test("two battlefields held → two triggers and 2 points, but 'exhaust me' can only be paid once: exactly one Gold", async () => {
    const game = await aboutToHold().battlefield("bf3", { controller: P1 }).unit(P1, "bf3", { might: 2, name: "Second Holder" }, "holder2").build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(2);
    expect(game.chain().filter((c) => c.cardId === "renata")).toHaveLength(2);
    // Say yes whenever a payable prompt appears; pass everything else.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no") {
        await (d.canAccept === false ? game.p1.no() : game.p1.yes());
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        await game.acting().pass();
      }
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("renata").isExhausted).toBe(true);
    expect(golds(game)).toHaveLength(1);
  });

  test("negative space: the OPPONENT holding their battlefield is neither 'you' nor 'an ally' — no trigger, no prompt, no Gold for anyone", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .legend(P1, CARD, "renata")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Their Holder" }, "theirs")
      .build();
    await game.p1.endTurn();
    expect(game.p2.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(golds(game)).toEqual([]);
    expect(golds(game, "p2")).toEqual([]);
    expect(game.state("renata").isReady).toBe(true);
  });

  test("negative space: controlling no battlefield at the start of my turn → no hold, no trigger", async () => {
    const game = await scenario().turn(2).active(P2).legend(P1, CARD, "renata").battlefield("bf1", { controller: null }).unit(P1, "base", { might: 2 }, "idle").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(golds(game)).toEqual([]);
    expect(game.transcript().steps.flatMap((s) => s.executed.map((e) => e.moveId))).not.toContain("passChainPriority");
  });

  test("the Gold arrives exhausted: not cashable this turn; on my NEXT turn it (and the legend) are ready and it sacrifices itself for 1 power", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();
    const gold = golds(game)[0] as string;
    expect(game.p1.can("activate", gold)).toBe(false);
    await game.advanceTurn(); // → P2
    game.script(P1, ["no"]); // decline next turn's hold trigger to keep the count simple
    await game.advanceTurn(); // → P1 (holds again: 2 points)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("renata").isReady).toBe(true);
    expect(game.state(gold).isReady).toBe(true);
    expect(game.p1.can("activate", gold)).toBe(true);
    const powerBefore = game.p1.power();
    await game.p1.activate(gold);
    await game.settle();
    expect(game.p1.power()).toBe(powerBefore + 1);
    expect(game.has(gold) && game.zoneOf(gold) === "base").toBe(false); // killed as its cost — a token ceases to exist
  });

  test("clause 2, negative branch: at 4 of 8 points (NOT within 3) my ready Gold adds exactly [rainbow] and no energy", async () => {
    const game = await scenario().legend(P1, CARD, "renata").points(P1, 4).victoryScore(8).gear(P1, GOLD, "gold").build();
    await game.p1.activate("gold");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.zoneOf("gold")).not.toBe("base");
  });

  test("clause 2 scope: the OPPONENT's Gold gets nothing extra from my legend even when I am within 3 of winning", async () => {
    const game = await scenario().active(P2).legend(P1, CARD, "renata").points(P1, 7).victoryScore(8).gear(P2, GOLD, "theirGold").build();
    await game.p2.activate("theirGold");
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  });

  test("clause 2 — at 5 of 8 points (exactly 'within 3') my Gold [ADD]s [rainbow] AND an additional [1] energy", async () => {
    // Expected: cashing a Gold while my score is 5/8 yields 1 power + 1 energy.
    // Actual: clause 2 is not implemented — only the power is added (energy stays 0).
    const game = await scenario().legend(P1, CARD, "renata").points(P1, 5).victoryScore(8).gear(P1, GOLD, "gold").build();
    await game.p1.activate("gold");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
  });

  test("clause 2 applies to the legend's OWN minted token too — hold at 6/8, mint Gold, next turn cash it for [rainbow] + [1]", async () => {
    // Expected: the token made by clause 1 is "your Gold"; at 7/8 next turn it adds 1 power and 1 energy.
    // Actual: only the power.
    const game = await aboutToHold().points(P1, 5).victoryScore(8).build();
    await game.p2.endTurn(); // hold → 6
    await game.p1.yes();
    await game.settle();
    const gold = golds(game)[0] as string;
    await game.advanceTurn();
    game.script(P1, ["no"]);
    await game.advanceTurn(); // hold → 7 (still not 8: no win)
    expect(game.p1.points()).toBe(7);
    await game.p1.tapRunes(game.p1.runes({ ready: true }).length); // convert runes so the pool is a known number
    const energyBefore = game.p1.energy();
    await game.p1.activate(gold);
    await game.settle();
    expect(game.p1.power()).toBe(1);
    expect(game.p1.energy()).toBe(energyBefore + 1);
  });
});
