/**
 * Interaction: Forge of the Future's recycle SET is chosen when the ability is finalized — before its own
 * kill-cost is paid — so the Forge can never recycle itself, and a Reaction that shuffles the trashes
 * afterwards cannot add to or re-aim that set.
 *
 *   × Forge of the Future (ogn-212-298) · Gear · Order · 2
 *       "When you play this, play a 1 [Might] Recruit unit token at your base.
 *        Kill this: Recycle up to 4 cards from trashes."                                            — P1
 *   × Heedless Resurrection (unl-142-219) · Spell · Chaos · 2 + [chaos] · [Reaction]
 *       "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that costs
 *        no more Energy and no more Power than the killed unit, ignoring its cost."                  — P2
 *
 * Rules: 402.2 (an activated ability makes ALL its choices when it is finalized on the chain), 355.5 /
 * 355.7 (choosing specific Game Objects = Targeting), 355.10.a / 355.10.a.1 (a trash is a PUBLIC zone, so
 * "cards from trashes" IS a target choice — every player's trash is in scope), 355.13 ("up to 4" may be
 * answered with zero), 355.15 (the choices cannot change afterwards), 357.2 (non-standard costs — here
 * "Kill this" — are paid in step 4, AFTER the step-2 choices), 359.3.e.2 / 359.3.e.4 / 359.3.e.5 (a target
 * that changed zones is illegal on resolution and is simply unaffected — no re-pick), 359.3.e.8 (the
 * instruction still executes for the targets that are still legal).
 *
 * Position: P1's turn, Open. P1 controls Forge of the Future; P1's trash holds A and B; P2's trash holds
 * X (a 1-cost unit) and Y (an 8-cost unit); P2 controls a 5-cost unit W and holds Heedless Resurrection
 * with 2 energy + [chaos].
 *
 * Question / Expected:
 *  (a) The option set is minted at ACTIVATION (402.2 / 355.5): every card in EVERY player's trash —
 *      {A, B, X, Y}. Forge of the Future itself is NOT offered: its own kill is a cost paid in step 4,
 *      after the step-2 choices (357.2), so at choice time the Forge is still on the board and could never
 *      be one of its own targets. "Up to 4" also allows ZERO picks (355.13) — P1 may activate purely to
 *      kill the Forge.
 *  (b) P1 picks A, B, X, Y. P2 answers with Heedless Resurrection, killing its own W (W → P2's trash) and
 *      playing X out of the trash. Heedless resolves first (LIFO). When the Forge's ability resolves, X has
 *      changed zones and is an illegal target — unaffected, that recycle is simply lost (359.3.e.2/4/5) —
 *      W was never chosen and cannot be added, and no replacement pick is offered (355.15). A, B and Y
 *      still recycle (359.3.e.8).
 *  (c) The Forge card, in P1's trash since the cost was paid, is NOT recycled by its own resolving ability:
 *      it is not among the targets and stays in the trash.
 *  (d) NO side: the set must not be minted at RESOLUTION. A set minted then would contain W, the Forge
 *      (and the spent Heedless) and would NOT contain X.
 *
 * SETTLED 2026-08-12 (DESIGN.md § "Choices and when they are made" / § "A Public pile is a target pool"):
 * finalization. 355.10 is a CLOSED list of carve-outs and 355.10.a only defers a pick while the object sits
 * in a zone whose information status is not Public — 355.10.a.1 lists the trashes as Public, and 355.10.a's
 * own example is "*Return a unit from your trash to your hand* targets a unit card in your trash". riftjudge
 * `2f2fb3a61bb3446a` is not a counter-authority: it answers only "is *Kill this* a cost?" and never says when
 * the set is chosen. This file previously asserted the opposite in four facets; do not flip it back.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGE = "ogn-212-298";
const HEEDLESS = "unl-142-219";

const A = { cardType: "unit", energyCost: 2, might: 2, name: "A" } as const;
const B = { cardType: "unit", energyCost: 2, might: 2, name: "B" } as const;
/** Cheap enough for Heedless to replay it off the 5-cost W. */
const X = { cardType: "unit", energyCost: 1, might: 1, name: "X" } as const;
/** 8 energy — in the trashes for the recycle, but never a legal Heedless replay. */
const Y = { cardType: "unit", energyCost: 8, might: 8, name: "Y" } as const;
const W = { cardType: "unit", energyCost: 5, might: 5, name: "W" } as const;

function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .gear(P1, FORGE, "forge")
    .unit(P1, "base", { might: 2, name: "Keeper" }, "keeper")
    .unit(P2, "base", W, "w")
    .trash(P1, A, "a")
    .trash(P1, B, "b")
    .trash(P2, X, "x")
    .trash(P2, Y, "y")
    .hand(P2, HEEDLESS, "hr");
}

/**
 * The cards the Forge's recycle set is currently offering (empty when nothing is being asked). Since the set
 * became a Make-Relevant-Choices target set (355.5 / 402.2) the prompt is the finalization `pick-many`; the
 * legacy resolution-time `reveal-and-pick` shape is still matched so a regression back to it is visible here
 * rather than as an empty list.
 */
function recycleOffer(game: Game): string[] {
  const d = game.decision();
  if (d?.kind !== "pick") {
    return [];
  }
  const isForgeSet = d.source?.cardId === "forge" || d.meta?.onPicked === "recycle";
  if (!isForgeSet) {
    return [];
  }
  return d.options.map((o) => o.card ?? o.key).toSorted();
}


describe("Forge of the Future — recycle set locked before the kill-cost × Heedless Resurrection", () => {
  // ── (a) what is on offer, and when ──────────────────────────────────────────────────────────

  // MIGRATED 2026-08-12: this facet previously passed priority twice first, i.e. it asserted the RESOLUTION
  // model. 355.10.a.1 makes a trash Public, so the set is named in Make Relevant Choices (355.5 / 402.2) —
  // do not flip it back.
  test('(a) "from trashes" spans EVERY player\'s trash (355.10.a / 355.10.a.1 — trashes are public): A and B (P1\'s) and X and Y (P2\'s) are all on offer, up to 4 of them', async () => {
    const game = await board().build();
    await game.p1.activate("forge");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 4, min: 0, seat: P1, timing: "FIN" });
    expect(recycleOffer(game)).toEqual(expect.arrayContaining(["a", "b", "x", "y"]));
  });

  // 402.2 / 355.5 / 355.7 + 355.10.a: the trashes are public, so "recycle up to 4 cards from trashes" is a
  // TARGET choice and belongs to finalization — asked right after `activate`, before anyone gets priority.
  // CR 355.10.a.1 (a trash is Public) + 355.5 / 355.13 / 402.2 put the set in Make Relevant Choices; riftjudge
  // 2f2fb3a61bb3446a does not say otherwise (it only answers "is Kill this a cost?"). This was a
  // `test.failing` marker until 2026-08-12; do not flip it back.
  test("(a) the recycle set is chosen when the ability is FINALIZED (402.2 / 355.5 / 355.7) — a FIN pick for P1 right after `activate`, before P1 or P2 hold priority", async () => {
    const game = await board().build();
    await game.p1.activate("forge");
    expect(game.chain().map((c) => c.cardId)).toEqual(["forge"]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(recycleOffer(game)).toEqual(["a", "b", "x", "y"]);
  });

  // 357.2: costs are paid in step 4, the choices are made in step 2 — so when the set is chosen the Forge
  // is still a gear on the board and can never be one of its own targets.
  // Was a `test.failing` marker until 2026-08-12 (the engine offered the dead Forge); do not flip it back.
  test("(a) Forge of the Future is NOT one of its own recycle options — its kill is a COST paid after the choices (357.2)", async () => {
    const game = await board().build();
    await game.p1.activate("forge");
    expect(game.zoneOf("forge")).toBe("trash"); // already paid, and still not an option
    expect(recycleOffer(game)).not.toContain("forge");
    expect(recycleOffer(game)).toEqual(["a", "b", "x", "y"]);
    // …and naming the whole set never touches it: the Forge stays in P1's trash.
    await game.p1.pick("a", "b", "x", "y");
    await game.settle();
    expect(game.p1.trash()).toEqual(["forge"]);
  });

  test('(a) "up to 4" may be answered with ZERO (355.13): P1 may activate purely to kill the Forge — nothing is recycled, both trashes are untouched and the Forge is off the board', async () => {
    const game = await board().build();
    expect(game.p1.gear()).toEqual(["forge"]);
    await game.p1.activate("forge");
    expect(game.zoneOf("forge")).toBe("trash"); // the cost, paid at once
    // MIGRATED 2026-08-12: the "up to 4" set is answered at FINALIZATION (355.13 / 402.2), not after both
    // reaction windows closed. Do not re-order this back behind the two passes.
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", min: 0, timing: "FIN" });
    await game.p1.decline();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.p1.trash().toSorted()).toEqual(["a", "b", "forge"]);
    expect(game.p2.trash().toSorted()).toEqual(["x", "y"]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) the locked set survives Heedless Resurrection ───────────────────────────────────────

  // Rules line: P1 names {A,B,X,Y} at finalization; P2 kills W (→ P2's trash) and replays X out of the
  // trash; on resolution X is an illegal target (changed zones, 359.3.e.2/4/5) and is unaffected, W was
  // never chosen (355.15 — no additions, no re-pick), A/B/Y still recycle (359.3.e.8).
  // Was a `test.failing` marker until 2026-08-12 (no set existed to lock); do not flip it back.
  test("(b) with the set locked at finalization, Heedless can only SUBTRACT: X (replayed out of the trash) is unaffected and lost, W is never added, no re-pick is offered, and A, B, Y still recycle", async () => {
    const game = await board().build();
    await game.p1.activate("forge");
    // step 2 of 402: the whole set is named now, while W is on the board and X is still in P2's trash.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(recycleOffer(game)).toEqual(["a", "b", "x", "y"]);
    await game.p1.pick("a", "b", "x", "y");

    await game.p1.passPriority();
    await game.p2.cast("hr", { sacrifice: "w" });
    expect(game.zoneOf("w")).toBe("trash");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Heedless resolves (LIFO); X is its only legal replay, auto-confirmed
    expect(game.p2.base()).toContain("x");

    await game.p1.passPriority();
    await game.p2.passPriority(); // the Forge's ability resolves off its locked set
    expect(recycleOffer(game)).toEqual([]); // 355.15 — nothing is re-asked
    expect(game.zoneOf("a")).toBe("mainDeck");
    expect(game.zoneOf("b")).toBe("mainDeck");
    expect(game.zoneOf("y")).toBe("mainDeck");
    expect(game.zoneOf("x")).toBe("base"); // unaffected, still on the board
    expect(game.zoneOf("w")).toBe("trash"); // never chosen, never added
    expect(game.zoneOf("forge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (c) the Forge is not recycled by its own ability ────────────────────────────────────────

  test("(c) a full 4-card recycle from both trashes leaves the Forge itself in P1's trash — the card that paid the cost is not among the targets: A, B → P1's deck, X, Y → P2's deck (owner's deck, 416.1.c)", async () => {
    const game = await board().build();
    await game.p1.activate("forge");
    // MIGRATED 2026-08-12: named at finalization (355.5 / 402.2), before anyone holds priority.
    await game.p1.pick("a", "b", "x", "y");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("forge")).toBe("trash");
    expect(game.p1.trash()).toEqual(["forge"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p1.deck().slice(-2).toSorted()).toEqual(["a", "b"]);
    expect(game.p2.deck().slice(-2).toSorted()).toEqual(["x", "y"]);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) NO side: the set must not be minted at resolution ───────────────────────────────────

  // A set minted at resolution would read the trashes as they are THEN: it would contain W (killed to pay
  // for Heedless), the Forge (killed to pay for this very ability) and the spent Heedless, and it would NOT
  // contain X (which Heedless replayed onto the board). Was a `test.failing` marker until 2026-08-12, when
  // the engine offered exactly that wrong menu; do not flip it back.
  test("(d) no recycle pick may exist at RESOLUTION — a menu minted there would contain W, the Forge and the spent Heedless, and would be missing X, i.e. exactly the cards 357.2 / 355.15 / 359.3.e.5 say cannot be in the set", async () => {
    const game = await board().build();
    await game.p1.activate("forge");
    await game.p1.decline(); // 355.13 — the FIN set may be answered with nothing
    await game.p1.passPriority();
    await game.p2.cast("hr", { sacrifice: "w" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Heedless resolves; X is its only legal replay, auto-confirmed
    await game.p1.passPriority();
    await game.p2.passPriority(); // the Forge's ability resolves
    const offered = recycleOffer(game);
    expect(offered).toEqual([]); // nothing may be asked here at all
    expect(offered).not.toContain("w");
    expect(offered).not.toContain("forge");
    expect(offered).not.toContain("hr");
  });

  test("(d) W and the Forge are still in the trashes and X is on P2's board when everything has settled — the two cards a resolution-time set would have swallowed", async () => {
    const game = await board().build();
    await game.p1.activate("forge");
    // MIGRATED 2026-08-12: the set is locked in HERE (355.15), and resolution only drops the member that
    // left the trash (359.3.e.5/8). Do not move this pick back behind the reaction windows.
    await game.p1.pick("a", "b", "x", "y");
    await game.p1.passPriority();
    await game.p2.cast("hr", { sacrifice: "w" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Heedless resolves; X is its only legal replay, auto-confirmed
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(recycleOffer(game)).toEqual([]);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("x")).toBe("base");
    expect(game.p2.base()).toContain("x");
    expect(game.zoneOf("w")).toBe("trash");
    expect(game.p2.trash()).toContain("w");
    expect(game.zoneOf("forge")).toBe("trash");
    expect(game.p1.trash()).toContain("forge");
    expect(game.zoneOf("a")).toBe("mainDeck");
    expect(game.zoneOf("b")).toBe("mainDeck");
    expect(game.zoneOf("y")).toBe("mainDeck");
    expect(game.violations()).toEqual([]);
  });
});
