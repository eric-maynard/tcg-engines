/**
 * Interaction: Arise! (sfd-198-221) · Spell · Calm/Order · 6 + [calm|order]
 *     "Play a 2 [Might] Sand Soldier unit token for each Equipment you control.
 *      Then do this: Ready up to two of them."
 *   × Pirate's Haven (ogn-143-298) · Gear (NOT Equipment) · Body · 3
 *     "When you ready a friendly unit, give it +1 [Might] this turn."
 *   × Legion Rearguard (ogn-010-298) · Unit · Fury · 2 · 2 Might
 *     "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)"
 *   with two Serrated Dirks (sfd-009-221, Equipment) loose in base, and Wallop (ogn-146-298, "Ready a
 *   unit.") as the generic ready effect for the contrast.
 *
 * Rules: 387.1 ("Then do this:" = Reflexive Trigger), 388.1 (it is a new Pending chain item), 401.2 /
 * 354.2 / 354.3 (pending items wait while Arise! keeps resolving), 337.1.a/.b (finalized oldest-first, no
 * priority passes), 143.4 (tokens enter exhausted), 402.2 (the reflexive item's choices are made at ITS
 * finalization), 394.1 / 397 ("them" = the tokens this Arise! played), 415.3.b (readied by an effect is
 * a Ready event), 805.2.b / 805.6 / 805.6.a (Accelerate REPLACES entering exhausted — the unit never
 * "becomes ready", ready-keyed abilities do not trigger), 150 / 150.5 (Equipment is a Gear TAG that
 * effects may check — a plain Gear is not Equipment).
 *
 * Question: (a) order of the token plays vs the ready clause — are the tokens on the board (exhausted)
 * before P1 picks? (b) is the ready its own chain item with its own 0–2 Decision limited to those tokens,
 * and does P2 get priority before it resolves? (c) does Haven trigger per readied token? (d) Rearguard
 * played with Accelerate — Haven trigger? (e) Rearguard entered exhausted, later readied by an effect?
 * Expected: (a) two tokens (one per Equipment — Haven doesn't count), both in base exhausted, Arise! in
 * trash, THEN the reflexive item finalizes and asks. (b) yes / yes. (c) two Haven triggers → each token 3
 * Might this turn. (d) no trigger, stays 2. (e) yes → 3 this turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARISE = "sfd-198-221";
const PIRATES_HAVEN = "ogn-143-298";
const SERRATED_DIRK = "sfd-009-221";
const LEGION_REARGUARD = "ogn-010-298";
const WALLOP = "ogn-146-298"; // [Action] … Ready a unit. — 2 energy

/**
 * P1's turn. P1 base: two loose Serrated Dirks (Equipment), Pirate's Haven (plain Gear), an old exhausted
 * 2-Might unit. Hand: Arise!, Legion Rearguard, Wallop. Pool: 6+[calm] (Arise) + 2+1+[fury] (accelerated
 * Rearguard) + 2 (Wallop) = 11 energy, calm 1, fury 1. P2 has a unit too (never a legal "them").
 */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { calm: 1, fury: 1 } })
    .gear(P1, SERRATED_DIRK, "dirk1")
    .gear(P1, SERRATED_DIRK, "dirk2")
    .gear(P1, PIRATES_HAVEN, "haven")
    .unit(P1, "base", { might: 2, name: "Old Guard" }, "old", { exhausted: true })
    .unit(P2, "base", { might: 2, name: "Their Guy" }, "theirs", { exhausted: true })
    .hand(P1, ARISE, "arise")
    .hand(P1, LEGION_REARGUARD, "rg")
    .hand(P1, WALLOP, "wallop");
}

/** Sand Soldier tokens currently on P1's board. */
const soldiers = (game: Game) => game.findAll({ name: "Sand Soldier", owner: P1 }).filter((id) => game.locationOf(id) !== undefined);

function isReadyPick(game: Game): PickDecision | null {
  const d = game.decision();
  return d?.kind === "pick" && d.seat === P1 && d.targeting === "up-to" ? d : null;
}

/** Cast Arise!, both pass → it resolves; stop at the reflexive item's "ready up to two of them" pick. */
async function ariseToReadyPick(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("arise");
  expect(game.p1.resources()).toEqual({ energy: 5, power: { calm: 0, fury: 1 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  // No controlled battlefield → the token plays have a single legal location (base) and ask nothing.
  expect(isReadyPick(game)).not.toBeNull();
  return game;
}

/** …pick the first two offered tokens; returns them. Chain now holds the finalized reflexive item. */
async function pickTwo(game: Game): Promise<[string, string]> {
  const d = isReadyPick(game) as PickDecision;
  const [a, b] = d.options.map((o) => o.card ?? o.key) as [string, string];
  await game.p1.pick(a, b);
  return [a, b];
}

describe("Arise! reflexive ready × Pirate's Haven × Accelerate", () => {
  // Expected (150/150.5): "for each Equipment you control" counts the two Serrated Dirks only — Pirate's
  // Haven is a Gear without the Equipment tag. Actual: the engine counts every friendly gear, so Haven
  // adds a third Sand Soldier.
  test("(a) exactly TWO Sand Soldier tokens — one per Equipment; Pirate's Haven (plain Gear) must not count (150, 150.5)", async () => {
    const game = await ariseToReadyPick();
    expect(soldiers(game)).toHaveLength(2);
    expect((isReadyPick(game) as PickDecision).options).toHaveLength(2);
  });

  test("(a) ordering: by the time P1 is asked which to ready, every token is already ON THE BOARD in base and EXHAUSTED (143.4), Arise! has finished and is in the trash, and the chain holds exactly one item — the reflexive trigger being finalized (387.1, 388.1, 354.3, 337.1.b, 402.2)", async () => {
    const game = await ariseToReadyPick();
    const made = soldiers(game);
    expect(made.length).toBeGreaterThanOrEqual(2);
    for (const t of made) {
      expect(game.state(t)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, might: 2, zone: "base" });
    }
    expect(game.zoneOf("arise")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "arise", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "arise" }, timing: "FIN" });
  });

  test("(b) the ready is its own Decision: 0–2 picks, declinable ('up to two'), offering exactly the tokens THIS Arise! played — not Old Guard, not Rearguard, not P2's unit (394.1/397)", async () => {
    const game = await ariseToReadyPick();
    const d = isReadyPick(game) as PickDecision;
    expect(d).toMatchObject({ allowDecline: true, max: 2, min: 0, targeting: "up-to" });
    const offered = d.options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual([...soldiers(game)].sort());
    expect(offered).not.toContain("old");
    expect(offered).not.toContain("theirs");
    expect(offered).not.toContain("rg");
    expect((await game.p1.try((p) => p.pick("old"))).ok).toBe(false);
  });

  test("(b) after P1 names two, the finalized reflexive item sits on the chain showing them; P1 then P2 get priority BEFORE it resolves — the tokens are still exhausted while P2 holds priority (388, 337.1.a)", async () => {
    const game = await ariseToReadyPick();
    const [a, b] = await pickTwo(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "arise", targets: [a, b], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state(a).isExhausted).toBe(true);
    expect(game.state(b).isExhausted).toBe(true);
    await game.p2.passPriority();
    expect(game.state(a).isReady).toBe(true);
    expect(game.state(b).isReady).toBe(true);
  });

  test("(c) resolving the ready is a Ready event per token (415.3.b): Pirate's Haven triggers TWICE (two P1 items, each respondable) and each chosen Sand Soldier is 3 Might this turn; unchosen units stay exhausted at 2", async () => {
    const game = await ariseToReadyPick();
    const [a, b] = await pickTwo(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // ready resolves
    await game.acceptTriggerOrder(); // 383.3.d soft offer, if any — keep listed order
    const havenItems = game.chain().filter((c) => c.cardId === "haven");
    expect(havenItems).toHaveLength(2);
    expect(havenItems.every((c) => c.controller === P1 && c.triggered)).toBe(true);
    // Each is its own respondable item: P1 then P2 pass for the first, the second remains.
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.chain().filter((c) => c.cardId === "haven")).toHaveLength(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state(a)).toMatchObject({ isReady: true, might: 3, mightModifier: 1 });
    expect(game.state(b)).toMatchObject({ isReady: true, might: 3, mightModifier: 1 });
    for (const other of soldiers(game).filter((t) => t !== a && t !== b)) {
      expect(game.state(other)).toMatchObject({ isExhausted: true, might: 2 });
    }
    expect(game.state("old")).toMatchObject({ isExhausted: true, might: 2 });
    // "this turn": gone after the turn ends.
    await game.advanceTurn();
    expect(game.state(a).might).toBe(2);
  });

  test("(c′) 'up to two' includes zero: declining readies nothing and Pirate's Haven never triggers", async () => {
    const game = await ariseToReadyPick();
    await game.p1.decline();
    await game.settle();
    expect(game.chain()).toEqual([]);
    for (const t of soldiers(game)) {
      expect(game.state(t)).toMatchObject({ isExhausted: true, might: 2 });
    }
  });

  test("(d) Legion Rearguard played paying Accelerate ([1][fury] on top of 2): enters the base ALREADY READY — no Ready event, so Pirate's Haven does NOT trigger; Rearguard stays 2 Might (805.2.b, 805.6, 805.6.a)", async () => {
    const game = await board().build();
    await game.p1.play("rg", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 8, power: { calm: 1, fury: 0 } });
    expect(game.zoneOf("rg")).toBe("base");
    expect(game.state("rg").isReady).toBe(true);
    expect(game.chain()).toEqual([]); // nothing triggered
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.settle();
    expect(game.state("rg")).toMatchObject({ isReady: true, might: 2, mightModifier: 0 });
  });

  test("(e) contrast: Rearguard played WITHOUT Accelerate enters exhausted (143.4); Wallop then readies it → that IS a Ready event → Pirate's Haven triggers (its own chain item) and Rearguard is 3 Might this turn", async () => {
    const game = await board().build();
    await game.p1.play("rg", { accelerate: false });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 9, power: { calm: 1, fury: 1 } });
    expect(game.state("rg")).toMatchObject({ isExhausted: true, might: 2, zone: "base" });
    expect(game.chain()).toEqual([]); // entering exhausted triggers nothing either
    await game.p1.cast("wallop", { targets: "rg" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Wallop resolves → ready
    expect(game.state("rg").isReady).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "haven", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("rg")).toMatchObject({ isReady: true, might: 3, mightModifier: 1 });
    expect(game.zoneOf("wallop")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
