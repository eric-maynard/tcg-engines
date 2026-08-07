/**
 * Fae Dragon — sfd-101-221 · Unit · Body · 7 energy + [body] · 7 Might
 *
 *   When you play me, buff up to four friendly units. (Give each a +1 [Might] buff if it doesn't
 *   have one.)
 *   When you spend a buff, play a Gold gear token exhausted.
 *
 * Rules: 383.4.a (play effect on the chain), 355.13 ("up to four" → 0‥4 targets), 702.2.a / 702.3
 * (buff = +1 Might counter, max one per unit), 702.2.b (SPENDING a buff = removing a buff counter from
 * a unit you control, as a cost or instruction — a buff that disappears because the unit dies or
 * leaves the board was not spent), 187.5 / 184.1 (Gold gear token, created exhausted).
 *
 * Judge's corner — trickiest situations for this card:
 *  - "friendly units" (not "other"): the Dragon may buff itself → 8 Might; enemy units are never offered.
 *  - "up to four": four of five friendlies, exactly one, or none at all are all legal resolutions.
 *  - Buffing is not spending: resolving its own play effect must not mint Gold.
 *  - Every way YOU spend a buff counts — an optional additional cost (Wallop), a cost-reducer that
 *    spends several (Kraken Hunter → one Gold PER buff), or a "spend a buff to …" instruction
 *    (Wildclaw Shaman). The opponent spending their buff, or a buffed unit dying, gives nothing.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-101-221";
const WALLOP = "ogn-146-298"; // [Action] 2: you may spend a buff as an additional cost → free. Ready a unit.
const KRAKEN = "ogn-150-298"; // 3 + [body][body]: spend any number of buffs, −[body] each.
const SHAMAN = "ogn-147-298"; // 4: When you play me, you may spend a buff to buff me and ready me.

const goldOf = (game: Game, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).name === "Gold");

function crowd() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1 } })
    .unit(P1, "base", { might: 1, name: "A" }, "a")
    .unit(P1, "base", { might: 1, name: "B" }, "b")
    .unit(P1, "base", { might: 1, name: "C" }, "c")
    .unit(P1, "base", { might: 1, name: "D" }, "d")
    .unit(P2, "base", { might: 1, name: "Foe" }, "foe")
    .hand(P1, CARD, "fae");
}

/** Play the Dragon and land on its target prompt. */
async function playToPrompt(game: Game): Promise<void> {
  await game.p1.play("fae");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fae" } });
}

describe("Fae Dragon (sfd-101-221)", () => {
  test("cost: 7 energy + 1 body for a 7-Might unit (enters exhausted); short of either → not playable", async () => {
    const game = await crowd().build();
    await game.p1.play("fae");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae")).toMatchObject({ baseMight: 7, isExhausted: true, might: 7 });
    expect((await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "fae").build()).p1.can("play", "fae")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6, power: { body: 2 } }).hand(P1, CARD, "fae").build()).p1.can("play", "fae")).toBe(false);
  });

  test("When you play me: only FRIENDLY units are offered (itself included), at most four; the four picked each get +1 Might", async () => {
    const game = await crowd().build();
    await playToPrompt(game);
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["a", "b", "c", "d", "fae"]);
    expect(d?.kind === "pick" && d.max).toBe(4);
    await game.p1.pick("a", "b", "c", "fae");
    await game.settle();
    for (const id of ["a", "b", "c"]) {
      expect(game.state(id)).toMatchObject({ isBuffed: true, might: 2 });
    }
    expect(game.state("fae")).toMatchObject({ isBuffed: true, might: 8 });
    expect(game.state("d")).toMatchObject({ isBuffed: false, might: 1 });
    expect(game.state("foe")).toMatchObject({ isBuffed: false, might: 1 });
    expect(game.decision()?.kind).toBe("action");
  });

  test("'up to four': a single pick buffs just that unit; declining buffs nobody", async () => {
    const one = await crowd().build();
    await playToPrompt(one);
    await one.p1.pick("b");
    if (one.decision()?.kind === "pick") {
      await one.p1.decline(); // stop after one
    }
    await one.settle();
    expect(one.state("b").isBuffed).toBe(true);
    expect(["a", "c", "d", "fae"].some((id) => one.state(id).isBuffed)).toBe(false);

    const none = await crowd().build();
    await playToPrompt(none);
    await none.p1.decline();
    await none.settle();
    expect(["a", "b", "c", "d", "fae"].some((id) => none.state(id).isBuffed)).toBe(false);
    expect(none.state("fae").might).toBe(7);
  });

  test("a unit that already has a buff doesn't get a second one (702.3): still exactly +1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { body: 1 } })
      .unit(P1, "base", { might: 3, name: "Vet" }, "vet", { buffed: true })
      .hand(P1, CARD, "fae")
      .build();
    expect(game.state("vet").might).toBe(4);
    await playToPrompt(game);
    await game.p1.pick("vet", "fae");
    await game.settle();
    expect(game.state("vet")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.state("fae")).toMatchObject({ isBuffed: true, might: 8 });
  });

  test("buffing is not spending: resolving the Dragon's own play effect mints no Gold", async () => {
    const game = await crowd().build();
    await playToPrompt(game);
    await game.p1.pick("a", "b", "c", "d");
    await game.settle();
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(game.p1.gear()).toHaveLength(0);
  });

  test.failing("BUG: When you spend a buff — paying Wallop's optional cost with a friendly buff plays one exhausted Gold token", async () => {
    // Expected: buff removed, Wallop free, and a Gold gear token (exhausted) in P1's base once the
    // trigger resolves. Actual: the buff is spent but no spend-buff trigger reaches the Dragon.
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .unit(P1, "base", CARD, "fae")
      .unit(P1, "base", { might: 2, name: "Buffed" }, "buffed", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Tired" }, "tired", { exhausted: true })
      .hand(P1, WALLOP, "wallop")
      .build();
    await game.p1.cast("wallop", { payOptional: true, targets: "tired" });
    expect(game.state("buffed").isBuffed).toBe(false);
    await game.settle();
    expect(game.state("tired").isReady).toBe(true);
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, owner: P1 });
  });

  test.failing("BUG: each buff spent is its own trigger — Kraken Hunter spending two buffs plays TWO Gold tokens", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", CARD, "fae")
      .unit(P1, "base", { might: 2 }, "x", { buffed: true })
      .unit(P1, "base", { might: 2 }, "y", { buffed: true })
      .hand(P1, KRAKEN, "kh")
      .build();
    await game.p1.play("kh");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("kh")).toBe("base");
    expect(game.state("x").isBuffed || game.state("y").isBuffed).toBe(false);
    expect(goldOf(game, "p1")).toHaveLength(2);
  });

  test.failing("BUG: a 'spend a buff to …' instruction (Wildclaw Shaman) is also a spend → one Gold token", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", CARD, "fae")
      .unit(P1, "base", { might: 2 }, "x", { buffed: true })
      .hand(P1, SHAMAN, "sh")
      .build();
    await game.p1.play("sh");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("x");
      await game.settle();
    }
    expect(game.state("x").isBuffed).toBe(false);
    expect(game.state("sh")).toMatchObject({ isBuffed: true, isReady: true });
    expect(goldOf(game, "p1")).toHaveLength(1);
  });

  test("'When YOU spend': the opponent spending their own buff on their turn gives nobody Gold", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 0 })
      .unit(P1, "base", CARD, "fae")
      .unit(P2, "base", { might: 2 }, "theirs", { buffed: true })
      .unit(P2, "base", { might: 2 }, "sleepy", { exhausted: true })
      .hand(P2, WALLOP, "wallop")
      .build();
    await game.p2.cast("wallop", { payOptional: true, targets: "sleepy" });
    await game.settle();
    expect(game.state("theirs").isBuffed).toBe(false);
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(goldOf(game, "p2")).toHaveLength(0);
  });

  test("a buff that vanishes because its unit DIES was not spent (702.2.b): no Gold", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "fae")
      .unit(P1, "base", { might: 1, name: "Doomed" }, "doomed", { buffed: true })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .build();
    expect(game.state("doomed").might).toBe(2);
    await game.p1.move("doomed", "bf1");
    await game.settle();
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("parsed ability shape: [play-self → buff up to 4 friendly units] + [spend-buff → exhausted Gold gear token]", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 7, might: 7 });
    expect(def?.powerCost).toEqual(["body"]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { controller: "friendly", quantity: { upTo: 4 }, type: "unit" }, type: "buff" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
    expect((def?.abilities?.[0] as { effect?: { target?: { excludeSelf?: boolean } } }).effect?.target?.excludeSelf).not.toBe(true);
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      trigger: { event: "spend-buff" },
      type: "triggered",
    });
  });
});
