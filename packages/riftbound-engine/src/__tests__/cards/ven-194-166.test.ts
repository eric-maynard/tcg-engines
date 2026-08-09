/**
 * Defender of Tomorrow — ven-194-166 · Legend · Mind/Body
 *
 *   [Empower] [2][rainbow][rainbow]
 *   [1], [Exhaust]: Ready a gear.
 *   [Empowered][>] [1], [Exhaust]: Ready 2 gear.
 *
 * Rules: 827 (Empower is an ACTIVATED ability: "[Cost]: Empower this. Play only if not Empowered";
 * 827.2 the legend becomes Empowered when it resolves), 441.1 (Empowered is binary and has no duration),
 * 135.2.e.5.a ([rainbow] = one power of ANY domain), 828.1.b.1 ([Empowered][>] X = "while I am Empowered,
 * this card gains X" — the printed "[1],[Exhaust]: Ready a gear" is still there, the 2-gear version is
 * ADDED), 377.3 (activated abilities pay first — the [Exhaust] is paid at activation — and resolve off the
 * chain), 355.5/818-style targeting ("a gear" = any gear on the board, chosen at activation), 415
 * (Ready), 315.1.b (the legend readies in its controller's Awaken step → one [Exhaust] use per turn),
 * 357.1.a (ready runes may cover the energy part).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Three abilities, two exhaust-gated: Empower does NOT exhaust the legend, so "Empower, then ready
 *     gear" is one turn's play (3 energy + 2 power) — and once Empowered that second activation should
 *     ready TWO gear.
 *  2. Empower pips are true any-domain: fury+fury pays on a Mind/Body legend; 2 energy + 1 power or
 *     1 energy + 2 power does not; after resolving, the Empower ability disappears from the menu for good
 *     and the status survives turn cycles.
 *  3. "Ready a gear" needs a gear ON THE BOARD to target (none → not activatable), 1 energy, and a READY
 *     legend; the exhaust is a cost (legend already sideways while P2 responds) and it stays exhausted
 *     through P2's turn until my Awaken.
 *  4. The economy loop with Seal of Strength: tap Seal for [body], ready it with the legend, tap again.
 *  5. Not Empowered → exactly ONE gear readies per activation (negative space for the upgrade).
 *  6. Registry: the [Empowered][>] ability is currently missing from the parse entirely.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-194-166";
const IRON_BALLISTA = "ogn-017-298"; // plain gear
const SEAL_OF_STRENGTH = "ogn-163-298"; // gear · [Exhaust]: [Reaction] — [Add] [body]

/** P1's turn, Defender legend (optionally Empowered), two EXHAUSTED Ballistas g1/g2, an exhausted enemy gear g3. */
function board(res: { energy?: number; power?: Record<string, number> } = { energy: 1 }, empowered = false) {
  return scenario()
    .resources(P1, res)
    .card("dot", { def: CARD, meta: empowered ? { empowered: true } : undefined, owner: P1, zone: "legendZone" })
    .gear(P1, IRON_BALLISTA, "g1", { exhausted: true })
    .gear(P1, IRON_BALLISTA, "g2", { exhausted: true })
    .gear(P2, IRON_BALLISTA, "g3", { exhausted: true });
}

const legendAbilities = (game: Game) => game.p1.legal().filter((o) => o.moveId === "activateAbility" && o.card === "dot");
/** The activated ability on the legend whose target field allows `n` gear (1 = "Ready a gear", 2 = "Ready 2 gear"). */
function readyGearAbility(game: Game, n: 1 | 2) {
  return legendAbilities(game).find((o) => o.fields.some((f) => f.name === "targets" && (n === 1 ? (f.max ?? 1) === 1 : (f.max ?? 1) >= 2)));
}
const empowerAbility = (game: Game) => legendAbilities(game).find((o) => o.fields.every((f) => f.name !== "targets"));
const indexOf = (key: string) => Number(key.split("#")[1]);

describe("Defender of Tomorrow (ven-194-166)", () => {
  // BUG — expected: THREE abilities — [0] activated Empower {energy 2, power [rainbow, rainbow]} gated
  // not-empowered; [1] activated {energy 1, exhaust} → ready 1 gear; [2] the [Empowered][>] activated
  // {energy 1, exhaust} → ready 2 gear (while-empowered). Actual: only the first two are parsed; the
  // Empowered upgrade is missing.
  test("registry payload should carry Empower [2][A][A], '[1],[Exhaust]: Ready a gear' AND the [Empowered] '[1],[Exhaust]: Ready 2 gear' — the third is missing", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", domain: ["mind", "body"], name: "Defender of Tomorrow" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities[0]).toMatchObject({ cost: { energy: 2, power: ["rainbow", "rainbow"] }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" });
    expect(abilities[1]).toMatchObject({ cost: { energy: 1, exhaust: true }, effect: { target: { type: "gear" }, type: "ready" }, type: "activated" });
    expect(abilities).toHaveLength(3);
    expect(abilities[2]).toMatchObject({ cost: { energy: 1, exhaust: true }, effect: { type: "ready" }, type: "activated" });
    expect(JSON.stringify(abilities[2])).toMatch(/empowered/i);
    expect(JSON.stringify(abilities[2])).toMatch(/"count":2|"quantity":2|"exactly":2/);
  });

  test("[Empower]: pays 2 energy + one mind + one body, does NOT exhaust the legend, sits on the chain un-Empowered while P2 may respond, then resolves → Empowered", async () => {
    const game = await board({ energy: 3, power: { body: 1, mind: 1 } }).build();
    const emp = empowerAbility(game);
    expect(emp).toBeDefined();
    await game.p1.activate("dot", indexOf(emp!.key));
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0, mind: 0 } });
    expect(game.state("dot")).toMatchObject({ isEmpowered: false, isExhausted: false });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dot", controller: P1, triggered: false })]);
    await game.p1.pass();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
    await game.p2.pass();
    expect(game.state("dot")).toMatchObject({ isEmpowered: true, isExhausted: false });
    expect(game.violations()).toEqual([]);
  });

  test("[Empower] pips are any-domain (135.2.e.5.a): two FURY power pay on this Mind/Body legend; 2 energy + 1 power or 1 energy + 2 power cannot; two ready runes cover the [2]", async () => {
    const fury = await board({ energy: 2, power: { fury: 2 } }).build();
    expect(empowerAbility(fury)).toBeDefined();
    await fury.p1.activate("dot", indexOf(empowerAbility(fury)!.key));
    expect(fury.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(empowerAbility(await board({ energy: 2, power: { mind: 1 } }).build())).toBeUndefined();
    expect(empowerAbility(await board({ energy: 1, power: { mind: 2 } }).build())).toBeUndefined();
    const runes = await board({ energy: 0, power: { rainbow: 2 } }).runes(P1, "mind", 2).build();
    expect(empowerAbility(runes)).toBeDefined();
  });

  test("'Play only if not Empowered' (827.1.c.1) and 441.1: once Empowered the Empower ability is gone even with [2][A][A] floating, and the status persists through a full turn cycle", async () => {
    const game = await board({ energy: 5, power: { rainbow: 4 } }).build();
    await game.p1.activate("dot", indexOf(empowerAbility(game)!.key));
    await game.settle();
    expect(game.state("dot").isEmpowered).toBe(true);
    expect(empowerAbility(game)).toBeUndefined();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 2 } });
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("dot").isEmpowered).toBe(true);
    await game.p1.do("addResources", { energy: 2, power: { rainbow: 2 } });
    expect(empowerAbility(game)).toBeUndefined();
  });

  test("'[1], [Exhaust]: Ready a gear': the target is named at activation, 1 energy is paid and the legend is ALREADY exhausted while the item waits; on resolution exactly that gear readies, the other stays exhausted", async () => {
    const game = await board({ energy: 2 }).build();
    const ab = readyGearAbility(game, 1);
    expect(ab).toBeDefined();
    await game.p1.activate("dot", indexOf(ab!.key), { targets: "g2" });
    expect(game.p1.energy()).toBe(1);
    expect(game.state("dot").isExhausted).toBe(true); // the [Exhaust] is a cost
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dot", targets: ["g2"] })]);
    expect(game.state("g2").isExhausted).toBe(true); // not yet
    await game.settle();
    expect(game.state("g2").isReady).toBe(true);
    expect(game.state("g1").isExhausted).toBe(true);
    expect(game.state("g3").isExhausted).toBe(true);
    // Exhausted legend → no second use this turn even with energy left.
    expect(readyGearAbility(game, 1)).toBeUndefined();
  });

  test("one use per turn cycle (315.1.b): the legend stays exhausted through P2's turn and is readied by MY Awaken, when the ability is offered again", async () => {
    const game = await board({ energy: 1 }).build();
    await game.p1.activate("dot", indexOf(readyGearAbility(game, 1)!.key), { targets: "g1" });
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(game.state("dot").isExhausted).toBe(true);
    await game.advanceTurn(); // → P1
    expect(game.state("dot").isReady).toBe(true);
    await game.p1.do("addResources", { energy: 1 });
    // g1/g2 were readied by Awaken too, but "a gear" may target a ready gear (415.1.c) — the ability is offered.
    expect(readyGearAbility(game, 1)).toBeDefined();
  });

  test("'Ready a gear' negative space: no gear on the board → not activatable; 0 energy → not; legend already exhausted → not; opponent's turn → not", async () => {
    const noGear = await scenario().resources(P1, { energy: 3 }).legend(P1, CARD, "dot").unit(P1, "base", { might: 2 }, "u", { exhausted: true }).build();
    expect(readyGearAbility(noGear, 1)).toBeUndefined();
    expect(readyGearAbility(await board({ energy: 0, power: { mind: 3 } }).build(), 1)).toBeUndefined();
    const tired = await scenario().resources(P1, { energy: 3 }).card("dot", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" }).gear(P1, IRON_BALLISTA, "g1", { exhausted: true }).build();
    expect(readyGearAbility(tired, 1)).toBeUndefined();
    expect(legendAbilities(await board({ energy: 3 }).active(P2).build())).toEqual([]);
  });

  test("'a gear' has no controller word: both my Ballistas AND the enemy's exhausted gear are legal targets (355.9.b)", async () => {
    const game = await board({ energy: 1 }).build();
    const targets = readyGearAbility(game, 1)?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets).toEqual(expect.arrayContaining([["g1"], ["g2"], ["g3"]]));
    expect(targets).toHaveLength(3);
  });

  test("the economy loop with Seal of Strength: tap the Seal for [body], pay [1] + exhaust the legend to ready it, tap it again — 2 body from one Seal in one turn", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).legend(P1, CARD, "dot").gear(P1, SEAL_OF_STRENGTH, "seal").build();
    await game.p1.activate("seal");
    await game.settle();
    expect(game.p1.power("body")).toBe(1);
    expect(game.state("seal").isExhausted).toBe(true);
    await game.p1.activate("dot", indexOf(readyGearAbility(game, 1)!.key), { targets: "seal" });
    await game.settle();
    expect(game.state("seal").isReady).toBe(true);
    await game.p1.activate("seal");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 2 } });
  });

  test("NOT Empowered → exactly one gear per activation: after '[1],[Exhaust]: Ready a gear' on g1, g2 is still exhausted and no 2-gear ability was ever on the menu", async () => {
    const game = await board({ energy: 3 }).build();
    expect(game.state("dot").isEmpowered).toBe(false);
    expect(readyGearAbility(game, 2)).toBeUndefined();
    await game.p1.activate("dot", indexOf(readyGearAbility(game, 1)!.key), { targets: "g1" });
    await game.settle();
    expect(game.state("g1").isReady).toBe(true);
    expect(game.state("g2").isExhausted).toBe(true);
  });

  // BUG — expected (828.1.b.1): while Empowered the legend has "[1], [Exhaust]: Ready 2 gear" — an activated
  // ability taking two gear targets; one activation (1 energy + exhaust) readies BOTH Ballistas. Actual: no
  // such ability exists; only the 1-gear version is ever offered.
  test("Empowered → '[1], [Exhaust]: Ready 2 gear' is offered and one activation readies BOTH g1 and g2 for a single [1] + exhaust", async () => {
    const game = await board({ energy: 1 }, true).build();
    expect(game.state("dot").isEmpowered).toBe(true);
    const two = readyGearAbility(game, 2);
    expect(two).toBeDefined();
    await game.p1.activate("dot", indexOf(two!.key), { targets: ["g1", "g2"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("dot").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("g1").isReady).toBe(true);
    expect(game.state("g2").isReady).toBe(true);
    expect(game.state("g3").isExhausted).toBe(true);
  });

  // BUG — same root cause, the full one-turn line: Empower does not exhaust, so with 3 energy + mind + body P1
  // empowers, then immediately uses the upgraded ability to ready both gear. Actual: after empowering only the
  // 1-gear ability exists, so g2 stays exhausted.
  test("the one-turn line — Empower ([2] + mind + body), then the Empowered ability ([1] + exhaust) readies both Ballistas; pool ends empty", async () => {
    const game = await board({ energy: 3, power: { body: 1, mind: 1 } }).build();
    await game.p1.activate("dot", indexOf(empowerAbility(game)!.key));
    await game.settle();
    expect(game.state("dot")).toMatchObject({ isEmpowered: true, isReady: true });
    const ab = readyGearAbility(game, 2) ?? readyGearAbility(game, 1);
    expect(ab).toBeDefined();
    const max = ab!.fields.find((f) => f.name === "targets")?.max ?? 1;
    await game.p1.activate("dot", indexOf(ab!.key), { targets: max >= 2 ? ["g1", "g2"] : "g1" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, mind: 0 } });
    expect(game.state("dot").isExhausted).toBe(true);
    expect(game.state("g1").isReady).toBe(true);
    expect(game.state("g2").isReady).toBe(true);
  });
});
