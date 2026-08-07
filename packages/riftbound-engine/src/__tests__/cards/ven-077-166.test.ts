/**
 * Tools of Empire — ven-077-166 · Gear · Body · 4 energy
 *
 *   [Empower] [2] ([2]: Empower this. Use only if not Empowered.)
 *   [Exhaust]: Give a unit +2 [Might] this turn. If this is [Empowered], give that unit +4 [Might]
 *   this turn instead.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. Two separate activated abilities (827.3-style): #0 "[2]: Empower this" (only while not Empowered)
 *     and #1 "[Exhaust]: +2 / +4". "+4 … INSTEAD" replaces the +2 — never +6.
 *  2. "If this is [Empowered]" is read when #1 RESOLVES, but 151.2 (gear abilities only in an Open
 *     State) means you cannot slip the Empower in as a response — so ORDER matters: Empower → resolve
 *     → Exhaust gives +4; Exhaust first gives +2 even if you Empower right after.
 *  3. [Exhaust] is #1's whole cost: an exhausted Tools cannot pump again until it readies at your next
 *     Awaken, but #0 needs no exhaust — you may still Empower an exhausted Tools. Empowered persists, so
 *     every later turn's pump is +4.
 *  4. 151.2 timing: your Main Phase, Open State, not in showdowns and not on the opponent's turn — it is
 *     a pre-combat pump, not a combat trick. "+N this turn" expires in the Ending Step.
 *  5. "a unit" = any unit, either side; an enemy [Deflect] unit costs [rainbow] extra to choose (809).
 *  6. Economy line: 4 (play, enters ready) + 2 (Empower) = 6 energy buys a same-turn +4.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-077-166";
const DEFLECTOR = "ogn-013-298"; // Pouty Poro — enemy 2-Might unit with printed Deflect
const EMPOWER = 0;
const PUMP = 1;

function board(energy = 2, empowered = false) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, CARD, "tools", empowered ? { empowered: true } : undefined)
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall");
}

/** Activate the pump on `target` (target asked up front or on resolution) and let it resolve. */
async function pump(game: Game, target: string) {
  await game.p1.activate("tools", PUMP, { answers: [target], targets: [target] });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(target);
    await game.settle();
  }
}

describe("Tools of Empire (ven-077-166)", () => {
  test("costs 4 energy (no power) to play; enters the base ready and un-empowered; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "tools").build();
    await game.p1.play("tools");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("tools")).toBe("base");
    expect(game.state("tools")).toMatchObject({ cardType: "gear", isEmpowered: false, isExhausted: false });
    expect((await scenario().resources(P1, { energy: 3, power: { body: 2 } }).hand(P1, CARD, "tools").build()).p1.can("play", "tools")).toBe(false);
  });

  test("#0 [Empower] [2]: pays 2 energy, goes on the chain, and Empowers the gear on resolution (no exhaust involved)", async () => {
    const game = await board(2).build();
    await game.p1.activate("tools", EMPOWER);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tools", controller: P1 })]);
    expect(game.state("tools").isEmpowered).toBe(false);
    await game.settle();
    expect(game.state("tools")).toMatchObject({ isEmpowered: true, isExhausted: false });
  });

  test("#0 negative space: 1 energy → not offered; already Empowered → not offered ('use only if not Empowered')", async () => {
    const poor = await board(1).build();
    expect(poor.p1.legal().some((o) => o.key === "activateAbility:tools#0")).toBe(false);
    const done = await board(2, true).build();
    expect(done.p1.legal().some((o) => o.key === "activateAbility:tools#0")).toBe(false);
    expect((await done.p1.try((p) => p.activate("tools", EMPOWER))).ok).toBe(false);
    expect(done.p1.energy()).toBe(2);
  });

  test("#1 [Exhaust] while NOT Empowered: exhausts the gear (no energy) and gives the chosen unit +2 Might this turn (2 → 4), gone next turn", async () => {
    const game = await board(0).build();
    await pump(game, "ally");
    expect(game.state("tools").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });

  // BUG — expected: "+4 [Might] this turn INSTEAD" while the gear is Empowered (2 → 6, not 4 and not 8).
  // Actual: the parser dropped the Empowered rider; ability #1 is a flat +2.
  test("#1 while Empowered gives +4 instead of +2 (2 → 6)", async () => {
    const game = await board(0, true).build();
    await pump(game, "ally");
    expect(game.state("tools").isExhausted).toBe(true);
    expect(game.state("ally").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2); // still "this turn" only
  });

  // BUG — same dropped rider. Expected full line with 6 energy: play (4) → Empower (2) → Exhaust → +4.
  test("6-energy line — play Tools, Empower it, then Exhaust it the same turn for +4 on the ally", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "tools").unit(P1, "base", { might: 2 }, "ally").build();
    await game.p1.play("tools");
    await game.settle();
    await game.p1.activate("tools", EMPOWER);
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("tools").isEmpowered).toBe(true);
    await pump(game, "ally");
    expect(game.state("ally").might).toBe(6);
  });

  test("order matters (151.2 — no responding with your own gear ability): Exhaust FIRST, Empower afterwards → the ally keeps only +2 this turn", async () => {
    const game = await board(2).build();
    await pump(game, "ally");
    expect(game.state("ally").might).toBe(4);
    await game.p1.activate("tools", EMPOWER); // exhausted gear can still Empower (no [Exhaust] in #0's cost)
    await game.settle();
    expect(game.state("tools")).toMatchObject({ isEmpowered: true, isExhausted: true });
    expect(game.state("ally").might).toBe(4);
  });

  test("an exhausted Tools cannot pump again this turn; it readies at your next Awaken and can pump again", async () => {
    const game = await board(0).unit(P1, "base", { might: 3 }, "other").build();
    await pump(game, "ally");
    expect(game.p1.legal().some((o) => o.key === "activateAbility:tools#1")).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("tools").isExhausted).toBe(false);
    await pump(game, "other");
    expect(game.state("other").might).toBe(5);
  });

  test("'a unit' includes enemy units: pumping the enemy Wall gives it +2 (5 → 7)", async () => {
    const game = await board(0).build();
    const targets = game.p1.option("activateAbility:tools#1")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["wall"]]));
    await pump(game, "wall");
    expect(game.state("wall").might).toBe(7);
  });

  test("timing (151.2): neither ability is usable inside a showdown on your turn, nor on the opponent's turn", async () => {
    const game = await board(2).unit(P1, "base", { might: 1 }, "scout").build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("activate", "tools")).toBe(false);
    const opp = await board(2).active(P2).build();
    expect(opp.p1.can("activate", "tools")).toBe(false);
  });

  test("[Deflect] interaction (809): with no power the enemy Pouty Poro is not a legal pump target; with 1 power of any domain it is, and the power is spent", async () => {
    const mk = (power: Record<string, number>) =>
      scenario().resources(P1, { energy: 0, power }).gear(P1, CARD, "tools").unit(P1, "base", { might: 2 }, "ally").unit(P2, "base", DEFLECTOR, "pp").build();
    const broke = await mk({});
    expect(broke.p1.option("activateAbility:tools#1")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["ally"]]);
    expect((await broke.p1.try((p) => p.activate("tools", PUMP, { targets: ["pp"] }))).ok).toBe(false);
    const rich = await mk({ mind: 1 });
    await pump(rich, "pp");
    expect(rich.state("pp").might).toBe(4);
    expect(rich.p1.power()).toBe(0);
  });

  test("pre-combat pump: +2 on a 2-Might ally, then attack a lone 3-Might defender → the ally (4) kills it and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, CARD, "tools")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 3 }, "def")
      .build();
    await pump(game, "ally");
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("parsed abilities: #0 = {cost 2 energy → empower self, not-empowered restriction}; #1 = {cost exhaust → +2 Might this turn to a unit}", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "body", energyCost: 4, name: "Tools of Empire" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      cost: { energy: 2 },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { exhaust: true }, type: "activated" });
    expect(JSON.stringify((def?.abilities?.[1] as { effect: unknown }).effect)).toMatch(/"amount":2/);
  });

  // BUG — expected: #1's effect is conditional on while-empowered: then +4 / else +2 (both duration turn).
  // Actual: a flat `modify-might +2`; the "[Empowered] … +4 instead" rider is missing.
  test("parsed ability #1 carries the 'if Empowered, +4 instead' branch", async () => {
    const pool = await loadDefaultCardPool();
    const effect = JSON.stringify((pool.get(CARD)?.abilities?.[1] as { effect: unknown }).effect);
    expect(effect).toMatch(/empowered/i);
    expect(effect).toMatch(/"amount":4/);
  });
});
