/**
 * Revna the Lorekeeper — unl-005-219 · Unit · Fury · 7 energy + [fury] · 7 Might
 *
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   When you play a spell, if you spent [4] or more, ready me.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - "[4]" is ENERGY and "spent" is what was actually PAID to play THAT spell: a 4-cost spell readies
 *    her, a 3-cost one does not; a 2-cost spell whose Repeat [2] was paid (4 spent in total) does;
 *    what matters is the payment, not the printed cost. Power spent elsewhere this turn (on units, on
 *    hiding) is irrelevant — a cheap spell after an expensive unit must NOT ready her.
 *  - Only YOUR spells ("when you play"); the opponent casting a 6-cost spell does nothing for her.
 *  - The payoff is a real extra action: exhausted after a move, a 4+ spell readies her and — having
 *    Ganking — she can immediately move battlefield → battlefield the same turn.
 *  - Ganking (810/144.4.c): bf → bf is a legal Standard Move for her; a vanilla unit beside her may not.
 *  - Already ready → nothing to do, no error. Cost 7 + [fury]; enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-005-219";
const DESERTS_CALL = "sfd-031-221"; // Spell · 2 energy · [Repeat] [2]: play a Sand Soldier token

/** Inline "Draw 1" spell of a given energy cost (standard speed). */
const drawSpell = (energyCost: number, name = `Study ${energyCost}`) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost,
  name,
  timing: "action",
});
/** Inline unit paid mostly in power: 0 energy + 4 fury. */
const POWER_HOG = { abilities: [], cardType: "unit", domain: "fury", energyCost: 0, might: 2, name: "Power Hog", powerCost: ["fury", "fury", "fury", "fury"] };

/** P1's turn: exhausted Revna at bf1 (she just moved there), two more battlefields, plenty of resources. */
function board(energy = 10) {
  return scenario()
    .resources(P1, { energy, power: { fury: 5 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", CARD, "revna", { exhausted: true })
    .unit(P1, "bf1", { might: 1, name: "Grunt" }, "grunt");
}

/** Cast `spell` as P1 and drain the chain (passes, forced picks, token → base). */
async function castAndResolve(game: Game, spell: string, opts: { repeat?: number } = {}): Promise<void> {
  await game.p1.cast(spell, opts);
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.options.some((o) => o.key === "base")) {
      await game.seat(d.seat).pick("base");
    } else if (d.kind === "pick" && d.options.length === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else {
      throw new Error(`unexpected ${d.kind} for ${d.seat}: ${d.prompt}`);
    }
  }
}

describe("Revna the Lorekeeper (unl-005-219)", () => {
  test("cost: 7 energy + 1 fury; enters the base exhausted as a 7-Might unit with printed Ganking; unaffordable without the fury or at 6", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { fury: 1 } }).hand(P1, CARD, "revna").build();
    await game.p1.play("revna");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("revna")).toBe("base");
    expect(game.state("revna")).toMatchObject({ isExhausted: true, might: 7 });
    expect(game.state("revna").keywords).toEqual(["Ganking"]);
    expect((await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6, power: { fury: 2 } }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
  });

  test("Ganking: from bf1 she may Standard-Move straight to another battlefield; the vanilla Grunt beside her may not", async () => {
    const game = await board().unit(P1, "bf1", CARD, "fresh").build(); // a READY Revna too
    expect(game.p1.can("gank", "fresh")).toBe(true);
    expect(game.p1.can("gank", "grunt")).toBe(false);
    expect(game.p1.can("gank", "revna")).toBe(false); // exhausted units do not move
    await game.p1.gank("fresh", "bf2");
    expect(game.locationOf("fresh")).toBe("bf2");
    expect(game.state("fresh").isExhausted).toBe(true);
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("playing a spell you paid [4] for readies her (exactly the threshold)", async () => {
    const game = await board().hand(P1, drawSpell(4), "study4").build();
    expect(game.state("revna").isExhausted).toBe(true);
    await castAndResolve(game, "study4");
    expect(game.p1.energy()).toBe(6);
    expect(game.zoneOf("study4")).toBe("trash");
    expect(game.state("revna").isReady).toBe(true);
  });

  test("…and the payoff is real: readied by the spell, she ganks bf1 → bf2 the same turn and takes it", async () => {
    const game = await board().hand(P1, drawSpell(5), "study5").build();
    await castAndResolve(game, "study5");
    expect(game.state("revna").isReady).toBe(true);
    await game.p1.gank("revna", "bf2");
    await game.settle();
    expect(game.locationOf("revna")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("a spell you spent only [3] on must NOT ready her — the [4] threshold is not enforced (any own spell readies her)", async () => {
    // Expected: Study 3 resolves, Revna stays exhausted. Actual: she is readied regardless of the amount spent.
    const game = await board().hand(P1, drawSpell(3), "study3").build();
    await castAndResolve(game, "study3");
    expect(game.p1.energy()).toBe(7);
    expect(game.zoneOf("study3")).toBe("trash");
    expect(game.state("revna").isExhausted).toBe(true);
    expect(game.p1.can("gank", "revna")).toBe(false);
  });

  test("'spent', not 'costs' — Desert's Call with Repeat [2] paid (4 spent) readies her, WITHOUT Repeat (2 spent) it must not (engine readies her either way)", async () => {
    // Expected: repeat-paid cast → ready; plain 2-cost cast → still exhausted. Actual: both ready her.
    const paid = await board().hand(P1, DESERTS_CALL, "call").build();
    await castAndResolve(paid, "call", { repeat: 1 });
    expect(paid.p1.energy()).toBe(6); // 2 + 2
    expect(paid.state("revna").isReady).toBe(true);

    const plain = await board().hand(P1, DESERTS_CALL, "call").build();
    await castAndResolve(plain, "call");
    expect(plain.p1.energy()).toBe(8);
    expect(plain.state("revna").isExhausted).toBe(true);
  });

  test("Power spent on OTHER things this turn is irrelevant — after a 4-fury unit, a 1-cost spell must leave her exhausted (engine readies her)", async () => {
    // Expected: only what was spent on the spell counts ([1] < [4]) → still exhausted.
    // Actual: the engine tallies power spent this turn (4 fury on the unit) and readies her.
    const game = await board().hand(P1, POWER_HOG, "hog").hand(P1, drawSpell(1), "study1").build();
    await game.p1.play("hog", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 10, power: { fury: 1 } });
    expect(game.state("revna").isExhausted).toBe(true); // a UNIT is not a spell
    await castAndResolve(game, "study1");
    expect(game.p1.energy()).toBe(9);
    expect(game.state("revna").isExhausted).toBe(true);
  });

  test("negative space: playing a UNIT for 7+ is not playing a spell — no ready", async () => {
    const game = await board().hand(P1, CARD, "second").build();
    await game.p1.play("second", { to: "base" });
    await game.settle();
    expect(game.p1.energy()).toBe(3);
    expect(game.state("revna").isExhausted).toBe(true);
  });

  test("negative space: the OPPONENT playing a 6-cost spell on their turn does nothing for your Revna", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 6 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "revna", { exhausted: true })
      .hand(P2, drawSpell(6, "Their Study"), "theirs")
      .build();
    await game.p2.cast("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(1);
    expect(game.state("revna").isExhausted).toBe(true);
  });

  test("already ready: a 4+ spell resolves cleanly, she stays ready, nothing is left pending", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", CARD, "revna").hand(P1, drawSpell(4), "study4").build();
    expect(game.state("revna").isReady).toBe(true);
    await castAndResolve(game, "study4");
    expect(game.state("revna").isReady).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("parsed condition should gate on ≥[4] ENERGY spent on the triggering spell (as unl-089 Jhin's same wording does), not 'spent-power' this turn", async () => {
    // Expected: the condition measures energy paid for the triggering spell (e.g. a
    // "spell-energy-spent" ≥ 4 shape, as Jhin unl-089 uses for the same wording). Actual: "spent-power".
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 7, might: 7, name: "Revna the Lorekeeper", powerCost: ["fury"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toEqual({ keyword: "Ganking", type: "keyword" });
    expect(abilities[1]).toMatchObject({
      effect: { target: "self", type: "ready" },
      trigger: { event: "play-spell", on: "controller" },
      type: "triggered",
    });
    const cond = abilities[1]?.condition as { type?: string; amount?: number } | undefined;
    expect(cond?.amount).toBe(4);
    expect(cond?.type).not.toBe("spent-power");
    expect(String(cond?.type)).toMatch(/energy|spell/i);
  });
});
