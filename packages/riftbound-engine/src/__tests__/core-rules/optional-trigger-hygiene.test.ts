/**
 * Core rules — prompt hygiene for OPTIONAL triggered abilities (402.4 / 404.2).
 *
 * CARD-INDEPENDENT: every unit below is an inline filler definition.
 *
 * A leading "you may" is answered by the controller while the item is FINALIZED
 * (383.3.a / 402.1). But the question is only worth asking when "yes" can
 * actually be carried out: an item whose mandatory Game-Object slot has zero
 * legal candidates (402.4) or whose base cost cannot be paid (383.3.b.1 / 404.2)
 * leaves the Chain by itself — no Yes/No prompt, no countering.
 *
 * Rules covered (riftbound-rules ids):
 *   383.3.a / 402.1   leading "you may" decided at finalization by the controller
 *   402.4             no legal choice ⇒ removed unfinalized, never asked
 *   402.4.b           having opted in, the sole legal object is bound (no decline)
 *   383.3.b.1 / 404.2 an unpayable base cost removes the item instead of prompting
 *   355.8             an ability needing a Game Object with no candidate does nothing
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

/** Unit · 2 Might · "When you play me, you may return an enemy unit to its owner's hand." */
const MAY_BOUNCER = {
  abilities: [
    {
      effect: { target: { controller: "enemy", type: "unit" }, type: "return-to-hand" },
      optional: true,
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler May Bouncer",
};

/** Unit · 2 Might · "When you play me, you may return a non-Beast unit to its owner's hand." */
const MAY_TAG_BOUNCER = {
  abilities: [
    {
      effect: { target: { filter: { excludeTag: "Beast" }, type: "unit" }, type: "return-to-hand" },
      optional: true,
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler May Tag Bouncer",
  tags: ["Beast"],
};

/** Unit · 3 Might · plain body carrying the Beast tag. */
const BEAST = {
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 3,
  name: "Filler Beast",
  tags: ["Beast"],
};

/** Unit · 3 Might · vanilla, no tags. */
const VANILLA = {
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 3,
  name: "Filler Vanilla",
};

/** Unit · 2 Might · "When you play me, you may exhaust me to draw 1." */
const MAY_EXHAUST_DRAWER = {
  abilities: [
    {
      condition: { cost: { exhaust: true }, type: "pay-cost" },
      effect: { amount: 1, type: "draw" },
      optional: true,
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler May Exhaust Drawer",
};

describe("402.4 — an optional trigger with no legal object is never offered", () => {
  test("'you may return an ENEMY unit' with an empty enemy board: no Yes/No, nothing on the Chain, P1 stays in an open main phase", async () => {
    const game = await scenario().hand(P1, MAY_BOUNCER, "b").build();
    await game.p1.play("b");
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // rule 355.9.b — the printed restriction is part of the candidate test, so a
  // board full of Beasts is just as empty as an empty board.
  test("'you may return a NON-BEAST unit' while every unit in play is a Beast: still no prompt (the filter is part of legality, 355.9.b)", async () => {
    const game = await scenario()
      .unit(P1, "base", BEAST, "myBeast")
      .unit(P2, "base", BEAST, "theirBeast")
      .hand(P1, MAY_TAG_BOUNCER, "t")
      .build();
    await game.p1.play("t");
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("myBeast")).toBe("base");
    expect(game.zoneOf("theirBeast")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("one legal object: the controller IS asked, and 'yes' binds it without a menu (402.4.b) before P2 gets priority", async () => {
    const game = await scenario().unit(P2, "base", VANILLA, "foe").hand(P1, MAY_BOUNCER, "b").build();
    await game.p1.play("b");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.chain()).toEqual([expect.objectContaining({ targets: ["foe"] })]);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("declining a genuinely performable trigger removes it un-countered (402.1.a): the enemy unit stays put", async () => {
    const game = await scenario().unit(P2, "base", VANILLA, "foe").hand(P1, MAY_BOUNCER, "b").build();
    await game.p1.play("b");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("383.3.b.1 / 404.2 — an unpayable base cost removes the item instead of prompting", () => {
  // Units enter play exhausted (rule 337 play sub-steps), so "you may exhaust me"
  // on a play-self trigger can never be paid — the item leaves the Chain silently.
  test("'you may exhaust me to draw 1' fired by my own arrival, while I am already exhausted: no Yes/No and no card drawn", async () => {
    const game = await scenario()
      .fillDecks({ main: 5, runes: 0 })
      .hand(P1, MAY_EXHAUST_DRAWER, "d")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.play("d");
    expect(game.state("d").isExhausted).toBe(true);
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(hand0 - 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
