/**
 * Ezreal, Prodigy — ven-sp5-006 · Champion Unit · Chaos · 3 energy + [chaos] · 3 Might · Ezreal
 * (Vendetta promo printing of sfd-149-221 — same text, parsed independently.)
 *
 *   When you play me, discard 1, then draw 2.
 *   Optional additional costs you pay cost [1] or [rainbow] less.
 *
 * Head-judge notes — trickiest situations for THIS printing:
 *  1. Play Effect (383.4.a.2) is a chain item put there AFTER Ezreal enters the board: the opponent
 *     gets a priority window with Ezreal already in the base and P1's hand untouched.
 *  2. "discard 1, THEN draw 2" — discard is chosen from the current hand and precedes the draws;
 *     with an empty hand the discard is skipped and both draws still happen (422.4); with exactly
 *     one card that card must go (no decline).
 *  3. Played from the Champion Zone it is still "played" → the same trigger fires.
 *  4. The static reduces only OPTIONAL ADDITIONAL costs (356.2.b / 356.4.c names this very card):
 *     Accelerate [1][C] (805.2) on Mister Root / Renekton becomes [C]-only or [1]-only, payer's pick.
 *     It must NOT touch base costs, nor MANDATORY additional costs such as Deflect (356.2.a.2 / 809.1.d),
 *     and an Ezreal that is only in hand, or an enemy Ezreal, gives nothing.
 *  5. Cost edge: 3 + [chaos]; a [rainbow] power stands in for the chaos pip; 2 energy is short.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-sp5-006";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-cost unit
const MISTER_ROOT = "unl-127-219"; // 2-cost chaos unit, [Accelerate] ([1][chaos]), 1 Might
const RENEKTON = "ven-019-166"; // 6-cost fury champion, [Accelerate] ([1][fury])
const POUTY_PORO = "ogn-013-298"; // 2-might fury unit with [Deflect]
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
};

function ezInHand(extraHand: string[] = []) {
  const b = scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "ez");
  extraHand.forEach((alias) => b.hand(P1, FILLER, alias));
  return b;
}

const payOptionalOffered = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, card: string) =>
  game.p1.option("play", card)?.fields.find((f) => f.arg === "payOptional")?.options ?? [false];

describe("Ezreal, Prodigy (ven-sp5-006)", () => {
  test("parsed abilities should be play-self trigger (discard 1 → draw 2) AND the static optional-additional-cost reduction; the static is missing", async () => {
    // Expected two abilities (as on sfd-149-221); the VEN printing only carries the trigger.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 3, isChampion: true, might: 3, powerCost: ["chaos"], tags: ["Ezreal"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities[0]).toMatchObject({
      effect: { effects: [{ amount: 1, type: "discard" }, { amount: 2, type: "draw" }], type: "sequence" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
    expect(abilities).toHaveLength(2);
    expect(abilities[1]).toMatchObject({ effect: { type: "cost-reduction" }, type: "static" });
  });

  test("cost: exactly 3 energy + 1 chaos, enters the base exhausted at 3 Might; 2 energy / no pip / wrong-domain pip → not playable; [rainbow] pays the pip", async () => {
    const game = await ezInHand().build();
    await game.p1.play("ez");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("ez")).toBe("base");
    expect(game.state("ez")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect((await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, CARD, "ez").build()).p1.can("play", "ez")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "ez").build()).p1.can("play", "ez")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "ez").build()).p1.can("play", "ez")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { rainbow: 1 } }).hand(P1, CARD, "ez").build()).p1.can("play", "ez")).toBe(true);
  });

  test("play effect: Ezreal is on the board first, THEN the trigger sits on the chain and the opponent gets priority before anything is discarded (383.4.a.2)", async () => {
    const game = await ezInHand(["a", "b"]).build();
    await game.p1.play("ez");
    expect(game.zoneOf("ez")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ez", controller: P1, triggered: true })]);
    expect(game.p1.hand().sort()).toEqual(["a", "b"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("on resolution I pick which of my 2 cards to discard, then draw 2 (hand 2 → 3, deck −2, picked card in trash)", async () => {
    const game = await ezInHand(["keep", "pitch"]).build();
    const deck = game.p1.deck().length;
    await game.p1.play("ez");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("pitch");
    await game.settle();
    expect(game.zoneOf("pitch")).toBe("trash");
    expect(game.zoneOf("keep")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.deck()).toHaveLength(deck - 2);
    expect(game.chain()).toEqual([]);
  });

  test("empty hand: discard is skipped, both draws still happen (422.4) — hand 0 → 2, trash empty", async () => {
    const game = await ezInHand().build();
    await game.p1.play("ez");
    await game.settle();
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("exactly one card in hand: it is discarded BEFORE the draws (cannot keep it and pitch a drawn card) — trash = [only], hand = 2 fresh cards", async () => {
    const game = await ezInHand(["only"]).build();
    await game.p1.play("ez");
    await game.settle(); // a forced single pick is taken by the passive policy; a decline is never taken
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("only");
      await game.settle();
    }
    expect(game.p1.trash()).toEqual(["only"]);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.hand()).not.toContain("only");
  });

  test("played from the Champion Zone it is still 'played': same cost, same discard-then-draw trigger", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .champion(P1, CARD, "ez")
      .hand(P1, FILLER, "pitch")
      .build();
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("ez")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ez", triggered: true })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("pitch");
      await game.settle();
    }
    expect(game.zoneOf("pitch")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("static — Mister Root's Accelerate [1][chaos] should cost only [chaos] with Ezreal out: 2 energy + 1 chaos plays it READY with an empty pool (356.4.c)", async () => {
    // Expected: total 2 + [chaos]. Actual: the VEN printing has no static, so Accelerate still wants [1][chaos].
    const game = await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).unit(P1, "base", CARD, "ez").hand(P1, MISTER_ROOT, "root").build();
    expect(payOptionalOffered(game, "root")).toContain(true);
    await game.p1.play("root", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("root")).toBe("base");
    expect(game.state("root").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("static — the OR half: with no power at all the pip is dropped and Accelerate costs just [1] (3 energy → Mister Root enters ready, pool empty)", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "ez").hand(P1, MISTER_ROOT, "root").build();
    await game.p1.play("root", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.state("root").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  test("cross-domain partner — Renekton, Rage Fueled's Accelerate [1][fury] costs only [fury] with Ezreal out (6 energy + 1 fury → enters ready)", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).unit(P1, "base", CARD, "ez").hand(P1, RENEKTON, "renek").build();
    await game.p1.play("renek", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("renek")).toBe("base");
    expect(game.state("renek").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("negative space — Ezreal only in HAND, or an ENEMY Ezreal, gives no discount: 2 energy + 1 chaos cannot Accelerate Mister Root", async () => {
    for (const build of [
      scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, CARD, "ez").hand(P1, MISTER_ROOT, "root"),
      scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).unit(P2, "base", CARD, "theirEz").hand(P1, MISTER_ROOT, "root"),
    ]) {
      const game = await build.build();
      expect(payOptionalOffered(game, "root")).not.toContain(true);
      const r = await game.p1.try((p) => p.play("root", { accelerate: true, to: "base" }));
      if (r.ok) {
        await game.settle();
        expect(game.state("root").isReady).toBe(false);
      }
      expect(game.p1.power("chaos")).toBe(1); // the pip was never spent on an Accelerate
    }
  });

  test("negative space — base costs are untouched: with Ezreal out a 3-cost Skulker still needs 3 energy, and Mister Root without Accelerate still costs 2", async () => {
    const short = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ez").hand(P1, FILLER, "sk").build();
    expect(short.p1.can("play", "sk")).toBe(false);
    const root = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ez").hand(P1, MISTER_ROOT, "root").build();
    await root.p1.play("root", { accelerate: false, to: "base" });
    expect(root.p1.energy()).toBe(0);
    await root.settle();
    expect(root.state("root").isExhausted).toBe(true);
  });

  test("negative space — Deflect is a MANDATORY additional cost (356.2.a.2): with Ezreal out, choosing an enemy Pouty Poro still demands the full [rainbow]", async () => {
    const noPower = await scenario()
      .unit(P1, "base", CARD, "ez")
      .unit(P2, "base", POUTY_PORO, "poro")
      .hand(P1, BOLT, "bolt")
      .build();
    const targets = noPower.p1.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(targets).not.toContainEqual(["poro"]);
    expect((await noPower.p1.try((p) => p.cast("bolt", { targets: "poro" }))).ok).toBe(false);
    const withPower = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .unit(P1, "base", CARD, "ez")
      .unit(P2, "base", POUTY_PORO, "poro")
      .hand(P1, BOLT, "bolt")
      .build();
    await withPower.p1.cast("bolt", { targets: "poro" });
    expect(withPower.p1.power()).toBe(0); // the whole Deflect pip was charged
    await withPower.settle();
    expect(withPower.zoneOf("poro")).toBe("trash");
  });
});
