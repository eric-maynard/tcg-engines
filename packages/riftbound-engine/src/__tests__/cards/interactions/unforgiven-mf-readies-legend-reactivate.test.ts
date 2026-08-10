/**
 * Interaction: Unforgiven (ogn-259-298) · Legend (Yasuo) · Calm/Chaos
 *     "[2], [Exhaust]: Move a friendly unit to or from its base."
 *   × Miss Fortune, Captain (ogn-162-298) · Champion Unit · Body · 5 · 5 Might
 *     "[Accelerate] [Ganking] The first time I move each turn, you may ready something else that's exhausted."
 *   × Vengeance (ogn-229-298) · Spell · Order · 4+[order][order] — "Kill a unit."
 *
 * Rules: 174.3 (legends cannot be killed), 174.4 (legends cannot be moved), 174.5 (legends CAN be
 * targeted), 174.8 (legend abilities work like any other), 175 (legends are not permanents),
 * 355.9.a.1 ("unit" = a unit on the board), 355.9.a.4, 355.10.a / 355.10.a.1 (Legend Zone is public →
 * "ready a legend" targets), 381 + 310.1.a + 313.1.a (activated abilities: controller's turn, Open
 * state, no Action/Reaction tag → not with Focus in a showdown), 402.2 (choices made on activation),
 * 403.1.a / 404.1 (costs paid at finalization, before anyone gets priority), 410.1.a, 415.1 / 415.3.b
 * (ready a game object on the board when an effect says so).
 *
 * Question. P1's turn, Neutral Open, 4 energy (two runes already exhausted). Legend Unforgiven READY.
 * Base: Miss Fortune (ready) + vanilla V (exhausted). P1 controls bf1 (a P1 token sits there). P1's
 * chosen champion is still in the Champion Zone. P2 holds Vengeance.
 *   (a) Unforgiven's move candidates = friendly units on the board only (MF, V, the token) — never the
 *       legend, never the champion in the CZ. Vengeance (P2's turn) lists units only — no legend, no CZ.
 *   (b) Activate on MF → bf1: [2] + exhaust paid at finalization before P2 gets priority; P2 passes;
 *       MF relocates base→bf1 and stays READY.
 *   (c) MF's trigger: "something else that's exhausted" — the exhausted legend IS legal (174.5,
 *       355.10.a), V is legal, exhausted runes are legal; MF herself and ready objects are not.
 *   (d) P1 picks the legend → readied → Unforgiven offered again → 2 more energy, exhaust, V base→bf1.
 *   (e) P2's turn / P1 holding Focus in a showdown → Unforgiven not offered at all.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNFORGIVEN = "ogn-259-298";
const MISS_FORTUNE = "ogn-162-298";
const VENGEANCE = "ogn-229-298";
const WINDRIDER = "ogn-205-298"; // Yasuo, Windrider — P1's chosen champion, still in the Champion Zone

/**
 * P1's turn 2, Neutral Open. P1: 4 energy, runes r1/r2 exhausted (already tapped), legend Unforgiven
 * ready, champion in CZ, MF ready + V exhausted in base, a 1-Might token holding bf1.
 * P2: Vengeance in hand with 4 + [order][order] to cast it, an EXHAUSTED Foe at bf2 (so MF's
 * "something else that's exhausted" has two candidates and the engine actually asks).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 4, power: { order: 2 } })
    .legend(P1, UNFORGIVEN, "lg")
    .champion(P1, WINDRIDER, "champ")
    .rune(P1, "calm", { alias: "r1", exhausted: true })
    .rune(P1, "chaos", { alias: "r2", exhausted: true })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Token" }, "tok")
    .unit(P1, "base", MISS_FORTUNE, "mf")
    .unit(P1, "base", { might: 2, name: "Vanilla" }, "v", { exhausted: true })
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe", { exhausted: true })
    .hand(P2, VENGEANCE, "veng");
}

/** Card ids offered by the `targets` field of an action option. */
function targetsOf(game: Game, seat: "p1" | "p2", verb: string, card: string): string[] {
  const field = game[seat].option(verb, card)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** Activate Unforgiven on MF → bf1, both pass, MF's opt-in answered YES; stops at her target pick. */
async function activateOnMfAndOptIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "mf" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  await game.p1.yes(); // rule 383.3.a — the leading "you may"
  return game;
}

describe("(a) what Unforgiven / Vengeance may choose: units on the board only — never a legend, never the champion in the CZ", () => {
  test("Unforgiven's candidates are exactly P1's units on the board: MF, V and the bf1 token (174.4, 175, 355.9.a.1)", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "lg")).toBe(true);
    const offered = targetsOf(game, "p1", "activate", "lg");
    expect(offered).toEqual(["mf", "tok", "v"]);
    expect(offered).not.toContain("lg"); // the legend never moves itself
    expect(offered).not.toContain("champ"); // Champion Zone is not the board
    expect(offered).not.toContain("foe"); // friendly only
    expect(game.zoneOf("champ")).toBe("championZone");
  });

  test("forcing the legend, the CZ champion or an enemy unit as the mover is rejected; nothing is paid", async () => {
    const game = await board().build();
    for (const bad of ["lg", "champ", "foe"]) {
      const r = await game.p1.try((p) => p.activate("lg", 0, { targets: bad }));
      expect(r.ok).toBe(false);
    }
    expect(game.p1.energy()).toBe(4);
    expect(game.state("lg").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("on P2's turn Vengeance ('Kill a unit') lists every unit on the board of either side — and no legend (174.3), no Champion-Zone card", async () => {
    const game = await board().active(P2).build();
    expect(game.p2.can("cast", "veng")).toBe(true);
    const offered = targetsOf(game, "p2", "cast", "veng");
    expect(offered).toEqual(["foe", "mf", "tok", "v"]);
    expect(offered).not.toContain("lg");
    expect(offered).not.toContain("champ");
    await expect(game.p2.cast("veng", { targets: "lg" })).rejects.toThrow();
    await expect(game.p2.cast("veng", { targets: "champ" })).rejects.toThrow();
    expect(game.zoneOf("veng")).toBe("hand");
  });
});

describe("(b) activating Unforgiven on MF → bf1: costs at finalization, P2 gets priority, MF arrives READY", () => {
  test("[2] and the legend's exhaust are paid the moment the ability is put on the chain — before anyone holds priority (403.1.a, 404.1)", async () => {
    const game = await board().build();
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "mf" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.state("lg").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lg", controller: P1, targets: ["mf"], triggered: false, type: "ability" })]);
    expect(game.locationOf("mf")).toBe("base"); // nothing moves before resolution
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P1 passes → P2 receives priority on the legend ability (it uses the chain, 174.8)", async () => {
    const game = await board().build();
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "mf" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("passPriority")).toBe(true);
  });

  test("both pass → MF relocates base → bf1 and is still READY (an effect-move does not exhaust); bf1 is P1's so no showdown — instead MF's move trigger asks its 'you may'", async () => {
    const game = await board().build();
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "mf" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("mf")).toBe("bf1");
    expect(game.state("mf").isReady).toBe(true);
    expect(game.gameState.battlefields.bf1?.contested ?? false).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mf", controller: P1, triggered: true })]);
  });
});

describe("(c) MF's 'ready something else that's exhausted' — who is a legal choice", () => {
  test("V (exhausted friendly unit) is offered, and so is the exhausted ENEMY Foe ('something' is not 'friendly'); MF herself ('else') and the READY token are not", async () => {
    const game = await activateOnMfAndOptIn();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
    const keys = d.options.map((o) => o.key);
    expect(keys).toContain("v");
    expect(keys).toContain("foe");
    expect(keys).not.toContain("mf");
    expect(keys).not.toContain("tok");
    expect(keys).not.toContain("champ"); // not on the board, not exhausted
    // (`pick(source)` is a harness no-op for forced binds — assert the raw answer instead)
    const r = await game.p1.try((p) => p.answer({ keys: ["mf"], kind: "pick" }));
    expect(r.ok).toBe(false);
    expect(game.state("mf").isReady).toBe(true);
  });

  // Expected (174.5, 355.10.a, 415.3.b): "something else that's exhausted" is any exhausted game object in
  // a public zone other than MF — the Unforgiven legend, exhausted to pay for this very move, qualifies.
  // Actual: MF's target spec is `type: "unit"`, so only exhausted UNITS are enumerated; "lg" is absent.
  test("the exhausted Unforgiven legend should be a legal choice for MF's trigger (174.5 legends can be targeted; 355.10.a Legend Zone is public)", async () => {
    const game = await activateOnMfAndOptIn();
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    expect(d.options.map((o) => o.key)).toContain("lg");
  });

  // Expected: exhausted runes on the board are exhausted game objects → legal "something else".
  // Actual: only units are enumerated; r1 / r2 are never offered.
  test("P1's exhausted runes should be legal choices for MF's trigger ('something', not 'a unit')", async () => {
    const game = await activateOnMfAndOptIn();
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    const keys = d.options.map((o) => o.key);
    expect(keys).toContain("r1");
    expect(keys).toContain("r2");
  });

  test("picking V: the trigger sits on the chain naming V (P2 may respond), resolves, V is READY; MF untouched", async () => {
    const game = await activateOnMfAndOptIn();
    await game.p1.pick("v");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mf", targets: ["v"], triggered: true })]);
    expect(game.state("v").isExhausted).toBe(true); // not yet
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("v").isReady).toBe(true);
    expect(game.state("mf").isReady).toBe(true);
    expect(game.locationOf("v")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) P1 readies the LEGEND with MF's trigger → Unforgiven can be activated a second time this turn", () => {
  test("offered-action timeline (engine-observable part): [activate] before → absent while its own item is on the chain → absent after resolution while the legend stays exhausted, even with 2 energy left (414)", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "lg")).toBe(true);
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "mf" });
    expect(game.p1.can("activate", "lg")).toBe(false); // Closed state + exhausted
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.yes();
    await game.p1.pick("v"); // the line the engine allows today
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.state("lg").isExhausted).toBe(true);
    expect(game.p1.can("activate", "lg")).toBe(false);
  });

  // Expected (415, 381, 410.1.a): P1 picks the legend; on resolution it is readied; chain empty → Neutral
  // Open on P1's turn → Unforgiven is offered again; P1 pays 2 more (→ 0), exhausts it, moves V base → bf1.
  // Actual: "lg" is not among MF's legal picks, so the line cannot even start.
  test("pick the legend → it readies → Unforgiven offered again → second activation (2 more energy, exhaust) moves V base → bf1", async () => {
    const game = await activateOnMfAndOptIn();
    await game.p1.pick("lg");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mf", targets: ["lg"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("lg").isReady).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "lg")).toBe(true);

    await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "v" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("lg").isExhausted).toBe(true);
    await game.settle();
    expect(game.locationOf("v")).toBe("bf1");
    expect(game.state("v").isExhausted).toBe(true); // moved by an effect: state untouched
    expect(game.p1.can("activate", "lg")).toBe(false); // [] after the second use
    expect(game.violations()).toEqual([]);
  });
});

describe("(e) NO side: ready legend + 4 energy is not enough — only on P1's turn in a Neutral Open state", () => {
  test("P2's turn: Unforgiven is not among P1's legal actions at all (381, 310.1.a)", async () => {
    const game = await board().active(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("lg").isReady).toBe(true);
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("activate", "lg")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
    const r = await game.p1.try((p) => p.activate("lg", 0, { targets: "v" }));
    expect(r.ok).toBe(false);
  });

  test("P1's own turn but a showdown is open with P1 holding Focus (MF walked into bf2): no Action/Reaction tag → not offered (313.1.a)", async () => {
    const game = await board().build();
    await game.p1.move("mf", "bf2");
    await game.p1.no(); // decline her move trigger so the showdown opens at once
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("lg").isReady).toBe(true);
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("activate", "lg")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
  });
});
