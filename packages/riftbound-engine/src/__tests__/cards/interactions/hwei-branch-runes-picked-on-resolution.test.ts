/**
 * Interaction: Hwei, Brooding Painter (unl-080-219) · Champion Unit · Mind · 5 + [mind] · 5 Might
 *     "When I move, draw 1, then discard 1. Then, do the following based on the discarded card's
 *      type: Spell — Draw 1. Gear — Ready up to 2 runes. Unit — Give me +3 [Might] this turn."
 *   × Gentle Gemdragon (unl-104-219) · Unit · Body · 8 · Dragon
 *     "When you play me or another Dragon, ready up to 2 runes."
 *   × Retreat (ogn-104-298) · Spell · Mind · 1 · [Reaction]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   (the Dragon played: Dune Drake ogn-131-298; the gear drawn: Iron Ballista ogn-017-298;
 *    the spell held: Discipline ogn-058-298)
 *
 * Question. P1 controls Hwei and a Gemdragon, has runes r1/r2/r4 exhausted, a Dragon + Retreat +
 * a spell in hand and a gear on top of deck.
 *  (a) P1 plays the Dragon. WHEN is Gemdragon's "ready up to 2 runes" decided, and what is the
 *      option set? P1 then reacts with Retreat, channelling a fresh rune r3 EXHAUSTED (430.2) —
 *      does r3 ready?
 *  (b) P1 then moves Hwei. Is any rune Decision — or discard Decision — raised while the move
 *      trigger is being FINALIZED?
 *  (c) The trigger resolves: draw the gear, discard it, branch. When does the "Ready up to 2 runes"
 *      Decision surface, who chooses, and does its option set include r3 (channelled while a
 *      DIFFERENT trigger was on the chain) — and exclude a rune recycled in the meantime?
 *  (d) Both losing timings: Gemdragon must not re-pick at resolution, and Hwei must not pre-lock
 *      runes at finalization (355.16 — the branch may turn out to be Spell or Unit, with no rune
 *      instruction at all).
 *
 * Rules: 355.5 / 355.7 / 402.2 (choices of specific game objects are made as the item is finalized,
 * and such a choice Targets), 355.10.f (the CR's own example: "Recycle a rune you control" TARGETS
 * a rune, chosen as the ability is put on the chain), 355.13 ("up to N" may be answered with zero),
 * 355.15 (choices are locked once made), 355.16 (no choice may be made at finalization that is
 * deterministically illegal later), 355.17 (everything else is chosen on resolution), 355.10.a /
 * .a.1 (the hand is not a Public zone, so the discarded card is not a target), 430.2 (a channelled
 * rune may enter exhausted), 359.3.e.11 (partially-followable instructions do as much as possible).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HWEI = "unl-080-219";
const GEMDRAGON = "unl-104-219";
const RETREAT = "ogn-104-298";
const DUNE_DRAKE = "ogn-131-298"; // 5 energy · Body · Dragon
const IRON_BALLISTA = "ogn-017-298"; // gear, no discard trigger
const DISCIPLINE = "ogn-058-298"; // spell

/** The card ids a pick Decision is currently offering. */
function offered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/**
 * P1's turn. Hwei + Gemdragon + a Bait unit in base, bf1 controlled by P1, three exhausted mind
 * runes (r1, r2, r4) plus one exhausted ENEMY rune, Dragon / Retreat / a spell in hand, a gear on
 * top of the deck.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { body: 2, mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", HWEI, "hwei")
    .unit(P1, "base", GEMDRAGON, "gem")
    .unit(P1, "base", { might: 2, name: "Bait" }, "bait")
    .rune(P1, "mind", { alias: "r1", exhausted: true })
    .rune(P1, "mind", { alias: "r2", exhausted: true })
    .rune(P1, "mind", { alias: "r4", exhausted: true })
    .rune(P2, "fury", { alias: "theirRune", exhausted: true })
    .hand(P1, DUNE_DRAKE, "drake")
    .hand(P1, RETREAT, "retreat")
    .hand(P1, DISCIPLINE, "spellInHand")
    .deck(P1, [IRON_BALLISTA, DUNE_DRAKE, DUNE_DRAKE], ["gear1", "u1", "u2"]);
}

/**
 * Play the Dragon: Gemdragon's trigger goes on the chain and its runes are named while it is
 * FINALIZED (355.5 / 402.2), before anyone has priority.
 */
async function playDragon(game: Game): Promise<void> {
  await game.p1.play("drake");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gem", controller: P1, triggered: true })]);
}

/**
 * Play the Dragon, answer Gemdragon's finalization pick (`picks`, empty = decline), then react with
 * Retreat on the Bait and let the chain drain. Returns the id of the rune Retreat channelled (r3).
 */
async function dragonThenRetreat(game: Game, picks: readonly string[] = []): Promise<string> {
  const before = game.p1.runes();
  await playDragon(game);
  if (picks.length === 0) {
    await game.p1.decline();
  } else {
    await game.p1.pick(...picks);
  }
  await game.p1.cast("retreat", { targets: "bait" });
  expect(game.chain()).toHaveLength(2); // Gemdragon's trigger under Retreat
  await game.settle(); // Retreat resolves FIRST (last on, first off)
  const r3 = game.p1.runes().find((r) => !before.includes(r));
  expect(r3).toBeDefined();
  expect(game.state(r3 as string).isExhausted).toBe(true); // 430.2 — channelled exhausted
  expect(game.zoneOf("bait")).toBe("hand");
  return r3 as string;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (a) Gemdragon's "ready up to 2 runes"
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("(a) Gemdragon's rune choice and the rune Retreat channels underneath it", () => {
  test(
    "the runes are chosen when the trigger is FINALIZED — CR 355.5 / 355.7 / 402.2 and the 355.10.f example ('Recycle a rune you control' targets a rune, chosen as it goes on the chain) make each readied rune a target picked before anyone gets priority, so the rune Retreat channels afterwards can never be one of them",
    async () => {
      const game = await board().build();
      await playDragon(game);
      // A rune Decision bound to the Gemdragon trigger, raised during finalization, BEFORE P1 has
      // priority to react with Retreat.
      const d = game.decision();
      expect(d?.kind).toBe("pick");
      expect((d as PickDecision).source?.cardId).toBe("gem");
      expect((d as PickDecision).timing).toBe("FIN");
    },
  );

  test("the choice is P1's, 'up to 2' with a decline (355.13), and its option set is every rune P1 has on the board when the trigger is finalized", async () => {
    // The printed text says "ready up to 2 runes" with no controller qualifier, so CR 355.9.a ("a
    // permanent or rune on the board") would admit the OPPONENT's runes as legal — pointless but
    // legal, since readying an enemy rune only helps them. The card definition and the green
    // per-card suite (unl-104-219.test.ts, "only YOUR runes are candidates") both read bare "runes"
    // as friendly-only; that reading is asserted here rather than flipped, since nothing observable
    // turns on it (355.13 lets P1 choose fewer).
    const game = await board().build();
    await playDragon(game);

    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 2, seat: P1, timing: "FIN" });
    expect((d as PickDecision).source?.cardId).toBe("gem");
    const opts = offered(game);
    expect(opts.sort()).toEqual(["r1", "r2", "r4"]);
    expect(opts).not.toContain("theirRune");
  });

  test("choosing r1 + r2 readies exactly those two — r3 stays exhausted, and the trigger leaves the chain with nothing further asked (355.15)", async () => {
    const game = await board().build();
    const r3 = await dragonThenRetreat(game, ["r1", "r2"]);

    expect(game.p1.runes({ ready: true }).sort()).toEqual(["r1", "r2"]);
    expect(game.state(r3).isExhausted).toBe(true); // never chosen ⇒ never readied
    expect(game.state("r4").isExhausted).toBe(true);
    expect(game.state("theirRune").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("355.13 — P1 may answer with zero: no rune readied at all, and the trigger still leaves the chain cleanly", async () => {
    const game = await board().build();
    const r3 = await dragonThenRetreat(game); // declines the finalization pick

    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.state(r3).isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (b) finalizing Hwei's move trigger asks NOTHING
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("(b) Hwei's move trigger is finalized with no rune and no discard Decision", () => {
  test("moving Hwei puts one triggered item on the chain and hands P1 the ordinary chain-priority menu — no pick is raised (355.16: the branch is not known yet; 355.10.a: the hand is not Public)", async () => {
    const game = await board().build();
    await game.p1.move("hwei", "bf1");

    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hwei", controller: P1, triggered: true })]);
    const d = game.decision();
    expect(d?.kind).toBe("action"); // priority, not a choice
    expect(d?.kind === "action" ? d.context : undefined).toBe("chain");
    // nothing has happened yet: no card drawn, no rune readied
    expect(game.p1.hand().sort()).toEqual(["drake", "retreat", "spellInHand"]);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.zoneOf("gear1")).toBe("mainDeck");
  });

  test("a rune channelled while Hwei's trigger sits on the chain is on the board when the trigger resolves — proof no rune could have been locked at finalization", async () => {
    const game = await board().build();
    await game.p1.move("hwei", "bf1");
    const before = game.p1.runes();
    await game.p1.cast("retreat", { targets: "bait" }); // reaction, under the trigger
    await game.settle();
    const r3 = game.p1.runes().find((r) => !before.includes(r));
    expect(r3).toBeDefined();
    expect(game.state(r3 as string).isExhausted).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (c) the branch, and the rune option set at Hwei's resolution
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Gemdragon readies r1+r2, then Hwei moves; P1 recycles r1 while the move trigger is on the chain. */
async function throughGemThenMoveAndRecycle(game: Game): Promise<string> {
  const r3 = await dragonThenRetreat(game, ["r1", "r2"]);
  await game.p1.move("hwei", "bf1");
  await game.p1.recycleRune("r1", "mind"); // r1 leaves the board mid-trigger
  await game.settle();
  return r3;
}

describe("(c) the draw / discard / branch all happen on resolution (355.17)", () => {
  test("the discard is asked mid-resolution, chooser P1, over hand ∪ the freshly drawn card (the hand is not a target — 355.10.a)", async () => {
    const game = await board().build();
    await game.p1.move("hwei", "bf1");
    await game.settle();

    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, timing: "RES" });
    expect(offered(game).sort()).toEqual(["drake", "gear1", "retreat", "spellInHand"]);
    expect(game.zoneOf("gear1")).toBe("hand"); // drawn FIRST, then discarded
  });

  test("a rune recycled while the trigger was on the chain is off the board by the time the branch runs; the Retreat rune is still there", async () => {
    const game = await board().build();
    const r3 = await throughGemThenMoveAndRecycle(game);

    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runes().sort()).toEqual(["r2", "r4", r3].sort());
    expect(game.state(r3).isExhausted).toBe(true);
    expect(game.state("r4").isExhausted).toBe(true);
    expect(game.state("r2").isReady).toBe(true); // Gemdragon readied it
  });

  test(
    "discarding a GEAR raises a rune Decision — 'Ready up to 2 runes' is a choice P1 makes on resolution (355.13 / 355.17) over the runes on the board AT THAT MOMENT, so P1 is offered r3 (and never the recycled r1) and can ready it",
    async () => {
      const game = await board().build();
      const r3 = await throughGemThenMoveAndRecycle(game);
      await game.p1.pick("gear1"); // discard the gear → the Gear branch
      await game.settle();

      // Expected: a rune Decision for P1 over {r2, r4, r3} with max 2 (r1 recycled, so absent).
      // Actual: no Decision at all — the card definition asks for `quantity: 2` friendly runes and
      // the target resolver silently takes the FIRST two on the board (r2, which is already ready,
      // and r4), so the ready is half wasted and r3 can never be picked.
      const d = game.decision();
      expect(d?.kind).toBe("pick");
      expect((d as PickDecision).source?.cardId).toBe("hwei");
      expect((d as PickDecision).seat).toBe(P1);
      const opts = offered(game);
      expect(opts).toEqual(expect.arrayContaining([r3]));
      expect(opts).not.toContain("r1");

      await game.p1.pick(r3, "r4");
      await game.settle();
      expect(game.state(r3).isReady).toBe(true);
      expect(game.state("r4").isReady).toBe(true);
      expect(game.p1.hand().sort()).toEqual(["bait", "spellInHand"]); // gear branch never draws
      expect(game.state("hwei").might).toBe(5); // and never pumps
    },
  );

  test("the Gear branch does resolve as a Gear branch: the two runes P1 names end ready, nothing is drawn, Hwei stays a 5", async () => {
    const game = await board().build();
    const r3 = await throughGemThenMoveAndRecycle(game);
    await game.p1.pick("gear1");
    await game.settle();
    // 355.13/355.17 — P1 names the runes as the branch resolves; r2 was already
    // readied by Gemdragon, so the two fresh picks bring the ready set to three.
    await game.p1.pick(r3, "r4");
    await game.settle();

    expect(game.zoneOf("gear1")).toBe("trash");
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
    expect(game.p1.hand().sort()).toEqual(["bait", "spellInHand"]);
    expect(game.state("hwei").might).toBe(5);
    expect(game.locationOf("hwei")).toBe("bf1");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (d) the losing timings
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("(d) neither trigger may bind runes at the wrong moment", () => {
  test("Gemdragon does not re-pick at resolution: after P1's answer the readied set is exactly {r1, r2} and no second rune prompt ever appears (355.15)", async () => {
    const game = await board().build();
    const r3 = await dragonThenRetreat(game, ["r1", "r2"]);
    const settled = await game.settle();

    expect(settled.reason).toBe("open"); // nothing further asked
    expect(game.p1.runes({ ready: true }).sort()).toEqual(["r1", "r2"]);
    expect(game.state(r3).isExhausted).toBe(true);
    expect(game.state("r4").isExhausted).toBe(true);
  });

  test("355.16 — Hwei cannot pre-lock runes: when the discard turns out to be a SPELL there is no rune instruction at all (draw 1 instead, no rune readied, Hwei stays a 5)", async () => {
    const game = await board().build();
    await game.p1.move("hwei", "bf1");
    await game.settle();
    await game.p1.pick("spellInHand"); // Spell branch
    await game.settle();

    expect(game.zoneOf("spellInHand")).toBe("trash");
    expect(game.p1.runes({ ready: true })).toEqual([]); // r1/r2/r4 all still exhausted
    expect(game.p1.hand().sort()).toEqual(["drake", "gear1", "retreat", "u1"]); // drew gear1, then u1
    expect(game.state("hwei").might).toBe(5);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("355.16 again — a UNIT discard gives +3 Might and touches no rune", async () => {
    const game = await board().build();
    await game.p1.move("hwei", "bf1");
    await game.settle();
    await game.p1.pick("drake"); // Unit branch
    await game.settle();

    expect(game.state("hwei").might).toBe(8);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p1.hand().sort()).toEqual(["gear1", "retreat", "spellInHand"]);
    expect(game.violations()).toEqual([]);
  });
});
