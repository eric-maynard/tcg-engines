/**
 * Interaction: Rebuttal (ven-152-166) × Star-Crossed (unl-128-219) × Pouty Poro (ogn-013-298)
 *
 *   Rebuttal — Spell (Reaction) · Mind/Chaos · 1 + [C]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control
 *      of it and you may make new choices for it. Otherwise, counter it."
 *   Star-Crossed — Spell (Reaction) · Chaos · 3 + [chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *   Pouty Poro — Unit · Fury · 2 · 2 Might — "[Deflect] (Opponents must pay [rainbow] to choose me with a
 *     spell or ability.)"
 *
 * Rules: 751.1 (new choices must be objects NOT previously chosen); 752.1 (targets are re-choosable);
 * 753 (any SUBSET of the choices may be remade, as long as the result is legal); 753.1 (may not make new
 * choices that are illegal / lead to an illegal state, even if there is no other option); 754 (a newly
 * targeted object's Targeting Effects — Deflect — trigger at that time); 755 / 755.1 (…but any cost "to
 * play" so incurred is IGNORED — the item is already finalized and paid); 359.3.f.4 ("friendly"/"enemy"
 * are read relative to the item's controller when the instruction executes); 359.3.d (a resolved spell
 * goes to its OWNER's trash).
 *
 * Question: P1's turn. P1 controls A and Pouty Poro; P2 controls X and W; all four in bases. P1 casts
 * Star-Crossed choosing friendly=A, enemy=X. P2 answers with Rebuttal (Star-Crossed costs 3 ≤ 4), pays
 * the [rainbow] and gains control.
 *   (a) P2 makes NO new choices — do A and X still bounce, or does it mistarget because the slots flipped?
 *   (b) P2 remakes only one slot: A → Pouty Poro, keeps X. Legal as a subset? Is Deflect owed?
 *   (c) P2 swaps both: X → W and A → Poro.
 *   (d) P2 tries to end on {A, Poro} (two P1 units) or {X, W} (two P2 units).
 *
 * Expected: (a) both bounce — friendly/enemy re-anchor to P2 (359.3.f.4): X is now the friendly and A
 * the enemy, the pair still satisfies "a friendly unit and an enemy unit"; A → P1's hand, X → P2's hand.
 * (b) legal (753): Poro was not previously chosen (751.1) and is enemy to P2; X stays as the friendly.
 * Poro's Deflect is incurred and ignored (754/755) — P2 pays nothing beyond Rebuttal + [rainbow];
 * Poro → P1's hand, X → P2's hand. (c) legal: W → P2's hand, Poro → P1's hand. (d) both rejected at
 * the Decision (753.1) — the group must hold exactly one P2-controlled and one P1-controlled unit; the
 * harness refuses the submission rather than half-fizzling. In every branch Star-Crossed → P1's trash.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const STAR_CROSSED = "unl-128-219";
const POUTY_PORO = "ogn-013-298";

/**
 * P1's turn. P1 base: A (3) + Pouty Poro. P2 base: X (3) + W (2). P1 exactly affords Star-Crossed
 * (3 + chaos); P2 exactly affords Rebuttal (1 + chaos for the [C] pip) plus one rainbow for the
 * optional payment — and NOTHING else, so any Deflect surcharge would be unpayable.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 1, power: { chaos: 1, rainbow: 1 } })
    .unit(P1, "base", { might: 3, name: "Unit A" }, "a")
    .unit(P1, "base", POUTY_PORO, "poro")
    .unit(P2, "base", { might: 3, name: "Unit X" }, "x")
    .unit(P2, "base", { might: 2, name: "Unit W" }, "w")
    .hand(P1, STAR_CROSSED, "sc")
    .hand(P2, REBUTTAL, "reb");
}

/** P1 casts Star-Crossed [A, X]; P2 Rebuttals it; everyone passes until Rebuttal resolves to P2's pay prompt. */
async function rebutted(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sc", { targets: ["a", "x"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P1, targets: ["a", "x"] })]);
  await game.p1.passPriority();
  await game.p2.cast("reb", { targets: "sc" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["sc", "reb"]);
  while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "reb")) {
    await game.acting().passPriority();
  }
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
  return game;
}

/** …and P2 pays the [rainbow]: the Star-Crossed item is now P2's. */
async function stolen(): Promise<Game> {
  const game = await rebutted();
  await game.p2.yes();
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P2, countered: false })]);
  return game;
}

/** The new-choices prompt P2 is shown after paying (possibly behind a "make new choices?" yes/no gate), or null. */
async function newChoicesPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (!d || d.seat !== P2 || d.kind === "action") {
      return null;
    }
    if (d.kind === "yes-no") {
      await game.p2.yes();
      continue;
    }
    return d;
  }
  return null;
}

const offeredCards = (d: Decision | null): string[] =>
  d?.kind === "pick" ? [...new Set(d.options.flatMap((o) => (Array.isArray(o.value) ? (o.value as string[]) : [o.card ?? o.key])))] : [];

/**
 * Drive whatever re-choice UI the engine offers toward the final group `[friendlyToP2, enemyToP2]`:
 * a joint two-slot pick takes both keys at once; per-slot prompts take the wanted card when offered and
 * decline (= keep the current pick, 753 "any subset") otherwise.
 */
async function remake(game: Game, finalPair: readonly [string, string]): Promise<void> {
  const d = await newChoicesPrompt(game);
  expect(d).not.toBeNull();
  expect(d?.kind).toBe("pick");
  if (d?.kind === "pick" && d.max >= 2) {
    await game.p2.pick(...finalPair);
    return;
  }
  for (let i = 0; i < 2; i++) {
    const cur = game.decision();
    if (!cur || cur.seat !== P2 || cur.kind !== "pick") {
      return;
    }
    const keys = offeredCards(cur);
    const want = finalPair.find((c) => keys.includes(c));
    if (want !== undefined) {
      await game.p2.pick(want);
    } else {
      await game.p2.decline();
    }
  }
}

/** Pass priority around until the chain is empty. */
async function resolveChain(game: Game): Promise<void> {
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Rebuttal × Star-Crossed — steal a two-slot friendly/enemy spell and remake a subset", () => {
  // ── setup sanity ───────────────────────────────────────────────────────────────────────────

  test("setup: Star-Crossed [A, X] is public on the chain; Rebuttal may choose it (3 ≤ 4); paying [rainbow] hands the item to P2 with its picks intact", async () => {
    const game = await stolen();
    expect(game.view().chain).toEqual([expect.objectContaining({ cardId: "sc", controller: P2, targets: ["a", "x"] })]);
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.p2.trash()).toEqual(["reb"]);
    // Nothing has moved yet.
    for (const c of ["a", "poro", "x", "w"]) {
      expect(game.zoneOf(c)).toBe("base");
    }
  });

  // ── (a) no new choices ─────────────────────────────────────────────────────────────────────

  test("(a) P2 keeps the choices: friendly/enemy re-anchor to P2 (359.3.f.4) and {A, X} is still one friendly + one enemy — BOTH bounce: A → P1's hand, X → P2's hand", async () => {
    const game = await stolen();
    const d = await newChoicesPrompt(game);
    if (d?.kind === "pick" && d.allowDecline) {
      await game.p2.decline(); // "you MAY make new choices" — keep them
      const again = game.decision();
      if (again?.kind === "pick" && again.seat === P2 && again.allowDecline) {
        await game.p2.decline(); // a per-slot UI asks twice
      }
    }
    await resolveChain(game);
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.p1.hand()).toEqual(["a"]);
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p2.hand()).toEqual(["x"]);
    // A trade, not a two-for-one: the unchosen units stay put.
    expect(game.zoneOf("w")).toBe("base");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("(a) …and the P2-controlled Star-Crossed still lands in its OWNER P1's trash (359.3.d); Rebuttal in P2's", async () => {
    const game = await stolen();
    const d = await newChoicesPrompt(game);
    if (d?.kind === "pick" && d.allowDecline) {
      await game.p2.decline();
      const again = game.decision();
      if (again?.kind === "pick" && again.seat === P2 && again.allowDecline) {
        await game.p2.decline();
      }
    }
    await resolveChain(game);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.state("sc").owner).toBe(P1);
    expect(game.p1.trash()).toEqual(["sc"]);
    expect(game.p2.trash()).toEqual(["reb"]);
  });

  // ── decision shape ────────────────────────────────────────────────────────────────────────
  // Expected (752.1 / 753): after paying, P2 is OFFERED to remake Star-Crossed's targets — an optional
  // pick from P2's seat whose candidates include the not-yet-chosen W (friendly to P2) and Pouty Poro
  // (enemy to P2; offered even though P2 has no power left — 755 ignores the Deflect surcharge).
  test("(shape) after paying, P2 gets an optional new-choices pick offering W and Pouty Poro as fresh candidates (752.1, 753, 755)", async () => {
    const game = await stolen();
    const d = await newChoicesPrompt(game);
    expect(d).not.toBeNull();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    // Collect every card selectable across the (joint or per-slot) prompt(s) without committing to a swap.
    const seen = new Set(offeredCards(d));
    if (d?.kind === "pick" && d.max < 2 && d.allowDecline) {
      await game.p2.decline(); // keep slot 1 → look at slot 2's menu
      for (const c of offeredCards(game.decision())) {
        seen.add(c);
      }
    }
    expect(seen.has("w")).toBe(true);
    expect(seen.has("poro")).toBe(true); // Deflect surcharge ignored (755) — P2 has 0 power left
    expect(d?.kind === "pick" ? d.allowDecline || d.min === 0 : false).toBe(true); // "you MAY"
  });

  // ── (b) remake one slot: A → Poro, keep X ─────────────────────────────────────────────────
  // Expected: legal subset remake (753); Poro not previously chosen (751.1) and enemy to P2. Deflect is
  // triggered by the new targeting (754) but its cost is ignored (755) — P2's pool stays at exactly 0.
  // Result: Poro → P1's hand, X → P2's hand, A and W untouched, Star-Crossed → P1's trash.
  test("(b) P2 swaps only the enemy slot A → Pouty Poro and keeps X: Poro → P1's hand, X → P2's hand, A stays; no Deflect power spent (751.1, 753, 754, 755)", async () => {
    const game = await stolen();
    await remake(game, ["x", "poro"]);
    await resolveChain(game);
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p1.hand()).toEqual(["poro"]);
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p2.hand()).toEqual(["x"]);
    expect(game.zoneOf("a")).toBe("base");
    expect(game.zoneOf("w")).toBe("base");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } }); // nothing beyond Rebuttal + [rainbow]
    expect(game.p1.trash()).toEqual(["sc"]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) remake both slots: X → W, A → Poro ────────────────────────────────────────────────
  // Expected: W (friendly to P2) + Poro (enemy to P2) → W → P2's hand, Poro → P1's hand; A and X stay.
  test("(c) P2 swaps both slots (X → W, A → Poro): W → P2's hand, Poro → P1's hand, A and X stay in base; Star-Crossed → P1's trash (751.1, 752.1)", async () => {
    const game = await stolen();
    await remake(game, ["w", "poro"]);
    await resolveChain(game);
    expect(game.p2.hand()).toEqual(["w"]);
    expect(game.p1.hand()).toEqual(["poro"]);
    expect(game.zoneOf("a")).toBe("base");
    expect(game.zoneOf("x")).toBe("base");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(game.p1.trash()).toEqual(["sc"]);
    expect(game.p2.trash()).toEqual(["reb"]);
  });

  // ── (d) illegal groups are refused at the Decision ────────────────────────────────────────
  // Expected (753.1): the remade group must still be exactly one P2-controlled + one P1-controlled unit,
  // so {A, Poro} (two P1 units) and {X, W} (two P2 units) are rejected outright — the chain item never
  // carries either set and nothing half-fizzles.
  test("(d) submitting {A, Poro} or {X, W} as the new choices is refused (753.1) — the item's targets never become a same-side pair", async () => {
    const game = await stolen();
    const d = await newChoicesPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const sameSide = (targets: readonly string[] | undefined): boolean => {
      const s = [...(targets ?? [])].sort().join(",");
      return s === "a,poro" || s === "w,x";
    };
    expect((await game.p2.try((p) => p.pick("a", "poro"))).ok).toBe(false);
    expect(sameSide(game.view().chain[0]?.targets)).toBe(false);
    expect((await game.p2.try((p) => p.pick("x", "w"))).ok).toBe(false);
    expect(sameSide(game.view().chain[0]?.targets)).toBe(false);
    // The prompt is still open for a legal answer — nothing was consumed by the refusals.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P2 })]);
    for (const c of ["a", "poro", "x", "w"]) {
      expect(game.zoneOf(c)).toBe("base");
    }
  });

  // ── contrast: don't pay → counter ────────────────────────────────────────────────────────

  test("contrast: P2 declines the [rainbow] — Star-Crossed is countered, nobody bounces, P2 keeps the rainbow; Star-Crossed still → P1's trash", async () => {
    const game = await rebutted();
    await game.p2.no();
    await resolveChain(game);
    for (const c of ["a", "poro", "x", "w"]) {
      expect(game.zoneOf(c)).toBe("base");
    }
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 1 } });
    expect(game.p1.trash()).toEqual(["sc"]);
    expect(game.p2.trash()).toEqual(["reb"]);
  });

  test("control: un-rebutted Star-Crossed [A, X] resolves for P1 — A → P1's hand, X → P2's hand", async () => {
    const game = await board().build();
    await game.p1.cast("sc", { targets: ["a", "x"] });
    await game.settle();
    expect(game.p1.hand()).toEqual(["a"]);
    expect(game.p2.hand().sort()).toEqual(["reb", "x"]);
    expect(game.p1.trash()).toEqual(["sc"]);
  });
});
