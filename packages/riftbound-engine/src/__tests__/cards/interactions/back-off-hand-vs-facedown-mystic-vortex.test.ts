/**
 * Interaction: Back Off (unl-042-219) — Calm Action spell, [3]
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].) [Action]
 *      [Stun] a unit. If you played this from your hand, draw 1."
 *   × Mystic Vortex (ven-160-166) — Battlefield
 *     "During showdowns here, cards with [Reaction] cost [rainbow] more to play. (Hidden cards have [Reaction].)"
 *   × Cleave (ogn-004-298) — Fury Action spell, [1]: "Give a unit [Assault 3] this turn."
 *
 * Question: P2's turn. P1 controls the Vortex with defender D (3). P1 has one Back Off FACEDOWN at
 * the Vortex (hidden on an earlier turn) and a second Back Off in HAND; P1 has 3 energy + 1 rainbow.
 * P2 attacks the Vortex with A (5).
 *   Case 1 — P2 (Focus) passes; P1 holds Focus in Showdown OPEN: hand copy vs facedown copy —
 *            legality, total cost (does the Vortex surcharge hit each?), legal targets, the draw.
 *   Case 2 — P2 instead plays Cleave on A and passes priority; P1 holds priority in Showdown
 *            CLOSED: which copy is legal? What if P1 had 0 power? Outcome stunned vs not.
 *
 * Rules:
 *   811.3      — from hand a Hidden card plays for its cost as normal, normal timing, no target restriction.
 *   811.5.a    — having Hidden is independent of being facedown.
 *   811.6      — a Hidden card gains Reaction only while facedown / played from facedown.
 *   811.1.b    — played from facedown: ignore its base cost (356.1.b) …
 *   356.1.b.3 / 356.3 — … but cost INCREASES are applied afterwards → the Vortex [rainbow] still applies.
 *   811.1.d.2  — a hidden spell's targets must be chosen from options at THAT battlefield.
 *   806.1.b / 806.2 — Action: may be played in showdowns (Open state) even off-turn.
 *   813.1.b    — Reaction ⊇ Action.
 *   338.1.a.2 / 309.1.a / 358.4 — only Reaction may join an existing chain (Closed state).
 *   347.1      — playing a legally timed card in a showdown starts a chain.
 *
 * Expected:
 *   Case 1: HAND copy legal via [Action]; it has no Reaction (811.6/811.5.a) → no surcharge → exactly
 *     3 energy, 0 power; any unit is a legal target (811.3); stun A; played from hand → draw 1.
 *     FACEDOWN copy legal; 0 energy (base cost ignored) + [rainbow] (it IS a card with Reaction,
 *     356.1.b.3); targets restricted to units at the Vortex (A or D); no draw.
 *   Case 2: HAND copy NOT legal (Action can't join a chain) → seat.can false; FACEDOWN copy legal for
 *     0 + [rainbow]; resolves first (LIFO) stunning A, then Cleave (A 8 as attacker but stunned).
 *     With 0 power neither copy is playable at the Vortex (at a plain battlefield the flip is free).
 *   Outcome: A stunned → deals no combat damage; D deals 3 to A → A survives, recalled to base; P1
 *     keeps the Vortex. If P1 does nothing: A kills D and P2 conquers.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BACK_OFF = "unl-042-219";
const MYSTIC_VORTEX = "ven-160-166";
const CLEAVE = "ogn-004-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of P1's cast option into the set of card ids offered. */
function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Card ids offered by the current pick prompt (empty if the decision is not a pick). */
function pickOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/**
 * Turn 3, P2's turn. P1 controls the Mystic Vortex ("mv", live abilities) with D (3) and a Back Off
 * hidden there since an earlier turn; a second Back Off is in P1's hand; P1 has 3 energy + 1 rainbow.
 * P2 has A (5) in base, Cleave in hand with exactly 1 energy, and a bystander B (1) at its own bf2
 * (a unit NOT at the Vortex, to expose the 811.1.d.2 restriction).
 */
function board(opts: { p1Power?: Record<string, number>; vortexLive?: boolean } = {}) {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 3, power: opts.p1Power ?? { rainbow: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("mv", { controller: P1, def: MYSTIC_VORTEX, inert: opts.vortexLive === false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "mv", { might: 3, name: "Defender D" }, "D")
    .unit(P2, "base", { might: 5, name: "Attacker A" }, "A")
    .unit(P2, "bf2", { might: 1, name: "Bystander B" }, "B")
    .facedown(P1, "mv", BACK_OFF, "boDown")
    .hand(P1, BACK_OFF, "boHand")
    .hand(P2, CLEAVE, "cleave");
}

/** Case 1: A attacks the Vortex, P2 (Focus) passes → P1 holds Focus in Showdown Open. */
async function case1(opts?: Parameters<typeof board>[0]): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.move("A", "mv");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** Case 2: A attacks the Vortex, P2 (Focus) plays Cleave on A and passes priority → P1 in Showdown Closed. */
async function case2(opts?: Parameters<typeof board>[0]): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.move("A", "mv");
  await game.p2.cast("cleave", { targets: "A" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  return game;
}

/** Everyone passes priority until the chain is empty (stops before combat resolution). */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Back Off — hand copy vs facedown copy during a showdown at Mystic Vortex", () => {
  // ── Case 1: Showdown Open, P1 has Focus ────────────────────────────────────────────────

  test("Case 1 — HAND copy is legal in the open showdown via its printed [Action] (806.1.b)", async () => {
    const game = await case1();
    expect(game.p1.can("cast", "boHand")).toBe(true);
  });

  test("Case 1 — HAND copy offers ANY unit as a target, including B away from the Vortex (811.3: no 'here' restriction)", async () => {
    const game = await case1();
    const offered = targetsOffered(game, "boHand");
    expect(offered.sort()).toEqual(["A", "B", "D"]);
  });

  test("Case 1 — HAND copy costs exactly 3 energy and NO power: it has no Reaction in hand (811.6 / 811.5.a) so the Vortex surcharge does not apply", async () => {
    const game = await case1();
    await game.p1.cast("boHand", { targets: "A" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "boHand", controller: P1, targets: ["A"] })]);
  });

  test("Case 1 — HAND copy resolves: A is stunned and, because it was played from hand, P1 draws 1", async () => {
    const game = await case1();
    const hand = game.p1.hand().length;
    await game.p1.cast("boHand", { targets: "A" });
    await resolveChain(game);
    expect(game.zoneOf("boHand")).toBe("trash");
    expect(game.state("A").isStunned).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // spent Back Off, drew 1
  });

  test("Case 1 — FACEDOWN copy is legal to flip in the open showdown (811.6: Reaction ⊇ Action)", async () => {
    const game = await case1();
    expect(game.p1.can("reveal", "boDown")).toBe(true);
  });

  test("Case 1 — FACEDOWN copy's target must be a unit AT the Vortex: A or D are offered, B is not (811.1.d.2)", async () => {
    const game = await case1();
    await game.p1.reveal("boDown");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pickOffered(game).sort()).toEqual(["A", "D"]);
    await expect(game.p1.pick("B")).rejects.toThrow();
  });

  // Expected (811.6 + 356.1.b / 356.1.b.3 / 356.3): the flipped card ignores its base cost (0 energy)
  // but IS a card with Reaction while played from facedown, so Mystic Vortex adds [rainbow] → P1's
  // rainbow goes 1 → 0. Actual: the engine only surcharges cards with PRINTED Reaction; the flip is free.
  test("Case 1 — FACEDOWN copy should cost 0 energy + [rainbow] at the Vortex (811.6, 356.1.b.3); engine charges nothing", async () => {
    const game = await case1();
    await game.p1.reveal("boDown", { answers: ["A"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "boDown", controller: P1, targets: ["A"] })]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
  });

  test("Case 1 — FACEDOWN copy ignores its base energy cost: P1's 3 energy are untouched (811.1.b, 356.1.b)", async () => {
    const game = await case1();
    await game.p1.reveal("boDown", { answers: ["A"] });
    expect(game.p1.energy()).toBe(3);
  });

  test("Case 1 — FACEDOWN copy resolves: A is stunned but P1 does NOT draw (not played from hand)", async () => {
    const game = await case1();
    const hand = game.p1.hand().length;
    await game.p1.reveal("boDown", { answers: ["A"] });
    await resolveChain(game);
    expect(game.zoneOf("boDown")).toBe("trash");
    expect(game.state("A").isStunned).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand); // hand copy still there, nothing drawn
    expect(game.p1.hand()).toContain("boHand");
  });

  test("Case 1 outcome — stunned A deals no combat damage; D deals 3 to A (5) → A survives and is recalled; P1 holds the Vortex", async () => {
    const game = await case1();
    await game.p1.cast("boHand", { targets: "A" });
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("D")).toBe("battlefield-mv");
    expect(game.state("D").damage).toBe(0);
    expect(game.zoneOf("A")).toBe("base");
    expect(game.gameState.battlefields.mv?.controller).toBe(P1);
    expect(game.gameState.battlefields.mv?.contested).toBe(false);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── Case 2: Showdown Closed (Cleave on the chain), P1 has priority only ────────────────

  test("Case 2 — HAND copy is NOT legal: [Action] never permits joining an existing chain (338.1.a.2, 309.1.a, 358.4) — seat.can is false up front", async () => {
    const game = await case2();
    expect(game.p1.can("cast", "boHand")).toBe(false);
    await expect(game.p1.cast("boHand", { targets: "A" })).rejects.toThrow();
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  });

  test("Case 2 — FACEDOWN copy IS legal in the Closed state (811.6 Reaction) and joins the chain on top of Cleave", async () => {
    const game = await case2();
    expect(game.p1.can("reveal", "boDown")).toBe(true);
    await game.p1.reveal("boDown", { answers: ["A"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "boDown"]);
  });

  // Expected: same surcharge as Case 1 — 0 energy + [rainbow] (811.6, 356.1.b.3). Actual: free.
  test("Case 2 — FACEDOWN copy should cost 0 + [rainbow] at the Vortex (811.6, 356.1.b.3); engine charges nothing", async () => {
    const game = await case2();
    await game.p1.reveal("boDown", { answers: ["A"] });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
  });

  test("Case 2 — LIFO: Back Off resolves first (A stunned while Cleave still waits), then Cleave gives A Assault 3", async () => {
    const game = await case2();
    await game.p1.reveal("boDown", { answers: ["A"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.state("A").isStunned).toBe(true);
    expect(game.state("A").grantedKeywords).toEqual([]);
    await resolveChain(game);
    expect(game.state("A").isStunned).toBe(true);
    expect(game.state("A").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  });

  test("Case 2 outcome — A (8 as attacker) is stunned: no damage to D; D deals 3 → A survives, recalled to base; P1 holds the Vortex, P2 scores nothing", async () => {
    const game = await case2();
    await game.p1.reveal("boDown", { answers: ["A"] });
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("D")).toBe("battlefield-mv");
    expect(game.zoneOf("A")).toBe("base");
    expect(game.state("A").damage).toBe(0); // healed at combat cleanup
    expect(game.gameState.battlefields.mv?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Case 2, 0 power — HAND copy is still not legal (no timing permission, regardless of resources)", async () => {
    const game = await case2({ p1Power: {} });
    expect(game.p1.can("cast", "boHand")).toBe(false);
  });

  // Expected (356.1.b.3 + Vortex): the [rainbow] surcharge is unpayable with no power → the flip is
  // not a legal action at all. Actual: the engine offers (and performs) the flip for free.
  test("Case 2, 0 power — FACEDOWN copy can't be flipped at the Vortex (unpayable [rainbow] surcharge, 811.6 + 356.1.b.3); engine allows it", async () => {
    const game = await case2({ p1Power: {} });
    expect(game.p1.can("reveal", "boDown")).toBe(false);
  });

  test("Case 1, 0 power — FACEDOWN copy likewise can't be flipped at the Vortex in the open showdown; engine allows it", async () => {
    const game = await case1({ p1Power: {} });
    expect(game.p1.can("cast", "boHand")).toBe(true); // 3 energy still pays the hand copy
    expect(game.p1.can("reveal", "boDown")).toBe(false);
  });

  test("contrast — at a plain (non-Vortex) battlefield the same flip with 0 power is legal and free", async () => {
    const game = await case2({ p1Power: {}, vortexLive: false });
    expect(game.p1.can("reveal", "boDown")).toBe(true);
    await game.p1.reveal("boDown", { answers: ["A"] });
    expect(game.p1.resources()).toEqual({ energy: 3, power: {} });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "boDown"]);
  });

  test("Case 2, P1 does nothing — Cleave resolves, A (5 + Assault 3 = 8) kills D (3) and P2 conquers the Vortex for a point", async () => {
    const game = await case2({ p1Power: {} });
    await game.settle();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("A")).toBe("battlefield-mv");
    expect(game.gameState.battlefields.mv?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("Case 1, P1 does nothing — A (5) kills D (3) and P2 conquers the Vortex", async () => {
    const game = await case1();
    await game.settle();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.gameState.battlefields.mv?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
