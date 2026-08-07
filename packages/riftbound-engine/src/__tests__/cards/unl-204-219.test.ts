/**
 * Keeper's Verdict — unl-204-219 · Spell · Body/Order · 2 energy + [rainbow][rainbow] · [Action]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Choose an enemy unit at a battlefield. Its owner places it on the top or bottom of their Main Deck.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. Targeting: ENEMY unit AT A BATTLEFIELD only — never a friendly unit, never an enemy in its base;
 *      with no such unit the spell is not castable at all (355.8).
 *   2. "Its OWNER places it": the top/bottom decision belongs to the unit's OWNER, not the caster.
 *      Top → it is the next card that player draws; bottom → the last card of the deck. When the
 *      caster OWNS the enemy-controlled unit (control ≠ ownership, 108.2), the CASTER decides and it
 *      goes to the caster's deck.
 *   3. Not a kill and not a discard: no trash visit, so [Deathknell] (Watchful Sentry: draw 1) must
 *      not fire; a token put into a deck simply ceases to exist (186.1) — the deck does not grow.
 *   4. [Action] timing (806): your open main phase or ANY showdown (incl. the opponent's turn once
 *      you hold Focus) — but not the opponent's open main phase, and not in response on a chain
 *      outside a showdown (it is not [Reaction]). Removing the lone defender mid-showdown hands the
 *      attacker the battlefield without a fight.
 *   5. Cost: 2 energy + two power (dual-domain pips, paid from `power.rainbow` in this engine); a
 *      Deflect target adds one more (covered from Poppy's side in unl-116-219.test.ts).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-204-219";
const WATCHFUL_SENTRY = "ogn-096-298"; // 2-Might unit, [Deathknell] — Draw 1
const RECRUIT_TOKEN = "ogn-273-298"; // 1-Might Recruit unit token

function board(p1: { energy: number; power?: Record<string, number> } = { energy: 2, power: { rainbow: 2 } }) {
  return scenario()
    .resources(P1, p1)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 4, name: "Target" }, "target")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine")
    .deckTop(P2, { cardType: "unit", might: 1, name: "OldTop" }, "oldTop")
    .hand(P1, CARD, "kv");
}

describe("Keeper's Verdict (unl-204-219)", () => {
  test("registry payload: an [Action] spell that recycles an ENEMY unit at a BATTLEFIELD with the position chosen by its OWNER", async () => {
    const game = await scenario().hand(P1, CARD, "kv").build();
    expect(game.state("kv")).toMatchObject({ cardType: "spell", energyCost: 2, name: "Keeper's Verdict" });
    expect(game.state("kv").powerCost).toHaveLength(2);
    expect(game.state("kv").domains.sort()).toEqual(["body", "order"]);
    expect(peekDefaultCardPool()?.get(CARD)).toMatchObject({ timing: "action" });
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      {
        effect: { position: "owner-choice", target: { controller: "enemy", location: "battlefield", type: "unit" }, type: "recycle" },
        timing: "action",
        type: "spell",
      },
    ]);
  });

  test("cost: 2 energy + 2 power deducted on cast; short on energy or holding a single power → not castable", async () => {
    const game = await board().build();
    await game.p1.cast("kv", { targets: "target" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("kv")).toBe("chain");
    expect((await board({ energy: 1, power: { rainbow: 2 } }).build()).p1.can("cast", "kv")).toBe(false);
    expect((await board({ energy: 2, power: { rainbow: 1 } }).build()).p1.can("cast", "kv")).toBe(false);
    expect((await board({ energy: 9 }).build()).p1.can("cast", "kv")).toBe(false);
  });

  test("targets: only ENEMY units AT A BATTLEFIELD are offered — not the enemy in base, not your own unit at a battlefield", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "kv")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["target"]]);
    expect((await game.p1.try((p) => p.cast("kv", { targets: "home" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("kv", { targets: "mine" }))).ok).toBe(false);
    expect(game.zoneOf("kv")).toBe("hand");
    const none = await scenario().resources(P1, { energy: 2, power: { rainbow: 2 } }).battlefield("bf1").unit(P2, "base", { might: 1 }, "home").unit(P1, "bf1", { might: 1 }, "mine").hand(P1, CARD, "kv").build();
    expect(none.p1.can("cast", "kv")).toBe(false);
  });

  test("the unit's OWNER (P2) is the one asked top-or-bottom; 'bottom' makes it the last card of P2's deck and the spell goes to trash", async () => {
    const game = await board().build();
    const deckBefore = game.p2.deck().length;
    await game.p1.cast("kv", { targets: "target" });
    await game.settle();
    expect(game.decision()?.kind).toBe("pick");
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("target")).toBe("battlefield-bf1"); // nothing moves until the owner answers
    await game.p2.answer("mainDeck-bottom");
    await game.settle();
    expect(game.zoneOf("target")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("target");
    expect(game.p2.deck()[0]).toBe("oldTop");
    expect(game.p2.deck()).toHaveLength(deckBefore + 1);
    expect(game.zoneOf("kv")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("'top': it becomes the top card — and is exactly what P2 draws at the start of their next turn", async () => {
    const game = await board().build();
    await game.p1.cast("kv", { targets: "target" });
    await game.settle();
    await game.p2.answer("mainDeck-top");
    await game.settle();
    expect(game.p2.deck()[0]).toBe("target");
    expect(game.p2.deck()[1]).toBe("oldTop");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.hand()).toContain("target");
    expect(game.state("target").damage).toBe(0);
  });

  test("190.4.c — with its only unit gone P2 must lose control of bf1 at the following cleanup (nobody conquers/scores); control is kept after the owner's deferred top/bottom choice", async () => {
    // Expected: bf1.controller === null once the Target is in P2's deck and the turn is back in an Open state.
    // Actual: the cleanup ran while the owner's choice was still pending, and none follows the answer, so P2 keeps bf1
    // (contrast: Angler Beast emptying a battlefield does drop control — unl-132-219.test.ts).
    const game = await board().build();
    await game.p1.cast("kv", { targets: "target" });
    await game.settle();
    await game.p2.answer("mainDeck-bottom");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("not a death: a [Deathknell] unit (Watchful Sentry — draw 1) put into the deck draws its owner nothing and never touches the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry")
      .hand(P1, CARD, "kv")
      .build();
    const handBefore = game.p2.hand().length;
    await game.p1.cast("kv", { targets: "sentry" });
    await game.settle();
    await game.p2.answer("mainDeck-bottom");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("mainDeck");
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(handBefore);
    expect(game.chain()).toEqual([]);
  });

  test("a unit TOKEN sent to a deck ceases to exist (186.1): P2's deck does not grow and the token is on no battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", RECRUIT_TOKEN, "token-recruit")
      .hand(P1, CARD, "kv")
      .build();
    const deckBefore = game.p2.deck().length;
    await game.p1.cast("kv", { targets: "token-recruit" });
    await game.settle();
    if (game.decision()?.kind === "pick" && game.actingSeat() === P2) {
      await game.p2.answer("mainDeck-bottom");
      await game.settle();
    }
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p2.deck()).toHaveLength(deckBefore);
    expect(game.p2.deck()).not.toContain("token-recruit");
  });

  test("control ≠ ownership: an enemy-CONTROLLED unit that P1 OWNS is a legal target, and then P1 (its owner) chooses and it goes to P1's deck", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .card("defector", { controller: P2, def: { cardType: "unit", might: 3, name: "Defector" }, owner: P1, zone: "bf1" })
      .hand(P1, CARD, "kv")
      .build();
    expect(game.state("defector")).toMatchObject({ controller: P2, owner: P1 });
    await game.p1.cast("kv", { targets: "defector" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      expect(game.actingSeat()).toBe(P1);
      await game.p1.answer("mainDeck-top");
      await game.settle();
    }
    expect(game.zoneOf("defector")).toBe("mainDeck");
    expect(game.p1.deck()[0]).toBe("defector");
    expect(game.p2.deck()).not.toContain("defector");
  });

  test("[Action] timing: not castable in the opponent's open main phase, nor in response to a chain on your own turn outside a showdown", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "kv")).toBe(false);
    // Own turn, chain open (P1 played a unit with a play trigger) → Closed state, no showdown → an Action spell may not be added.
    const closed = await board({ energy: 7, power: { rainbow: 2, chaos: 1 } }).hand(P1, "unl-132-219", "beast").build();
    await closed.p1.play("beast", { to: "base" });
    expect(closed.chain()).toHaveLength(1);
    expect(closed.p1.can("cast", "kv")).toBe(false);
  });

  test("[Action] in YOUR combat showdown: attack the lone 4-Might defender with a 2-Might unit, Verdict it away with Focus, and take bf1 without a fight", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Raider" }, "raider").build();
    await game.p1.move("raider", "bf1");
    expect(game.actingSeat()).toBe(P1); // attacker holds Focus
    expect(game.p1.can("cast", "kv")).toBe(true);
    await game.p1.cast("kv", { targets: "target" });
    game.script(P2, ["mainDeck-bottom"]);
    await game.settle();
    expect(game.zoneOf("target")).toBe("mainDeck");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.state("raider").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Action] on the OPPONENT's turn inside their showdown: as the defender holding Focus, send the 5-Might attacker to its owner's deck — your 2-Might unit keeps bf2", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { rainbow: 2 } })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .hand(P1, CARD, "kv")
      .build();
    expect(game.p1.can("cast", "kv")).toBe(false); // P2's open main phase
    await game.p2.move("raider", "bf2");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "kv")).toBe(true); // an attacker at bf2 is "an enemy unit at a battlefield"
    await game.p1.cast("kv", { targets: "raider" });
    game.script(P2, ["mainDeck-top"]);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("mainDeck");
    expect(game.p2.deck()[0]).toBe("raider");
    expect(game.zoneOf("mine")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
