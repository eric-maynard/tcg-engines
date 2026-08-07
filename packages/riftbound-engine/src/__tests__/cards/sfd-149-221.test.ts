/**
 * Ezreal, Prodigy — sfd-149-221 · Champion Unit · Chaos · 3 energy + [chaos] · 3 Might · Ezreal
 *
 *   When you play me, discard 1, then draw 2.
 *   Optional additional costs you pay cost [1] or [rainbow] less.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - Play trigger is a triggered ability on the chain: the discard is a chosen card from hand
 *    (422.1.a) and happens BEFORE the draws; with an empty hand the discard is ignored and you
 *    still draw 2 (359.3.e.11 / 422.4 — "then" is sequencing, not "if you do").
 *  - Discard-matters partner: pitching Scrapheap ("When this is … discarded … draw 1") nets 3 draws.
 *  - The static is a PASSIVE of a permanent: only while Ezreal is on the board, only for costs YOU
 *    pay, and only OPTIONAL ADDITIONAL costs (356.2.b): Accelerate [1][C] (805.2), Repeat tiers
 *    (820.1), "you may pay X as an additional cost" riders (Sea Monkey). 356.4.c: the discount is
 *    applied per optional cost as it is added; 356.4.f: it may take that cost to 0 and the cost still
 *    counts as "paid" (356.4.f.1) so the rider's payoff happens.
 *  - "[1] OR [rainbow]": the payer picks which half of a two-part cost is shaved (Accelerate becomes
 *    either [C] alone or [1] alone) — with only one half affordable the other must be the one dropped.
 *  - Must NOT reduce: base costs of cards, the Hide cost (811 — a discretionary action's cost, not an
 *    additional cost to play), or anything an opponent pays.
 *  - Two Ezreals stack: [1][chaos] Accelerate becomes free.
 *  - Cost edge: 3 + [chaos]; [rainbow] in the pool can stand in for the chaos pip; enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-149-221";
const FILLER = "ogn-175-298"; // Shipyard Skulker, vanilla 3-might unit (hand padding)
const SCRAPHEAP = "ogn-182-298"; // gear: "When this is played, discarded, or killed, draw 1."
const WARMONGER = "sfd-131-221"; // 5-cost chaos unit, [Accelerate] ([1][chaos])
const SEA_MONKEY = "sfd-098-221"; // 2-cost unit: "You may pay [1] as an additional cost… if you paid, buff me."
const BLOOD_RUSH = "sfd-003-221"; // 1-cost Action spell, [Repeat] [1], give a unit Assault 2
const PAKAA_CUB = "ogn-135-298"; // 3-cost unit with [Hidden]
const VENGEANCE = "ogn-229-298"; // 4 + [order][order]: Kill a unit.

describe("Ezreal, Prodigy (sfd-149-221)", () => {
  test("parsed abilities match the printed text: play-self trigger (discard 1 → draw 2) + static flexible reduction on optional additional costs", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 3, isChampion: true, might: 3, powerCost: ["chaos"], tags: ["Ezreal"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({
      effect: { effects: [{ amount: 1, type: "discard" }, { amount: 2, type: "draw" }], type: "sequence" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
    expect(abilities[1]).toMatchObject({
      effect: { alternative: { power: ["rainbow"] }, by: { energy: 1 }, type: "cost-reduction" },
      type: "static",
    });
  });

  test("cost: 3 energy + 1 chaos, enters the base exhausted as a 3-Might unit; 2 energy or a missing pip is not enough; [rainbow] pays the pip", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "ez").build();
    await game.p1.play("ez");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("ez")).toBe("base");
    expect(game.state("ez")).toMatchObject({ isExhausted: true, might: 3 });
    expect((await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, CARD, "ez").build()).p1.can("play", "ez")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "ez").build()).p1.can("play", "ez")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "ez").build()).p1.can("play", "ez")).toBe(false);
    const rainbow = await scenario().resources(P1, { energy: 3, power: { rainbow: 1 } }).hand(P1, CARD, "ez").build();
    expect(rainbow.p1.can("play", "ez")).toBe(true);
  });

  test("play trigger: goes on the chain; on resolution I choose 1 of my 2 cards to discard, THEN draw 2 (hand 2 → 3, chosen card in trash)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .hand(P1, CARD, "ez")
      .hand(P1, FILLER, "keep")
      .hand(P1, FILLER, "pitch")
      .build();
    const deckBefore = game.p1.deck().length;
    await game.p1.play("ez");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ez", triggered: true })]);
    expect(game.p1.hand()).toHaveLength(2); // nothing discarded/drawn before resolution
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("pitch");
    await game.settle();
    expect(game.zoneOf("pitch")).toBe("trash");
    expect(game.zoneOf("keep")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.deck()).toHaveLength(deckBefore - 2);
  });

  test("empty hand: the discard is ignored but the 2 draws still happen (359.3.e.11 / 422.4)", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "ez").build();
    await game.p1.play("ez");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("exactly one card in hand: it must be discarded (no declining), then draw 2 → hand of 2, that card in trash", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "ez").hand(P1, FILLER, "only").build();
    await game.p1.play("ez");
    const r = await game.settle(); // passive policy: takes only a FORCED single pick, never declines a target pick
    expect(r.reason).toBe("open");
    expect(game.zoneOf("only")).toBe("trash");
    expect(game.p1.trash()).toEqual(["only"]);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.hand()).not.toContain("only");
  });

  test("discard partner: pitching Scrapheap to Ezreal's trigger draws 1 more (2 + 1 = 3 cards from an otherwise empty hand)", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "ez").hand(P1, SCRAPHEAP, "heap").build();
    await game.p1.play("ez");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" }); // Scrapheap's own trigger, if it uses the chain
    expect(game.zoneOf("heap")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(3);
  });

  test("static — Accelerate [1][chaos] on Ancient Warmonger costs only [chaos] with Ezreal out: 5 energy + 1 chaos plays it READY and empties the pool", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .unit(P1, "base", CARD, "ez")
      .hand(P1, WARMONGER, "wm")
      .build();
    expect(game.p1.option("play", "wm")?.fields.find((f) => f.arg === "payOptional")?.options).toContain(true);
    await game.p1.play("wm", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("wm")).toBe("base");
    expect(game.state("wm").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("static — the OR: with no chaos power at all, the pip is the half that is dropped and Accelerate costs just [1] (6 energy total, enters ready)", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).unit(P1, "base", CARD, "ez").hand(P1, WARMONGER, "wm").build();
    await game.p1.play("wm", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.state("wm").isReady).toBe(true);
    expect(game.p1.resources().energy).toBe(0);
  });

  test("356.4.c.1 — with BOTH halves affordable (6 energy + 1 chaos) the PAYER chooses; shaving the pip and paying [1] (keeping the chaos) must be possible", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { chaos: 1 } }).unit(P1, "base", CARD, "ez").hand(P1, WARMONGER, "wm").build();
    const specs = (game.p1.option("play", "wm")?.variants ?? []).map((v) => v.params.additionalCostSpec).filter(Boolean);
    expect(specs).toEqual(expect.arrayContaining([{ energy: 0, power: ["chaos"] }, { energy: 1, power: [] }]));
    await game.p1.play("wm", { accelerate: true, params: { additionalCostSpec: { energy: 1, power: [] } }, to: "base" });
    await game.settle();
    expect(game.state("wm").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
  });

  test("negative space — without Ezreal on the board (he is only in hand) 5 energy + 1 chaos cannot Accelerate the Warmonger", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .hand(P1, CARD, "ez")
      .hand(P1, WARMONGER, "wm")
      .build();
    expect(game.p1.option("play", "wm")?.fields.find((f) => f.arg === "payOptional")?.options ?? [false]).not.toContain(true);
    const r = await game.p1.try((p) => p.play("wm", { accelerate: true, to: "base" }));
    if (r.ok) {
      await game.settle();
      expect(game.state("wm").isReady).toBe(false);
    }
    expect(game.p1.power("chaos")).toBe(1);
  });

  test("negative space — an ENEMY Ezreal does not discount my optional costs", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .unit(P2, "base", CARD, "theirEz")
      .hand(P1, WARMONGER, "wm")
      .build();
    expect(game.p1.option("play", "wm")?.fields.find((f) => f.arg === "payOptional")?.options ?? [false]).not.toContain(true);
    const r = await game.p1.try((p) => p.play("wm", { accelerate: true, to: "base" }));
    if (r.ok) {
      await game.settle();
      expect(game.state("wm").isReady).toBe(false);
    }
  });

  test("static — 'you may pay [1]' rider (Sea Monkey) becomes free and still counts as paid (356.4.f.1): 2 energy plays it buffed", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ez").hand(P1, SEA_MONKEY, "monkey").build();
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("monkey")).toBe("base");
    expect(game.state("monkey").isBuffed).toBe(true);
    expect(game.state("monkey").might).toBe(3);
    expect(game.p1.energy()).toBe(0);
    // Control: same pool without Ezreal → the [1] rider is unaffordable on top of the base 2; not even offered.
    const ctrl = await scenario().resources(P1, { energy: 2 }).hand(P1, SEA_MONKEY, "monkey").build();
    expect(ctrl.p1.option("play", "monkey")?.fields.find((f) => f.arg === "payOptional")?.options ?? [false]).not.toContain(true);
    const t = await ctrl.p1.try((p) => p.play("monkey", { payOptional: true, to: "base" }));
    if (t.ok) {
      await ctrl.settle({ policy: "first" });
      expect(ctrl.state("monkey").isBuffed).toBe(false);
    }
  });

  test("static — [Repeat] [1] (Blood Rush) is an optional additional cost: with Ezreal out, 1 energy buys the repeated cast", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "ez")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, BLOOD_RUSH, "br")
      .build();
    await game.p1.cast("br", { repeat: 1, targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    // Control: no Ezreal → 1 energy cannot pay base [1] + Repeat [1].
    const ctrl = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, BLOOD_RUSH, "br").build();
    expect((await ctrl.p1.try((p) => p.cast("br", { repeat: 1, targets: "ally" }))).ok).toBe(false);
    expect(ctrl.zoneOf("br")).toBe("hand");
  });

  test("negative space — base costs are untouched: with Ezreal out a 3-cost Shipyard Skulker still needs 3 (2 energy → not playable)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ez").hand(P1, FILLER, "skulker").build();
    expect(game.p1.can("play", "skulker")).toBe(false);
    const ok = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "ez").hand(P1, FILLER, "skulker").build();
    await ok.p1.play("skulker");
    expect(ok.p1.energy()).toBe(0);
  });

  test("negative space — the Hide cost [rainbow] is not an additional cost (811): with Ezreal out and no power, a Hidden card cannot be hidden", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ez")
      .hand(P1, PAKAA_CUB, "cub")
      .build();
    expect(game.p1.can("hide", "cub")).toBe(false);
    const withPower = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ez")
      .hand(P1, PAKAA_CUB, "cub")
      .build();
    await withPower.p1.hide("cub", "bf1");
    expect(withPower.p1.power()).toBe(0); // full [rainbow] still charged
  });

  test("two Ezreals stack: [1][chaos] Accelerate becomes free — exactly 5 energy and no power plays the Warmonger ready", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .unit(P1, "base", CARD, "ez1")
      .unit(P1, "base", CARD, "ez2")
      .hand(P1, WARMONGER, "wm")
      .build();
    await game.p1.play("wm", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.state("wm").isReady).toBe(true);
    expect(game.p1.resources().energy).toBe(0);
  });

  test("only while on the board: after Ezreal is killed (Vengeance) the same turn, 5 energy + 1 chaos can no longer Accelerate the Warmonger", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { chaos: 1, order: 2 } })
      .unit(P1, "base", CARD, "ez")
      .hand(P1, VENGEANCE, "veng")
      .hand(P1, WARMONGER, "wm")
      .build();
    expect(game.p1.option("play", "wm")?.fields.find((f) => f.arg === "payOptional")?.options).toContain(true);
    await game.p1.cast("veng", { targets: "ez" });
    await game.settle();
    expect(game.zoneOf("ez")).not.toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { chaos: 1, order: 0 } });
    expect(game.p1.option("play", "wm")?.fields.find((f) => f.arg === "payOptional")?.options ?? [false]).not.toContain(true);
    const r = await game.p1.try((p) => p.play("wm", { accelerate: true, to: "base" }));
    if (r.ok) {
      await game.settle();
      expect(game.state("wm").isReady).toBe(false);
    }
    expect(game.p1.power("chaos")).toBe(1);
  });
});
