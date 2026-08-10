/**
 * Interaction: Mystic Reversal (ogn-080-298) · Spell (Reaction) · Calm · 4 + [calm][calm][calm]
 *     "Gain control of a spell. You may make new choices for it."
 *   × Alpha Strike (unl-192-219) · Spell (Action) · Calm/Body · 3 + [rainbow]
 *     "Choose a friendly unit. It deals damage equal to its Might split among enemy units at
 *      battlefields. Then for each unit this kills, do this: Gain 1 XP."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might · [Deflect]
 *
 * Question: P1's turn. P1: F (4 Might, base), Pouty Poro (2, Deflect) and G (1) at bf1. P2: B (3), X (1),
 * Y (1) at bf2. P1 casts Alpha Strike choosing source F and split targets {B, X, Y}; P2 Mystic Reversals it.
 *   (a) Which choices are re-makeable — the source, the split-target set, the per-target amounts?
 *   (b) P2 picks source B (3 Might) and split targets {Poro, G}: is the 355.14.c cap re-applied against B,
 *       is Deflect owed for Poro, and how does it resolve?
 *   (c) P2 keeps source F (no new choices) — what happens?
 *   (d) Can P2 name 4 split targets off B, or include its own X as a split target?
 *
 * Rules: 355.5 (targets chosen at finalization), 355.14.a/b (each split recipient is a target chosen at
 * finalization), 355.14.c (their number is capped by the damage available from the source), 355.14.e
 * (the division is decided at RESOLUTION — not a finalization choice), 355.14.f (each ≥ 1), 752 / 752.1
 * (re-makeable choices = targets, modes, locations, destinations, under the normal finalization
 * constraints), 753.1 (no illegal re-choice may be submitted), 754 (newly targeted object → its Targeting
 * Effects trigger), 755 (costs so incurred are ignored), 359.3.f.2.a (an illegal referent is null → its
 * instructions are ignored).
 *
 * Expected: (a) the source AND every split target are re-choosable by P2 (752.1); the damage division is
 * not shown/locked by that Decision (355.14.e). (b) legal: B's 3 Might caps the set at 3, {Poro, G} is
 * fine; Poro's Deflect is incurred and ignored (755) — P2 pays nothing extra; at resolution P2 splits 3
 * between Poro and G (each ≥ 1), e.g. 2/1 → both die → P2 +2 XP; B/X/Y untouched; Alpha Strike → P1's
 * trash. (c) F is not friendly to P2 → "It" is null (359.3.f.2.a) → no damage to anyone, no XP for anyone.
 * (d) no: a 4th target exceeds the cap for a 3-Might source (355.14.c) and X is not an enemy unit to P2 —
 * both are refused by the Decision (753.1), not accepted and fizzled later.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MYSTIC_REVERSAL = "ogn-080-298";
const ALPHA_STRIKE = "unl-192-219";
const POUTY_PORO = "ogn-013-298";

/**
 * P1's turn. P1: F (4, base), Pouty Poro (2, Deflect) + G (1) at bf1; Alpha Strike in hand with exactly
 * 3 energy + 1 rainbow. P2: B (3), X (1), Y (1) at bf2; Mystic Reversal in hand with exactly 4 energy +
 * 3 calm, plus 2 spare rainbow power that a (wrongly charged) Deflect surcharge would eat.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .resources(P2, { energy: 4, power: { calm: 3, rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Unit F" }, "f")
    .unit(P1, "bf1", POUTY_PORO, "poro")
    .unit(P1, "bf1", { might: 1, name: "Unit G" }, "g")
    .unit(P2, "bf2", { might: 3, name: "Unit B" }, "b")
    .unit(P2, "bf2", { might: 1, name: "Unit X" }, "x")
    .unit(P2, "bf2", { might: 1, name: "Unit Y" }, "y")
    .hand(P1, ALPHA_STRIKE, "alpha")
    .hand(P2, MYSTIC_REVERSAL, "mr");
}

/**
 * P1 casts Alpha Strike (source F, split among B, X, Y) and passes; P2 answers with Mystic Reversal;
 * both pass until Mystic Reversal has resolved (only Alpha Strike is left on the chain, now P2's) or a
 * non-action prompt (the "new choices" offer) appears.
 */
async function stolen(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("alpha", { targets: ["f", "b", "x", "y"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "alpha", controller: P1, targets: ["f", "b", "x", "y"] })]);
  await game.p1.passPriority();
  await game.p2.cast("mr");
  expect(game.chain().map((c) => c.cardId)).toEqual(["alpha", "mr"]);
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || !game.chain().some((c) => c.cardId === "mr")) {
      break;
    }
    await game.acting().passPriority();
  }
  return game;
}

/** P2's pending non-action prompt (the re-choice Decision), or null. */
function p2Prompt(game: Game): Exclude<Decision, { kind: "action" }> | null {
  const d = game.decision();
  return d && d.seat === P2 && d.kind !== "action" ? d : null;
}

/** Cards named by the options of a pick prompt. */
const cardsOf = (d: Decision | null): string[] =>
  d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : d && d.kind === "distribute" ? d.buckets.map((b) => b.card ?? b.key) : [];

/** If the offer opens with a yes/no ("make new choices?"), accept it; return the first pick prompt. */
async function openRechoice(game: Game): Promise<Extract<Decision, { kind: "pick" }> | null> {
  for (let i = 0; i < 3; i++) {
    const d = p2Prompt(game);
    if (!d) {
      return null;
    }
    if (d.kind === "yes-no") {
      await game.p2.yes();
      continue;
    }
    return d.kind === "pick" ? d : null;
  }
  return null;
}

/**
 * Walk P2's re-choice prompts: name `source` when a prompt offers it, name `splits` when a prompt offers
 * them (a `targeting: "split-targets"` set, or one pick per recipient), decline anything else optional.
 * Returns every non-action Decision P2 was shown along the way.
 */
async function rechoose(game: Game, source: string, splits: readonly string[]): Promise<Decision[]> {
  const seen: Decision[] = [];
  let sourceDone = false;
  const pending = [...splits];
  for (let i = 0; i < 10; i++) {
    const d = p2Prompt(game);
    if (!d) {
      break;
    }
    seen.push(d);
    if (d.kind === "yes-no") {
      await game.p2.yes();
      continue;
    }
    if (d.kind !== "pick") {
      break;
    }
    const offered = cardsOf(d);
    if (!sourceDone && offered.includes(source)) {
      await game.p2.pick(source);
      sourceDone = true;
      continue;
    }
    const mine = pending.filter((s) => offered.includes(s));
    if (mine.length > 0) {
      const take = d.max >= mine.length ? mine : mine.slice(0, Math.max(1, d.max));
      await game.p2.pick(...take);
      for (const t of take) {
        pending.splice(pending.indexOf(t), 1);
      }
      continue;
    }
    if (d.allowDecline) {
      await game.p2.decline();
      continue;
    }
    break;
  }
  return seen;
}

/** Pass priority around until the chain is empty or a non-action prompt appears. */
async function passOut(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return;
    }
    await game.acting().pass();
  }
}

const dealtTo = (game: Game, target: string) =>
  (game.gameState.damageLog ?? []).filter((r) => !r.combat && r.target === target).reduce((n, r) => n + r.amount, 0);

describe("setup — Mystic Reversal resolves first and P2 now controls the Alpha Strike chain item", () => {
  test("at play time P1 may name F + all three of B/X/Y (3 ≤ F's 4 Might, 355.14.c); after Reversal the item is P2's with those choices still locked", async () => {
    const fresh = await board().build();
    const tuples = (fresh.p1.option("cast", "alpha")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(tuples).toContainEqual(["f", "b", "x", "y"]);

    const game = await stolen();
    const item = game.chain().find((c) => c.cardId === "alpha");
    expect(item).toMatchObject({ cardId: "alpha", controller: P2, targets: ["f", "b", "x", "y"] });
    expect(game.chain().some((c) => c.cardId === "mr")).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power("calm")).toBe(0);
  });
});

describe("(a) which choices are re-makeable (752.1 vs 355.14.e)", () => {
  // Expected (752.1): after gaining control P2 is OFFERED new choices — a P2 prompt (yes/no or pick)
  // before anyone gets priority on Alpha Strike again. Actual: no offer at all; Mystic Reversal only
  // flips the controller and play proceeds straight to P1's priority on Alpha Strike.
  test("P2 is offered a 'new choices' Decision for the stolen Alpha Strike before priority resumes (752)", async () => {
    const game = await stolen();
    const d = p2Prompt(game);
    expect(d).not.toBeNull();
    expect(["yes-no", "pick"]).toContain(d!.kind);
  });

  // Expected: the SOURCE ("Choose a friendly unit", 355.5) is re-choosable, evaluated from P2's seat →
  // B, X, Y are the friendly candidates; P1's F / Poro / G are not. Actual: no prompt.
  test("the source is re-choosable — P2 is offered its own B, X, Y (friendly to the new controller), never F/Poro/G (355.5, 752.1)", async () => {
    const game = await stolen();
    const first = await openRechoice(game);
    expect(first).not.toBeNull();
    const seen = await rechoose(game, "b", []);
    const sourcePrompt = [first!, ...seen].find((d) => d.kind === "pick" && cardsOf(d).includes("b"));
    expect(sourcePrompt).toBeDefined();
    const offered = cardsOf(sourcePrompt!);
    expect(offered).toEqual(expect.arrayContaining(["b", "x", "y"]));
    expect(offered).not.toContain("f");
    expect(offered).not.toContain("poro");
    expect(offered).not.toContain("g");
  });

  // Expected: every split recipient is a target chosen at finalization (355.14.a/b) → re-choosable; from
  // P2's seat the enemy units at battlefields are Poro and G (F is in base). Actual: no prompt.
  test("the split-target SET is re-choosable — P2 is offered P1's Poro and G (enemy units at battlefields), not F (base) nor its own B/X/Y (355.14.b, 752.1)", async () => {
    const game = await stolen();
    await openRechoice(game);
    const seen = await rechoose(game, "b", ["poro", "g"]);
    const splitPrompt = seen.find((d) => d.kind === "pick" && (d.targeting === "split-targets" || cardsOf(d).includes("poro")));
    expect(splitPrompt).toBeDefined();
    const offered = cardsOf(splitPrompt!);
    expect(offered).toEqual(expect.arrayContaining(["poro", "g"]));
    expect(offered).not.toContain("f"); // not at a battlefield
    expect(offered).not.toContain("b");
    expect(offered).not.toContain("x");
    expect(offered).not.toContain("y");
  });

  // Expected (355.14.e): the per-target AMOUNTS are a resolution-time decision, so the re-choice offer
  // never shows a distribute prompt; the split is asked only when Alpha Strike resolves. Actual: no
  // re-choice offer exists to inspect (the first expectation fails).
  test("the damage division is NOT part of the re-choice — no distribute prompt appears until Alpha Strike actually resolves (355.14.e)", async () => {
    const game = await stolen();
    expect(p2Prompt(game)).not.toBeNull();
    await openRechoice(game);
    const seen = await rechoose(game, "b", ["poro", "g"]);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((d) => d.kind === "distribute")).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "alpha", controller: P2 })]);
    // …and only at resolution:
    await passOut(game);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
  });
});

describe("(b) P2 re-picks source B and split targets {Poro, G}", () => {
  // Expected: legal (2 targets ≤ B's 3 Might, 355.14.c via 752); the chain item now reads source B,
  // targets Poro + G; B/X/Y cease being targets. Actual: no re-choice → item keeps [f, b, x, y].
  test("after the re-choice the Alpha Strike item targets exactly [B, Poro, G] — F, X, Y are no longer targets (752.1)", async () => {
    const game = await stolen();
    await openRechoice(game);
    await rechoose(game, "b", ["poro", "g"]);
    const item = game.chain().find((c) => c.cardId === "alpha");
    expect(item?.controller).toBe(P2);
    expect([...(item?.targets ?? [])].sort()).toEqual(["b", "g", "poro"]);
  });

  // Expected (754, 755): Poro is newly targeted by an opponent's spell → Deflect is incurred but IGNORED —
  // P2's 2 spare rainbow power are untouched and the pick is not refused for lack of payment. Actual: no
  // re-choice prompt.
  test("Poro's Deflect surcharge is incurred and ignored — P2 keeps both spare rainbow power and the pick stands (754, 755)", async () => {
    const game = await stolen();
    const first = await openRechoice(game);
    expect(first).not.toBeNull();
    await rechoose(game, "b", ["poro", "g"]);
    expect(game.p2.power("rainbow")).toBe(2);
    expect(game.p2.energy()).toBe(0);
    const item = game.chain().find((c) => c.cardId === "alpha");
    expect(item?.targets ?? []).toContain("poro");
  });

  // Expected: at resolution P2 (controller) splits B's 3 Might between Poro and G, each ≥ 1 (355.14.f);
  // choosing 2 → Poro, 1 → G kills both (2 and 1 Might) → two reflexive "gain 1 XP" → P2 +2 XP, P1 +0;
  // B/X/Y/F undamaged; Alpha Strike → its OWNER P1's trash. Actual: no re-choice; F stays the (null)
  // source and nothing happens.
  test.failing("BUG: resolves under P2 — 3 split 2/1 onto Poro and G, both die, P2 gains 2 XP, B/X/Y untouched, Alpha Strike → P1's trash", async () => {
    const game = await stolen();
    await openRechoice(game);
    await rechoose(game, "b", ["poro", "g"]);
    await passOut(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 3 });
    expect(cardsOf(d).sort()).toEqual(["g", "poro"]);
    await game.p2.distribute({ g: 1, poro: 2 });
    await game.settle();
    expect(dealtTo(game, "poro")).toBe(2);
    expect(dealtTo(game, "g")).toBe(1);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("g")).toBe("trash");
    expect(game.p2.xp()).toBe(2);
    expect(game.p1.xp()).toBe(0);
    for (const u of ["b", "x", "y"]) {
      expect(game.state(u)).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    }
    expect(game.state("f")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p1.trash()).toContain("alpha");
    expect(game.p2.trash()).toEqual(["mr"]);
    expect(game.violations()).toEqual([]);
  });

  // Expected (355.14.f): with pool 3 over two locked recipients a 3/0 vector is refused. Actual: never
  // reaches a P2 split prompt.
  test("P2 may not go 3/0 — each locked recipient must be assigned at least 1 (355.14.f)", async () => {
    const game = await stolen();
    await openRechoice(game);
    await rechoose(game, "b", ["poro", "g"]);
    await passOut(game);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
    const r = await game.p2.try((p) => p.distribute({ g: 0, poro: 3 }));
    expect(r.ok).toBe(false);
  });
});

describe("(c) P2 keeps source F (no new choices) — the 'friendly unit' referent is null for P2", () => {
  test("Alpha Strike resolves under P2 with F as its source: F is not friendly to P2 → 'It' is null → nobody is dealt damage (359.3.f.2.a)", async () => {
    const game = await stolen();
    // Decline the offer if the engine makes one; otherwise the locked choices simply stand.
    for (let i = 0; i < 3 && p2Prompt(game); i++) {
      const d = p2Prompt(game)!;
      await (d.kind === "yes-no" ? game.p2.no() : game.p2.decline());
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    for (const u of ["f", "poro", "g", "b", "x", "y"]) {
      expect(game.state(u).damage).toBe(0);
      expect(dealtTo(game, u)).toBe(0);
    }
    expect(game.zoneOf("f")).toBe("base");
    expect(game.p1.units("bf1").sort()).toEqual(["g", "poro"]);
    expect(game.p2.units("bf2").sort()).toEqual(["b", "x", "y"]);
  });

  test("…so no unit is killed and NOBODY gains XP; Alpha Strike still goes to its owner P1's trash, Mystic Reversal to P2's", async () => {
    const game = await stolen();
    for (let i = 0; i < 3 && p2Prompt(game); i++) {
      const d = p2Prompt(game)!;
      await (d.kind === "yes-no" ? game.p2.no() : game.p2.decline());
    }
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.state("alpha").owner).toBe(P1);
    expect(game.p1.trash()).toEqual(["alpha"]);
    expect(game.p2.trash()).toEqual(["mr"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) the re-choice validator (753.1): cap re-applied against the NEW source, 'enemy' relative to P2", () => {
  // Expected (355.14.c via 752): with source B (3 Might) at most 3 split targets may be named — the split
  // prompt's `max` is ≤ 3 (here only 2 enemy candidates exist anyway). Actual: no prompt.
  test("with B (3 Might) as the new source the split-target prompt caps the set at ≤ 3 picks (355.14.c)", async () => {
    const game = await stolen();
    await openRechoice(game);
    const seen = await rechoose(game, "b", []);
    // After the source is named, the next prompt is the split-target set.
    const split = p2Prompt(game) ?? seen.find((d) => d.kind === "pick" && cardsOf(d).includes("poro")) ?? null;
    expect(split).not.toBeNull();
    expect(split!.kind).toBe("pick");
    if (split!.kind === "pick") {
      expect(split!.max).toBeLessThanOrEqual(3);
      expect(split!.max).toBeGreaterThanOrEqual(1);
    }
  });

  // Expected (355.9.b / 753.1): X is P2's own unit — not an "enemy unit" to the new controller — so it is
  // absent from the split-target options and naming it is refused outright. Actual: no prompt.
  test("P2's own X (and B, Y) is not offered as a split target and picking it is rejected (753.1)", async () => {
    const game = await stolen();
    await openRechoice(game);
    await rechoose(game, "b", []);
    const split = p2Prompt(game);
    expect(split?.kind).toBe("pick");
    const offered = cardsOf(split);
    expect(offered).toEqual(expect.arrayContaining(["poro", "g"]));
    expect(offered).not.toContain("x");
    expect(offered).not.toContain("y");
    expect(offered).not.toContain("b");
    const r = await game.p2.try((p) => p.pick("x"));
    expect(r.ok).toBe(false);
    // The refused answer changed nothing: the same prompt is still pending for P2.
    expect(p2Prompt(game)?.kind).toBe("pick");
  });

  // Expected (753.1): F is not a legal "friendly unit" for P2 right now, so a re-choice that names new
  // split targets while KEEPING F must be refused at choice time (it is already illegal), rather than
  // accepted and fizzled at resolution. Actual: no prompt.
  test("the source prompt does not let P2 keep/choose F — F is refused as P2's 'friendly unit' (753.1)", async () => {
    const game = await stolen();
    const first = await openRechoice(game);
    expect(first).not.toBeNull();
    const sourcePrompt = cardsOf(first).some((c) => ["b", "x", "y"].includes(c)) ? first : null;
    expect(sourcePrompt).not.toBeNull();
    expect(cardsOf(sourcePrompt)).not.toContain("f");
    const r = await game.p2.try((p) => p.pick("f"));
    expect(r.ok).toBe(false);
  });
});
