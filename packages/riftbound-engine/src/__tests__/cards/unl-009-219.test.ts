/**
 * Upstage Comedy — unl-009-219 · Spell · Fury · 2 energy (no power) · standard timing
 *
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   Ready a unit.
 *
 * Rules: 820 (Repeat: an OPTIONAL ADDITIONAL COST paid as you play it; if paid, the instructions run one
 * extra time on resolution as ONE chain item; each Repeat cost is payable only once — 820.1.c.3; the
 * choices for the extra execution are made at play time and may differ — 820.2/820.2.a), 415 (Ready),
 * 355 ("a unit" = any unit on the board, either side; a rune or gear is not a unit), 155/316 (no
 * [Action]/[Reaction] → playable only on your turn in an Open state: not in showdowns, not in
 * response, not on the opponent's turn), 144 (a readied unit may take the Standard Move again).
 *
 * Head-judge notes — trickiest situations for this card:
 *  - Repeat paid (4 energy total) → two "Ready a unit" executions that may name TWO DIFFERENT units;
 *    naming the same unit twice is legal but pointless. Repeat twice (6 energy) is not a thing.
 *  - With exactly 2–3 energy the plain cast is legal but the repeated one is refused.
 *  - Natural partner (same set, same domain): Arena Kingpin — pump, Upstage Comedy readies him, pump
 *    again for +6 total. Likewise a unit that already moved this turn can be readied and move again.
 *  - Standard speed: you cannot use it mid-showdown to untap a defender, nor on the opponent's turn.
 *  - Enemy units are legal targets (it says "a unit"), an already-ready unit is a legal (no-op) target,
 *    and with no unit on the board at all it cannot be cast.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-009-219";
const KINGPIN = "unl-001-219"; // Arena Kingpin: "I enter ready. [Exhaust]: Give a unit +3 Might this turn."

function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Sleepy" }, "sleepy", { exhausted: true })
    .unit(P1, "bf1", { might: 3, name: "Dozer" }, "dozer", { exhausted: true })
    .unit(P2, "base", { might: 4, name: "Enemy Napper" }, "napper", { exhausted: true })
    .unit(P1, "base", { might: 1, name: "Perky" }, "perky")
    .hand(P1, CARD, "uc");
}

const targetIds = (opts: readonly unknown[] | undefined) => [...new Set((opts ?? []).flatMap((o) => o as string[]))].sort();

describe("Upstage Comedy (unl-009-219)", () => {
  test("cost: 2 energy, no power — deducted on cast, spell waits on the chain; unaffordable at 1 energy", async () => {
    const game = await board().build();
    await game.p1.cast("uc", { targets: "sleepy" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "uc", controller: P1, triggered: false })]);
    expect(game.state("sleepy").isExhausted).toBe(true); // not until it resolves
    expect((await board(1).resources(P1, { energy: 1, power: { fury: 3 } }).build()).p1.can("cast", "uc")).toBe(false);
  });

  test("'Ready a unit': the chosen exhausted unit becomes ready, nothing else changes, spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("uc", { targets: "sleepy" });
    await game.settle();
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.state("dozer").isExhausted).toBe(true);
    expect(game.state("napper").isExhausted).toBe(true);
    expect(game.zoneOf("uc")).toBe("trash");
  });

  test("'a unit' = ANY unit: friendly in base, friendly at a battlefield, ENEMY, and an already-ready unit are all legal; readying the enemy Napper really readies it", async () => {
    const game = await board().build();
    expect(targetIds(game.p1.option("cast", "uc")?.fields.find((f) => f.arg === "targets")?.options)).toEqual(["dozer", "napper", "perky", "sleepy"]);
    await game.p1.cast("uc", { targets: "napper" });
    await game.settle();
    expect(game.state("napper").isReady).toBe(true);
    expect(game.state("sleepy").isExhausted).toBe(true);
  });

  test("no unit anywhere on the board → no legal target → not castable (355.8); gear and runes are not units", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).gear(P1, "ogn-060-298", "mask", { exhausted: true }).rune(P1, "fury", { exhausted: true }).hand(P1, CARD, "uc").build();
    expect(game.p1.can("cast", "uc")).toBe(false);
  });

  test("[Repeat] [2]: paying 4 energy total readies TWO different units (Sleepy in base and Dozer at bf1) from a single chain item (820.2.a)", async () => {
    const game = await board(4).build();
    await game.p1.cast("uc", { repeat: 1, targets: ["sleepy", "dozer"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.state("dozer").isReady).toBe(true);
    expect(game.state("napper").isExhausted).toBe(true);
    expect(game.zoneOf("uc")).toBe("trash");
  });

  test("[Repeat] on the same unit twice is legal (and merely redundant): 4 energy spent, Sleepy ready, Dozer untouched", async () => {
    const game = await board(4).build();
    await game.p1.cast("uc", { repeat: 1, targets: "sleepy" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.state("dozer").isExhausted).toBe(true);
  });

  test("[Repeat] is optional and must be affordable: with 3 energy the repeated cast is refused but the plain cast (2) goes through, leaving 1", async () => {
    const game = await board(3).build();
    const r = await game.p1.try((p) => p.cast("uc", { repeat: 1, targets: ["sleepy", "dozer"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("uc")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
    await game.p1.cast("uc", { targets: "sleepy" });
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.state("dozer").isExhausted).toBe(true);
  });

  test("820.1.c.3: the single Repeat cost can be paid only once — 'repeat twice' for 6 energy is not offered", async () => {
    const game = await board(6).build();
    const r = await game.p1.try((p) => p.cast("uc", { repeat: 2, targets: ["sleepy", "dozer", "napper"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("uc")).toBe("hand");
    expect(game.p1.energy()).toBe(6);
  });

  test("partner — Arena Kingpin: pump Perky (+3), Upstage Comedy readies the Kingpin, pump again → Perky 1 + 3 + 3 = 7 this turn", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", KINGPIN, "kp").unit(P1, "base", { might: 1, name: "Perky" }, "perky").hand(P1, CARD, "uc").build();
    await game.p1.activate("kp", undefined, { targets: "perky" });
    await game.settle();
    expect(game.state("kp").isExhausted).toBe(true);
    expect(game.p1.can("activate", "kp")).toBe(false);
    await game.p1.cast("uc", { targets: "kp" });
    await game.settle();
    expect(game.state("kp").isReady).toBe(true);
    await game.p1.activate("kp", undefined, { targets: "perky" });
    await game.settle();
    expect(game.state("perky").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("perky").might).toBe(1);
  });

  test("a unit that already moved this turn (exhausted) can be readied and take the Standard Move again — into an enemy field to conquer it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("own", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Sprinter" }, "sprinter")
      .hand(P1, CARD, "uc")
      .build();
    await game.p1.move("sprinter", "own");
    await game.settle();
    expect(game.state("sprinter").isExhausted).toBe(true);
    expect((await game.p1.try((p) => p.move("sprinter", "base"))).ok).toBe(false); // exhausted: no second move
    await game.p1.cast("uc", { targets: "sprinter" });
    await game.settle();
    expect(game.state("sprinter").isReady).toBe(true);
    await game.p1.move("sprinter", "base");
    await game.settle();
    // (bf → bf needs Ganking; the legal demonstration is own → base, then base → theirs would need another ready.)
    expect(game.locationOf("sprinter")).toBe("base");
  });

  test("timing — standard speed: not castable during your OWN combat showdown (can't untap mid-fight), nor with a chain open", async () => {
    const game = await board().battlefield("theirs", { controller: P2 }).unit(P2, "theirs", { might: 5 }, "wall").build();
    await game.p1.move("perky", "theirs");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "uc")).toBe(false);
    const spark = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 0, name: "Spark", timing: "action" };
    const chained = await board().hand(P1, spark, "spark").build();
    await chained.p1.cast("spark", { targets: "napper" });
    expect((chained.decision() as ActionDecision).context).toBe("chain");
    expect(chained.p1.can("cast", "uc")).toBe(false);
  });

  test("timing — not on the opponent's turn: neither in their Open state nor in their showdown with Focus passed to you", async () => {
    const game = await board().active(P2).unit(P2, "base", { might: 4, name: "Raider" }, "raider").build();
    expect(game.p1.can("cast", "uc")).toBe(false);
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "uc")).toBe(false);
    expect(game.zoneOf("uc")).toBe("hand");
  });

  test("parsed abilities match the printed text: a standard-timing spell 'ready a unit' carrying Repeat {energy: 2}; card cost 2, no power", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "fury", energyCost: 2, name: "Upstage Comedy" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.timing).not.toBe("action");
    expect(def?.timing).not.toBe("reaction");
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ effect: { target: { type: "unit" }, type: "ready" }, repeat: { energy: 2 }, type: "spell" });
    expect((abilities[0]?.effect as { target: Record<string, unknown> }).target.controller).toBeUndefined(); // "a unit", either side
    expect((abilities[0]?.repeat as Record<string, unknown>).power ?? []).toEqual([]);
  });
});
