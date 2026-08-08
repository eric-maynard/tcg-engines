/**
 * Interaction: Undying Legion (unl-025-219) · Unit · Fury · 3 · 3 Might
 *     "[Legion] > You may play me from your trash for [3][fury]."
 *   × Rek'Sai, Breacher (sfd-029-221) · Champion Unit · Fury · 3 · 3 Might
 *     "[Accelerate] … [Assault] … Friendly units played from anywhere other than a player's hand
 *      have [Accelerate]."
 *   × Astral Heron (ven-044-166) · Unit · Calm · 7 · 7 Might
 *     "When you play your first card each turn, if I'm at a battlefield, your next card costs
 *      [2][rainbow][rainbow] less."
 *   (+ Legion Rearguard ogn-010-298 as the cheap first card; its own printed Accelerate is declined.)
 *
 * Rules: 812.1.b.1 / 812.1.c (Legion = dependent ability, Active only once a DIFFERENT card was
 * Finalized by you this turn), 419.4.b, 356.1.a (play "for [cost]" replaces the base cost),
 * 355.1.a + 805.1.a/805.1.a.1/805.2 + 356.2.b.1 (Accelerate = optional additional [1][C] declared
 * while playing), 805.6 (paid → enters ready), 356.4.d / 356.4.f / 356.4.f.1 (a total-cost
 * discount is applied after additional costs and may eat them; a discounted-to-nothing optional
 * cost still counts as paid), 356.6 (no cost below 0), 143.4 (otherwise units enter exhausted).
 *
 * Question: P1's turn; Heron at bf1, Rek'Sai in base, Undying Legion in TRASH, Rearguard in hand;
 * pool 6 energy + 2 fury.
 *   (a) Before any card is played, is the trash play offered?                       → No.
 *   (b) Rearguard (2, Accelerate declined) → Heron triggers → discount pending. Trash play now
 *       legal; alt cost [3][fury]; Rek'Sai grants Accelerate (non-hand play) → +[1][fury] =
 *       [4][fury][fury] − [2][A][A] = [2], 0 power, enters READY. Declined: [1], exhausted.
 *   (c) Rek'Sai absent → no Accelerate option; [1], exhausted.
 *   (d) The HAND copy as second card: printed 3 − Heron = [1], no Accelerate, exhausted.
 *   In every branch Heron's one-shot discount is consumed by that next card.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNDYING_LEGION = "unl-025-219";
const REKSAI = "sfd-029-221";
const ASTRAL_HERON = "ven-044-166";
const LEGION_REARGUARD = "ogn-010-298";

/**
 * P1's turn-2 main phase, nothing played yet. Heron at bf1 (P1's), Undying Legion in P1's trash,
 * Rearguard + a second Undying Legion in hand, 6 energy + 2 fury. Rek'Sai in base unless disabled.
 */
function board(withReksai = true) {
  const s = scenario()
    .resources(P1, { energy: 6, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", ASTRAL_HERON, "heron")
    .unit(P2, "bf2", { might: 2, name: "Bystander" }, "bystander")
    .trash(P1, UNDYING_LEGION, "ulTrash")
    .hand(P1, LEGION_REARGUARD, "rearguard")
    .hand(P1, UNDYING_LEGION, "ulHand");
  return withReksai ? s.unit(P1, "base", REKSAI, "reksai") : s;
}

/** Play Rearguard to base declining its own Accelerate, let Heron's first-card trigger resolve. */
async function openWithRearguard(game: Game): Promise<void> {
  await game.p1.play("rearguard", { accelerate: false, to: "base" });
  await game.settle();
}

const pendingDiscounts = (game: Game) => (game.gameState.activeReplacements ?? []).filter((r) => r.owner === P1).length;

/** Does the trash-play option enumerate an Accelerate (optional additional cost) variant? */
function accelerateOffered(game: Game, card: string): boolean {
  const opt = game.p1.option("playUnit", card);
  return (opt?.fields ?? []).some((f) => f.arg === "payOptional" || f.arg === "accelerate");
}

describe("Undying Legion from trash × Rek'Sai (granted Accelerate) × Astral Heron (next-card discount)", () => {
  // ── (a) Legion inactive ─────────────────────────────────────────────────────────────────────

  test("(a) with no card finalized this turn the Legion trash play is NOT a legal action — not enumerated, not executable (812.1.b.1/812.1.c)", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.legal().some((o) => o.card === "ulTrash")).toBe(false);
    expect(game.p1.can("play", "ulTrash")).toBe(false);
    const r = await game.p1.try((p) => p.play("ulTrash", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ulTrash")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 2 } });
    // The hand copy is an ordinary 3-cost play and IS legal right now.
    expect(game.p1.can("play", "ulHand")).toBe(true);
  });

  // ── (b) Rearguard first, then the trash play ────────────────────────────────────────────────

  test("(b) Rearguard costs 2 (6→4), enters exhausted (own Accelerate declined); its play triggers Heron and leaves ONE pending next-card discount", async () => {
    const game = await board().build();
    await game.p1.play("rearguard", { accelerate: false, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "heron", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("rearguard")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(pendingDiscounts(game)).toBe(1);
  });

  test("(b) after Rearguard is finalized Legion is Active: legal() now lists playing Undying Legion from the trash (to base or bf1)", async () => {
    const game = await board().build();
    await openWithRearguard(game);
    expect(game.p1.can("play", "ulTrash")).toBe(true);
    const opt = game.p1.option("playUnit", "ulTrash");
    expect(opt).toBeDefined();
    expect(opt?.fields.find((f) => f.arg === "to")?.options).toEqual(expect.arrayContaining(["base", "battlefield-bf1"]));
  });

  // Expected (805.1.a, 805.2, 355.1.a; Rek'Sai static): the trash play is "from anywhere other than
  // a player's hand", so Rek'Sai gives Undying Legion Accelerate and the play must offer the
  // optional additional cost. Actual: the playUnit option for the trash copy has only a `location`
  // field — no Accelerate / payOptional variant is enumerated.
  test.failing("BUG: (b) with Rek'Sai out, the trash play (a non-hand play) must offer Accelerate as an optional additional cost (805.2, 355.1.a)", async () => {
    const game = await board().build();
    await openWithRearguard(game);
    expect(game.p1.can("play", "ulTrash")).toBe(true);
    expect(accelerateOffered(game, "ulTrash")).toBe(true);
  });

  // Expected (356.1.a, 356.2.b, 356.4.d/f, 805.6, 356.4.f.1): [3][fury] alt + [1][fury] Accelerate
  // = [4][fury][fury]; Heron's total-cost discount −[2][A][A] → pay exactly 2 energy and 0 power
  // (4→2 energy, fury stays 2); the unit enters READY because the optional cost was "paid" even
  // though discounted to nothing; the discount is consumed. Actual: the accelerated trash play is
  // rejected outright (no such variant), so nothing is played.
  test.failing("BUG: (b) Accelerate declared on the trash play: total [4][fury][fury] − Heron [2][A][A] = 2 energy, 0 power; enters READY; discount consumed (356.4.f.1, 805.6)", async () => {
    const game = await board().build();
    await openWithRearguard(game);
    await game.p1.play("ulTrash", { accelerate: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
    await game.settle();
    expect(game.zoneOf("ulTrash")).toBe("base");
    expect(game.state("ulTrash").isReady).toBe(true);
    expect(game.state("ulTrash").might).toBe(3);
    expect(pendingDiscounts(game)).toBe(0);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
  });

  test("(b) Accelerate declined: alt cost [3][fury] − Heron [2][A][A] = 1 energy, 0 power (4→3, fury untouched — the spare [A] is wasted, 356.6); enters EXHAUSTED (143.4); discount consumed", async () => {
    const game = await board().build();
    await openWithRearguard(game);
    await game.p1.play("ulTrash", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 2 } });
    await game.settle();
    expect(game.zoneOf("ulTrash")).toBe("base");
    expect(game.state("ulTrash")).toMatchObject({ isExhausted: true, might: 3 });
    expect(pendingDiscounts(game)).toBe(0);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.p1.trash()).toEqual([]);
  });

  test("(b) the discount really was consumed by the trash play: a THIRD card (the hand copy, printed 3) is charged full price", async () => {
    const game = await board().build();
    await openWithRearguard(game);
    await game.p1.play("ulTrash", { to: "base" }); // 4 → 3
    await game.settle();
    // The engine may surface a spurious prompt here (see the BUG below); decline it if so.
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.decline();
      await game.settle();
    }
    await game.p1.play("ulHand", { to: "base" }); // full 3 → 0
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 2 } });
  });

  // ── (c) contrast: no Rek'Sai ────────────────────────────────────────────────────────────────

  test("(c) without Rek'Sai the trash play offers NO Accelerate (Undying Legion has none printed) and an accelerated attempt is refused", async () => {
    const game = await board(false).build();
    await openWithRearguard(game);
    expect(game.p1.can("play", "ulTrash")).toBe(true);
    expect(accelerateOffered(game, "ulTrash")).toBe(false);
    const r = await game.p1.try((p) => p.play("ulTrash", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ulTrash")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
  });

  test("(c) without Rek'Sai: [3][fury] − [2][A][A] = 1 energy, 0 power; enters exhausted; discount consumed", async () => {
    const game = await board(false).build();
    await openWithRearguard(game);
    await game.p1.play("ulTrash", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 2 } });
    await game.settle();
    expect(game.state("ulTrash")).toMatchObject({ isExhausted: true, might: 3, zone: "base" });
    expect(pendingDiscounts(game)).toBe(0);
  });

  // ── (d) contrast: the hand copy as the second card ──────────────────────────────────────────

  test("(d) from HAND as the second card: printed 3 − Heron = 1 energy, no power (4→3); Rek'Sai grants nothing to a hand play → no Accelerate offered / accepted; enters exhausted", async () => {
    const game = await board().build();
    await openWithRearguard(game);
    expect(game.p1.can("play", "ulHand")).toBe(true);
    expect(accelerateOffered(game, "ulHand")).toBe(false);
    const r = await game.p1.try((p) => p.play("ulHand", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ulHand")).toBe("hand");
    await game.p1.play("ulHand", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 2 } });
    expect(game.zoneOf("ulHand")).toBe("base");
    expect(game.state("ulHand").isExhausted).toBe(true);
    expect(pendingDiscounts(game)).toBe(0);
    // The trash copy is untouched by the hand play.
    expect(game.zoneOf("ulTrash")).toBe("trash");
  });

  // Expected: Undying Legion has NO triggered ability — "[Legion] > You may play me from your trash
  // for [3][fury]" is a static play permission that lives on the trash copy (812, 366.1). Playing a
  // copy from hand is a plain unit play: nothing goes on the chain and nobody is prompted.
  // Actual: the hand play puts a triggered "Undying Legion" ability on the chain which, on
  // resolution, prompts P1 to "Pick a revealed card to play" offering the trash copy (for free).
  test("(d) playing Undying Legion from hand is a normal unit play — no 'Undying Legion' ability goes on the chain and no play-from-trash prompt follows", async () => {
    const game = await board().build();
    await openWithRearguard(game);
    await game.p1.play("ulHand", { to: "base" });
    expect(game.chain().filter((i) => i.cardId === "ulHand")).toEqual([]);
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("ulTrash")).toBe("trash");
  });

  test("(d) after the hand copy is played (2 cards finalized, 3 energy + 2 fury left) the TRASH copy is still a legal Legion play at full alt cost [3][fury] — the discount is gone", async () => {
    const game = await board().build();
    await openWithRearguard(game);
    await game.p1.play("ulHand", { to: "base" }); // 4 → 3 (discount spent here)
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.decline(); // spurious prompt, see BUG above
      await game.settle();
    }
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 2 } });
    expect(game.p1.can("play", "ulTrash")).toBe(true);
    await game.p1.play("ulTrash", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // full [3][fury]
    await game.settle();
    expect(game.zoneOf("ulTrash")).toBe("base");
    expect(game.state("ulTrash").isExhausted).toBe(true);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(3);
  });
});
