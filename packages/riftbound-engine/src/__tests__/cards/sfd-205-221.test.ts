/**
 * Grand Duelist — sfd-205-221 · Legend (Fiora) · Body/Order
 *
 *   When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted.
 *   (A unit is Mighty while it has 5+ [Might].)
 *
 * Rules: 709 (a unit BECOMES Mighty only when its Might crosses from <5 to ≥5; 5→6 is not becoming
 * Mighty), 710 (evaluated on CURRENT Might — temporary bonuses and a defender's Shield count),
 * 383.3.a/383.3.b (a leading "you may [cost] to …": the yes/no AND the exhaust are settled at
 * finalization; "no" removes the item as if it never triggered), 430.2/430.3 (channel exhausted =
 * top rune of the rune deck enters the pool exhausted; with no runes left channel as many as
 * possible, i.e. none), 108.2 ("your units" = units you CONTROL, whoever caused the Might change).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. The cost is one exhaust per legend: two units becoming Mighty off one Back to Back raise two
 *     triggers, but only the first can be paid → exactly one rune.
 *  2. Whose unit, not whose spell: P1 Punch-First-ing P2's unit triggers P2's Grand Duelist (on
 *     P1's turn) and never P1's.
 *  3. Defender's Shield on the OPPONENT's turn: a 4-Might [Shield] unit becomes 5 as it is
 *     designated defender → the prompt goes to P1 mid-combat on P2's turn.
 *  4. Negative space: 5→10 (already Mighty), 2→4 (one short), legend already exhausted (no prompt,
 *     nothing channeled), declining (legend stays ready, chain item vanishes).
 *  5. Empty rune deck: "yes" is still legal (the cost is the exhaust), it just channels nothing.
 *  6. Across turns: the +5 expires, the legend readies at P1's next Awaken, and pumping the same
 *     unit again is a NEW crossing → it triggers again.
 *  7. Partner: Fiora, Worthy (pay [order] to ready the unit) triggers off the same event — both
 *     optional items are offered and both effects land.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-205-221";
const PUNCH_FIRST = "sfd-097-221"; // Spell · Body · 1 + [body][body] · [Action] Give a unit +5 Might this turn.
const BACK_TO_BACK = "ogn-206-298"; // Spell · Order · 3 · [Reaction] Give two friendly units each +2 Might this turn.
const FIORA_WORTHY = "sfd-180-221"; // Unit · Order · 3 Might · When a unit you control becomes Mighty, you may pay [order] to ready it.
const LEONA = "ven-184-166"; // Unit · Order · 4 Might · [Shield] (+1 Might while defending) …

/** P1: Grand Duelist legend, a 4-Might unit, Punch First in hand and exactly its cost floating. */
function withPunch(might = 4) {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 2 } })
    .legend(P1, CARD, "gd")
    .unit(P1, "base", { might, name: "Student" }, "ally")
    .hand(P1, PUNCH_FIRST, "punch");
}

describe("Grand Duelist (sfd-205-221)", () => {
  test("registry payload: Legend (Fiora, Body/Order) with one optional 'friendly unit becomes Mighty' trigger — cost: exhaust self; effect: channel 1 exhausted", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Fiora", domain: ["body", "order"], name: "Grand Duelist" });
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { exhaust: true }, type: "pay-cost" },
        effect: { amount: 1, exhausted: true, type: "channel" },
        optional: true,
        trigger: { event: "become-mighty", on: "friendly-units" },
        type: "triggered",
      },
    ]);
  });

  test("4 → 9 via Punch First: the trigger is offered at finalization; 'yes' exhausts the legend at once (383.3.b.1) and, on resolution, channels the top rune EXHAUSTED", async () => {
    const game = await withPunch().runes(P1, "body", 2).build();
    const runeDeckBefore = game.p1.runeDeck().length;
    await game.p1.cast("punch", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.state("ally").might).toBe(9);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "gd" } });
    expect(game.state("gd").isExhausted).toBe(false);
    await game.p1.yes();
    expect(game.state("gd").isExhausted).toBe(true); // cost paid to finalize
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gd", controller: P1, triggered: true })]);
    expect(game.p1.runes()).toHaveLength(2); // nothing channeled before resolution
    await game.settle();
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 1);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  test("declining (383.3.a.2): the item leaves the chain, the legend stays ready, no rune is channeled", async () => {
    const game = await withPunch().build();
    await game.p1.cast("punch", { targets: "ally" });
    await game.settle();
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("gd").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.state("ally").might).toBe(9);
  });

  test("negative space — already Mighty (709): a 5-Might unit going to 10 raises no prompt", async () => {
    const game = await withPunch(5).build();
    await game.p1.cast("punch", { targets: "ally" });
    const r = await game.settle();
    expect(r.reason).not.toBe("unanswered");
    expect(game.state("ally").might).toBe(10);
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("gd").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("negative space — one short: Back to Back taking two 2-Might units to 4 each triggers nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .legend(P1, CARD, "gd")
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P1, "base", { might: 2 }, "b")
      .hand(P1, BACK_TO_BACK, "b2b")
      .build();
    await game.p1.cast("b2b", { targets: ["a", "b"] });
    const r = await game.settle();
    expect(r.reason).not.toBe("unanswered");
    expect([game.state("a").might, game.state("b").might]).toEqual([4, 4]);
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("two units become Mighty at once (Back to Back on two 3s): two triggers, but the legend exhausts only once → exactly ONE rune channeled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .legend(P1, CARD, "gd")
      .unit(P1, "base", { might: 3 }, "a")
      .unit(P1, "base", { might: 3 }, "b")
      .hand(P1, BACK_TO_BACK, "b2b")
      .build();
    const runeDeckBefore = game.p1.runeDeck().length;
    await game.p1.cast("b2b", { targets: ["a", "b"] });
    await game.settle();
    expect(game.chain().filter((i) => i.cardId === "gd")).toHaveLength(2);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.state("gd").isExhausted).toBe(true);
    // The second item can no longer be paid for: either it is dropped or its prompt cannot be accepted.
    game.script(P1, [(d) => (d.kind === "yes-no" ? (d.canAccept === false ? "no" : "yes") : undefined)]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 1);
  });

  test("'one of YOUR units' (108.2): P1 pumping P2's unit triggers P2's Grand Duelist on P1's turn — P2 channels, P1's legend never stirs", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { body: 2 } })
      .legend(P1, CARD, "gd")
      .legend(P2, CARD, "gd2")
      .unit(P2, "base", { might: 4, name: "Foe" }, "foe")
      .hand(P1, PUNCH_FIRST, "punch")
      .build();
    await game.p1.cast("punch", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(9);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "gd2" } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["gd2"]);
    await game.p2.yes();
    await game.settle();
    expect(game.state("gd2").isExhausted).toBe(true);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.state("gd").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("legend already exhausted: the unit still becomes Mighty but the unpayable 'you may exhaust me' yields no usable prompt and channels nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { body: 2 } })
      .card("gd", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "base", { might: 4 }, "ally")
      .hand(P1, PUNCH_FIRST, "punch")
      .build();
    expect(game.state("gd").isExhausted).toBe(true);
    await game.p1.cast("punch", { targets: "ally" });
    game.script(P1, [(d) => (d.kind === "yes-no" ? (d.canAccept === false ? "no" : "yes") : undefined)]);
    await game.settle();
    expect(game.state("ally").might).toBe(9);
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.state("gd").isExhausted).toBe(true);
  });

  test("Shield on the opponent's turn (710): P1's 4-Might Leona designated defender becomes 5 → P1 is asked mid-combat on P2's turn; yes → exhausted rune, and the 2-Might attacker dies to her 5", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .legend(P1, CARD, "gd")
      .unit(P1, "bf1", LEONA, "leona")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("leona")).toMatchObject({ combatRole: "defender", might: 5 });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gd" } });
    await game.p1.yes();
    expect(game.state("gd").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("leona")).toBe("battlefield-bf1");
    expect(game.turnPlayer()).toBe(P2);
  });

  test("empty rune deck (430.3): 'yes' is still legal — the legend exhausts — but nothing can be channeled", async () => {
    const game = await withPunch().fillDecks({ main: 10, runes: 0 }).build();
    expect(game.p1.runeDeck()).toHaveLength(0);
    await game.p1.cast("punch", { targets: "ally" });
    await game.settle();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("gd").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
  });

  test("across turns: the +5 expires (4 again), the legend readies at P1's next Awaken, and pumping the same unit again is a NEW crossing that triggers again", async () => {
    const game = await withPunch().hand(P1, PUNCH_FIRST, "punch2").build();
    await game.p1.cast("punch", { targets: "ally" });
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    await game.advanceTurn(); // → P2
    expect(game.state("ally").might).toBe(4); // "this turn" bonus gone → no longer Mighty
    expect(game.state("gd").isExhausted).toBe(true); // still exhausted during P2's turn
    await game.advanceTurn(); // → P1: Awaken readies legend + runes, Channel adds 2
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("gd").isExhausted).toBe(false);
    const runesNow = game.p1.runes().length;
    expect(runesNow).toBe(3);
    await game.p1.do("addResources", { energy: 1, power: { body: 2 } });
    await game.p1.cast("punch2", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(9);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gd" } });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.runes()).toHaveLength(runesNow + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });

  test("partner — Fiora, Worthy (3 Might, exhausted) is Punched to 8: her own 'pay [order] to ready it' AND the legend's channel both trigger; paying both readies her and channels an exhausted rune", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { body: 2, order: 1 } })
      .legend(P1, CARD, "gd")
      .unit(P1, "base", FIORA_WORTHY, "fiora", { exhausted: true })
      .hand(P1, PUNCH_FIRST, "punch")
      .build();
    await game.p1.cast("punch", { targets: "fiora" });
    // Both optional items are P1's; accept every yes/no P1 is asked (order of asking is P1's choice, 383.3.d).
    game.script(P1, [(d) => (d.kind === "yes-no" ? "yes" : undefined), (d) => (d.kind === "yes-no" ? "yes" : undefined)]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("fiora").might).toBe(8);
    expect(game.state("fiora").isExhausted).toBe(false); // readied by Fiora, Worthy
    expect(game.p1.power("order")).toBe(0); // [order] paid
    expect(game.state("gd").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });
});
