/**
 * Interaction: Dredge Up (ven-049-166) · Spell · Mind · 2 energy
 *     "Draw 1. [Flow] [2] (You may play this from your trash for its Flow cost. Then banish it.)"
 *   × Hard Bargain (sfd-136-221) "[Reaction] [Repeat][2] Counter a spell unless its controller pays [2]."
 *   × Abandon (unl-131-219) "[Reaction] Counter a spell. Return it to its owner's hand instead of
 *      putting it in their trash. [Predict]."
 *
 * Rules:
 *   829.1.b.1 / 390.3.a — Flow's "then banish it" is a delayed replacement: if the Flowed spell would
 *                          leave the chain (not by its own text), banish it instead.
 *   829.1.b.2           — Flow changes only the zone it is played from, not its timing.
 *   829.1.c.1           — the Flow cost is an alternate cost.
 *   425.1.a.1 / .b / .c — a countered spell does nothing, goes to trash (here: replaced), no refund.
 *   370.2, 372          — a replacement may apply to a replacing event; the affected object's
 *                          controller orders competing replacements → Abandon's "hand instead" still
 *                          ends in banishment.
 *   155                 — banishment is not the trash: a banished Dredge Up cannot be Flowed again.
 *
 * Question: Flowed Dredge Up — where does it end up when it (a) resolves, (b) is Hard-Bargained,
 * (c) is Abandoned; (d) contrast with the same counters on a hand-cast copy; and Flow timing.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Decision } from "../../../harness";

const DREDGE_UP = "ven-049-166";
const HARD_BARGAIN = "sfd-136-221";
const ABANDON = "unl-131-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1 declines any "pay [2]?" offer; P2 declines the Predict recycle. */
const p1Declines = (d: Decision) => (d.kind === "yes-no" ? false : d.kind === "pick" && d.allowDecline ? "decline" : undefined);
const p2DeclinesPredict = (d: Decision) => (d.kind === "pick" && d.allowDecline ? "decline" : d.kind === "yes-no" ? false : undefined);

/**
 * P1's main phase. P1 has 4 energy (enough to Flow/cast for 2 AND still afford Hard Bargain's [2],
 * which P1 will decline). Dredge Up starts in P1's trash or hand. P2 has 2 energy and both counters.
 */
function board(from: "trash" | "hand") {
  const s = scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 2 })
    .hand(P2, HARD_BARGAIN, "hardBargain")
    .hand(P2, ABANDON, "abandon")
    .script(P1, [p1Declines, p1Declines, p1Declines])
    .script(P2, [p2DeclinesPredict, p2DeclinesPredict, p2DeclinesPredict]);
  return from === "trash" ? s.trash(P1, DREDGE_UP, "dredge") : s.hand(P1, DREDGE_UP, "dredge");
}

/** P1 plays Dredge Up (via Flow if it is in the trash), passes, and P2 answers with `counter`. */
async function dredgeThenCounter(game: Game, counter: "hardBargain" | "abandon"): Promise<void> {
  const viaFlow = game.zoneOf("dredge") === "trash";
  await game.p1.cast("dredge", viaFlow ? { flow: true } : {});
  expect(game.p1.energy()).toBe(2);
  await game.p1.passPriority();
  await game.p2.cast(counter, counter === "hardBargain" ? { targets: "dredge" } : {});
  expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", counter]);
  await game.settle();
  expect(game.chain()).toEqual([]);
}

describe("Flow spell (Dredge Up) countered by Hard Bargain / Abandon — still banished", () => {
  // ── timing ──────────────────────────────────────────────────────────────────────────────────

  test("timing: Flow does not grant new timing — Dredge Up cannot be Flowed on the opponent's turn (829.1.b.2)", async () => {
    const game = await board("trash").active(P2).build();
    expect(game.p1.can("cast", "dredge")).toBe(false);
    const r = await game.p1.try((p) => p.cast("dredge", { flow: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("dredge")).toBe("trash");
  });

  test("timing: Dredge Up has no [Action], so it cannot be Flowed during a showdown either (829.1.b.2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .trash(P1, DREDGE_UP, "dredge")
      .autoProcedures(false)
      .build();
    await game.p1.move("scout", "bf1"); // uncontrolled, empty battlefield → non-combat showdown, P1 has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "dredge")).toBe(false);
    const r = await game.p1.try((p) => p.cast("dredge", { flow: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("dredge")).toBe("trash");
  });

  // ── (a) resolves ────────────────────────────────────────────────────────────────────────────

  test("(a) Flowed from trash for [2]: draws 1, then is BANISHED instead of trashed — and cannot be Flowed again", async () => {
    const game = await board("trash").build();
    expect(game.p1.option("cast", "dredge")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    const hand = game.p1.hand().length;
    await game.p1.cast("dredge", { flow: true });
    expect(game.p1.energy()).toBe(2); // Flow cost [2] replaces the base cost (also 2 here)
    expect(game.zoneOf("dredge")).toBe("chain");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.zoneOf("dredge")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("dredge");
    expect(game.p1.can("cast", "dredge")).toBe(false);
  });

  // ── (b) Hard Bargain ────────────────────────────────────────────────────────────────────────

  test("(b) Hard Bargain counters the Flowed Dredge Up (P1 declines to pay): no draw, no refund, and it is still BANISHED, not trashed (425.1, 829.1.b.1)", async () => {
    const game = await board("trash").build();
    const hand = game.p1.hand().length;
    await dredgeThenCounter(game, "hardBargain");
    expect(game.p1.hand()).toHaveLength(hand); // countered: no draw
    expect(game.p1.energy()).toBe(2); // Flow cost not refunded (and the [2] ransom was not paid)
    expect(game.zoneOf("dredge")).toBe("banishment");
    expect(game.zoneOf("hardBargain")).toBe("trash");
    expect(game.p1.can("cast", "dredge")).toBe(false); // nothing left in the trash to Flow
  });

  // ── (c) Abandon ─────────────────────────────────────────────────────────────────────────────

  test.failing("BUG: (c) Abandon counters the Flowed Dredge Up — it is STILL banished; 'hand instead of trash' cannot beat Flow's leave-the-chain replacement (370.2, 372, 829.1.b.1)", async () => {
    // Expected: whichever order the replacements apply, leaving the chain (to trash OR to hand) is
    // replaced by banishment; P1's hand does not gain Dredge Up. Actual: it returns to P1's hand.
    const game = await board("trash").build();
    const hand = game.p1.hand().length;
    await dredgeThenCounter(game, "abandon");
    expect(game.zoneOf("abandon")).toBe("trash");
    expect(game.zoneOf("dredge")).toBe("banishment");
    expect(game.p1.hand()).toHaveLength(hand); // neither drew nor got the spell back
  });

  test("(c) P2 still gets Abandon's Predict after countering the Flowed spell, and the countered Dredge Up drew nothing", async () => {
    const game = await board("trash").fillDecks({ main: 10, runes: 12 }).build();
    game.clearScript(P2); // observe the Predict prompt ourselves
    const p2Top = game.p2.deck()[0];
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("dredge", { flow: true });
    await game.p1.passPriority();
    await game.p2.cast("abandon");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual([p2Top]);
    await game.p2.decline();
    await game.settle();
    expect(game.p2.deck()[0]).toBe(p2Top);
    expect(game.p1.hand().filter((c) => c !== "dredge")).toHaveLength(p1Hand); // no "Draw 1"
  });

  // ── (d) contrast: cast from hand ────────────────────────────────────────────────────────────

  test("(d) cast from HAND and Hard-Bargained: goes to P1's trash — from where it CAN later be Flowed for [2]", async () => {
    const game = await board("hand").build();
    const handAfterCast = game.p1.hand().length - 1;
    await dredgeThenCounter(game, "hardBargain");
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handAfterCast); // no draw
    expect(game.p1.energy()).toBe(2);
    // Now it is a Flow candidate.
    expect(game.p1.can("cast", "dredge")).toBe(true);
    expect(game.p1.option("cast", "dredge")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    await game.p1.cast("dredge", { flow: true });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("dredge")).toBe("banishment");
    expect(game.p1.hand()).toHaveLength(handAfterCast + 1);
  });

  test("(d) cast from HAND and Abandoned: returns to P1's hand (no Flow replacement pending), no draw", async () => {
    const game = await board("hand").build();
    const hand = game.p1.hand().length;
    await dredgeThenCounter(game, "abandon");
    expect(game.zoneOf("dredge")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(hand); // Dredge Up back, nothing drawn
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("abandon")).toBe("trash");
  });
});
