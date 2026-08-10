/**
 * Monastery of Hirana — ogn-282-298 · Battlefield · no domain · no cost
 *
 *   When you conquer here, you may spend a buff to draw 1.
 *
 * Rules: 383.4.c (conquer effects; "When you conquer here" references the conquering player,
 * 383.4.c.2.b), 469.1 / 471.2.a (conquer = gain control of a battlefield not yet scored this
 * turn; conquer abilities trigger only at the battlefield conquered), 469.2 (holding is NOT
 * conquering), 190.6.d ("you" on a battlefield = its controller — whoever just conquered it, no
 * matter who brought the card), 702.2.b (spending a buff removes one buff counter), 702.2.b.1
 * (no buff → cannot spend), 702.2.b.2 / 745.2 (only buffs on units YOU control), 383.3.a–b /
 * 204.3.a / 740.4.a.2 ("you may spend a buff TO draw 1": the leading "you may" is decided and the
 * spend — a cost within instructions right after it, i.e. the trigger's BASE COST — is paid while
 * the trigger is FINALIZED, before anyone holds priority; unpayable → the item never reaches the
 * chain (404.2), never a free draw; the buffed unit is a named cost object, not a target).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. The buff may come from ANY unit you control — a buffed unit sitting in base pays for a
 *     conquer made by an unbuffed attacker; an ENEMY buff never does.
 *  2. Optional + cost: "no" keeps the buff and draws nothing; with no spendable buff there is
 *     nothing to accept and no card is drawn (never a free draw).
 *  3. Hold ≠ conquer: starting your turn on the Monastery with a buffed unit scores the hold
 *     point but offers nothing.
 *  4. "here": conquering a different battlefield while you control the Monastery is silent.
 *  5. Symmetric: the opponent conquering a Monastery you own gets the offer (190.6.d), and it is
 *     THEIR buff that is spent.
 *  6. The buffed conqueror that dies winning the combat (trade) conquers nothing; a buffed
 *     escort that dies while its partner conquers leaves no buff to spend.
 *  7. Two buffed units: the payer should choose WHICH buff is spent (it is their cost to pay).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-282-298";

/** P2 holds the Monastery with a `defMight` defender; P1 attacks from base. */
function siege(opts: { defMight?: number; owner?: string } = {}) {
  return scenario()
    .battlefield("mon", { controller: P2, def: CARD, inert: false, owner: opts.owner ?? P1 })
    .battlefield("other", { controller: null })
    .unit(P2, "mon", { might: opts.defMight ?? 1, name: "Acolyte" }, "acolyte");
}

describe("Monastery of Hirana (ogn-282-298)", () => {
  test("registry payload: one optional 'conquer here' trigger — base cost `spendBuff: 1` (383.3.b), effect draw 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Monastery of Hirana" });
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { spendBuff: 1 }, type: "pay-cost" },
        effect: { amount: 1, type: "draw" },
        optional: true,
        trigger: { event: "conquer", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("conquering the empty Monastery with a buffed unit: trigger on the chain, P1 asked yes/no; yes → buff removed (4 → 3 Might), exactly 1 card drawn, 1 point", async () => {
    const game = await scenario()
      .battlefield("mon", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", { might: 3, name: "Monk" }, "monk", { buffed: true })
      .build();
    expect(game.state("monk").might).toBe(4);
    await game.p1.move("monk", "mon");
    await game.settle();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mon", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "mon" } });
    expect(game.p1.points()).toBe(1); // the point is already scored; the draw is the extra
    await game.p1.yes();
    await game.settle();
    expect(game.state("monk")).toMatchObject({ isBuffed: false, might: 3, zone: "battlefield-mon" });
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.gameState.battlefields.mon?.controller).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("702.2.b.2 — the buff may sit on ANY unit you control: an unbuffed attacker conquers through a defender and the buffed unit back in base pays for the draw", async () => {
    const game = await siege().unit(P1, "base", { might: 3, name: "Monk" }, "monk").unit(P1, "base", { might: 1, name: "Elder" }, "elder", { buffed: true }).build();
    await game.p1.move("monk", "mon");
    await game.settle();
    expect(game.zoneOf("acolyte")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("elder").isBuffed).toBe(false);
    expect(game.state("elder").zone).toBe("base");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.points()).toBe(1);
  });

  test("declining keeps the buff and draws nothing; the conquer point stands", async () => {
    const game = await siege().unit(P1, "base", { might: 3, name: "Monk" }, "monk", { buffed: true }).build();
    await game.p1.move("monk", "mon");
    await game.settle();
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.no();
    await game.settle();
    expect(game.state("monk").isBuffed).toBe(true);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("negative space (702.2.b.1/.2, 355.10.c.1): no buffed unit of your own — only an ENEMY buffed unit — means no draw and the enemy buff is untouched", async () => {
    const game = await siege()
      .unit(P2, "base", { might: 2, name: "Their Buffed" }, "theirs", { buffed: true })
      .unit(P1, "base", { might: 3, name: "Monk" }, "monk")
      .build();
    await game.p1.move("monk", "mon");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      // An offer with nothing to spend must not turn into a free draw.
      await game.p1.yes();
      await game.settle();
    }
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.state("theirs").isBuffed).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("469.2 — HOLDING the Monastery with a buffed unit at the start of your turn scores 1 but offers no spend/draw (hand grows only by the Draw-phase card)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("mon", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "mon", { might: 3, name: "Monk" }, "monk", { buffed: true })
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]); // nothing triggered in the Beginning Phase
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.state("monk").isBuffed).toBe(true);
  });

  test("'When you conquer HERE' must not trigger when the Monastery's controller conquers a DIFFERENT battlefield (471.2.a)", async () => {
    // Expected: conquering "other" while holding the Monastery → straight back to the main phase,
    // buff kept, no draw. Actual: the Monastery's spend-a-buff offer appears for the conquer elsewhere
    // (the `on: "controller"` matcher ignores the trigger's `location: "here"`).
    const game = await scenario()
      .battlefield("mon", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("other", { controller: null })
      .unit(P1, "mon", { might: 2, name: "Keeper" }, "keeper")
      .unit(P1, "base", { might: 3, name: "Monk" }, "monk", { buffed: true })
      .build();
    await game.p1.move("monk", "other");
    await game.settle();
    expect(game.gameState.battlefields.other?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("monk").isBuffed).toBe(true);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("190.6.d — the OPPONENT conquering a Monastery card P1 owns: P2 is the one offered, P2's buff is spent, P2 draws; P1's buffed unit in base is not touched", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("mon", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "mon", { might: 1, name: "Novice" }, "novice")
      .unit(P1, "base", { might: 1, name: "Elder" }, "elder", { buffed: true })
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider", { buffed: true })
      .build();
    await game.p2.move("raider", "mon");
    await game.settle();
    expect(game.zoneOf("novice")).toBe("trash");
    expect(game.gameState.battlefields.mon?.controller).toBe(P2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mon", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    await game.settle();
    expect(game.state("raider").isBuffed).toBe(false);
    expect(game.p2.hand()).toHaveLength(1);
    expect(game.p2.points()).toBe(1);
    expect(game.state("elder").isBuffed).toBe(true);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("383.3.b.1 / 406.4 — the buff is spent as the item is FINALIZED (before the first priority window); the item then waits on the chain: P2 may respond, and nothing is drawn until it resolves", async () => {
    const game = await siege().unit(P1, "base", { might: 3, name: "Monk" }, "monk", { buffed: true }).build();
    await game.p1.move("monk", "mon");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "mon" }, timing: "FIN" });
    await game.p1.yes();
    // The lone buffed unit is bound as the cost object without asking; its buff is gone at once.
    expect(game.state("monk").isBuffed).toBe(false);
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.hand()).toHaveLength(0);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.hand()).toHaveLength(0);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(1);
  });

  // RULING-CONFLICT: riftjudge 1e8583a2a2998ef5 (Sett × Monastery) says the buff is spent on RESOLUTION, so a buff
  // gained from a trigger ordered above it could pay. CR 383.3.b / 204.3.a / 740.4.a.2 (and Unleashed-era ruling
  // 202877fb824b2d2b) say the spend is the trigger's BASE COST, paid at finalization from a buff you have RIGHT NOW —
  // engine follows the CR.
  test("404.2 — no buffed unit you control when the trigger is finalized ⇒ no prompt, no chain item, no priority window (never a free draw)", async () => {
    const game = await siege().unit(P1, "base", { might: 3, name: "Monk" }, "monk").build();
    await game.p1.move("monk", "mon");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("a buffed 3-Might attacker (4) into a 4-Might defender trades: both die, nobody conquers, no trigger, no draw", async () => {
    const game = await siege({ defMight: 4 }).unit(P1, "base", { might: 3, name: "Monk" }, "monk", { buffed: true }).build();
    await game.p1.move("monk", "mon");
    await game.settle();
    expect(game.zoneOf("acolyte")).toBe("trash");
    expect(game.zoneOf("monk")).toBe("trash");
    expect(game.gameState.battlefields.mon?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the only buff dies in the fight: buffed 1-Might escort (2) absorbs the 2-Might defender's damage and dies while the 3-Might Monk conquers → no spendable buff, no draw", async () => {
    const game = await siege({ defMight: 2 })
      .unit(P1, "base", { might: 3, name: "Monk" }, "monk")
      .unit(P1, "base", { might: 1, name: "Escort" }, "escort", { buffed: true })
      .build();
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { escort: 2 }, kind: "distribute" } : undefined)]);
    await game.p1.move(["monk", "escort"], "mon");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.zoneOf("acolyte")).toBe("trash");
    expect(game.zoneOf("escort")).toBe("trash");
    expect(game.locationOf("monk")).toBe("mon");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("402.2 / 745 — with two buffed units the payer NAMES which unit's buff is spent: a forced pick right after the opt-in (timing FIN), paid before anyone gets priority", async () => {
    const game = await siege()
      .unit(P1, "base", { might: 3, name: "Monk" }, "monk", { buffed: true })
      .unit(P1, "base", { might: 1, name: "Elder" }, "elder", { buffed: true })
      .build();
    await game.p1.move("monk", "mon");
    await game.settle();
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["elder", "monk"]);
    await game.p1.pick("monk");
    expect(game.state("monk").isBuffed).toBe(false); // paid now
    expect(game.state("elder").isBuffed).toBe(true);
    expect(game.p1.hand()).toHaveLength(0); // the draw still waits for resolution
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.settle();
    expect(game.state("elder").isBuffed).toBe(true);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });
});
