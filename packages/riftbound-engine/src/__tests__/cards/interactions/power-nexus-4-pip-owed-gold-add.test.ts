/**
 * Interaction: Power Nexus (sfd-214-221) · Battlefield —
 *     "When you hold here, you may pay [rainbow][rainbow][rainbow][rainbow] to score 1 point."
 *   × Gold (sfd-t03) · gear token — "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   × Pouty Poro (ogn-013-298) · the body that makes the Hold happen.
 *
 * Question: P1 holds Power Nexus with a Poro on it and enters the Beginning Phase with four READY
 * runes of mixed Domains and one ready Gold token.
 *   (a) Does the pay line read "[rainbow]×4" and does the shortfall count DOWN as each recycle lands
 *       — 4 → 3 → 2 → 1 → paid in full — with "yes" actually accepted only at zero?
 *   (b) Do taps (which add Energy, and Energy can never pay a [rainbow] pip) leave the shortfall
 *       untouched, and does the prompt survive all four Adds without closing or being re-raised?
 *   (c) BUG probe — replay with ZERO runes and only the ready Gold. Is "yes" advertised as
 *       disabled-but-fundable, is the Gold's [Reaction] [Add] enumerated while the prompt is open,
 *       and does cracking it drop the shortfall?
 *   (d) If P1 answers no, does the Hold stand with no extra point scored and nothing spent?
 *
 * Build check: this file is meaningless on a build without 45d6955 / 037fdcf — the countdown and the
 * "disabled-but-fundable yes" only exist there. The first test asserts the observable markers
 * (a `needsAdd` shortfall on an open cost-bearing prompt) rather than trusting a SHA.
 *
 * Rules: 469.2 (Holding), 470 (once per battlefield per turn), 204.3.a / 383.3.a / 383.3.a.2 / 404.1
 * ("you may pay [C] TO Y" leads the effect → base cost, decided and paid at finalization; declining
 * removes the ability and it counts as not having triggered), 429.3 / 429.3.a (a [Reaction] [Add]
 * ability may be activated whenever a cost must be paid, and finalizes/resolves immediately),
 * 357.1.a (Adds during payment), 164.2.a / 164.2.b (tapping a rune adds Energy; recycling adds Power),
 * 135.2.e.5.b (a [rainbow] pip is paid by pooled Power of any Domain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POWER_NEXUS = "sfd-214-221";
const GOLD = "sfd-t03";
const POUTY_PORO = "ogn-013-298";

const PAY_LINE = "Pay [rainbow][rainbow][rainbow][rainbow] to use Power Nexus [nexus]'s optional ability?";

/** The shortfall the open prompt still needs before "yes" can be paid (undefined = payable now). */
function shortfall(game: Game): Record<string, number> | undefined {
  return (game.decision() as { needsAdd?: { power?: Record<string, number> } } | null)?.needsAdd?.power;
}

/**
 * It is P2's turn; ending it walks P1 into their Beginning Phase, where holding Power Nexus raises
 * the optional pay prompt. `runes` ready runes of mixed Domains, plus a ready Gold token when asked.
 */
function board(runes: number, gold: boolean) {
  let s = scenario()
    .active(P2)
    .battlefield("nexus", { controller: P1, def: POWER_NEXUS, inert: false })
    .unit(P1, "nexus", POUTY_PORO, "poro");
  for (let i = 0; i < runes; i++) {
    s = s.rune(P1, i % 2 === 0 ? "fury" : "calm", { alias: `r${i}` });
  }
  return gold ? s.gear(P1, GOLD, "gold") : s;
}

describe("Power Nexus — four [rainbow] pips owed inside one open prompt", () => {
  // ── (a) the countdown ─────────────────────────────────────────────────────────────────────────

  test("(a) the Hold raises one optional prompt quoting all four pips, owed as [rainbow]×4 with an empty pool (204.3.a, 383.3.a, 404.1)", async () => {
    const game = await board(4, true).build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({
      canAccept: true, // reachable after Adds — shown disabled, never hidden
      kind: "yes-no",
      prompt: PAY_LINE,
      seat: P1,
      source: { battlefieldId: "nexus", cardId: "nexus" },
      timing: "FIN",
    });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(shortfall(game)).toEqual({ rainbow: 4 });
  });

  test("(a) each recycle is its own Add game action inside the open payment window and the shortfall counts DOWN 4 → 3 → 2 → 1 → paid in full (429.3, 429.3.a, 164.2.b)", async () => {
    const game = await board(4, true).build();
    await game.p2.endTurn();
    expect(shortfall(game)).toEqual({ rainbow: 4 });
    await game.p1.recycleRune("r0");
    expect(shortfall(game)).toEqual({ rainbow: 3 });
    await game.p1.recycleRune("r1");
    expect(shortfall(game)).toEqual({ rainbow: 2 });
    await game.p1.recycleRune("r2");
    expect(shortfall(game)).toEqual({ rainbow: 1 });
    await game.p1.recycleRune("r3");
    expect(shortfall(game)).toBeUndefined(); // paid in full from the pool
    // Mixed Domains, all of them spendable on a [rainbow] pip (135.2.e.5.b).
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 2, fury: 2 } });
  });

  test("(a) 'yes' is enabled exactly at zero — refused after three Adds, accepted after the fourth, and it scores 1 point on top of the Hold's own", async () => {
    const game = await board(4, true).build();
    await game.p2.endTurn();
    const held = game.p1.points(); // the Hold itself already scored (469.2)
    for (const r of ["r0", "r1", "r2"]) {
      await game.p1.recycleRune(r);
    }
    const early = await game.p1.try((p) => p.yes());
    expect(early.ok).toBe(false);
    expect(game.p1.points()).toBe(held);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1, fury: 2 } }); // nothing taken
    await game.p1.recycleRune("r3");
    await game.p1.yes();
    await game.settle();
    expect(game.p1.points()).toBe(held + 1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // all four pips spent
  });

  // ── (b) taps are the wrong currency; the prompt persists ──────────────────────────────────────

  test("(b) tapping a rune adds Energy, which can never pay a [rainbow] pip — so the tap is not even offered inside this window, the rune survives for its recycle, and 'yes' stays refused (164.2.a vs 164.2.b / 164.2.b.1)", async () => {
    const game = await board(4, true).build();
    await game.p2.endTurn();
    // rule 429.3 + ruling e2a35c364b15734f — BOTH Add kinds stay offered while
    // the payment is asked: floating energy here is a legal (and sometimes
    // useful) play, and 594 lets the tapped rune still be recycled for the pip,
    // so the tap is never a one-way door. It just buys nothing toward [rainbow].
    const offered = (game.decision()?.actions ?? []).map((a) => a.moveId);
    expect(offered).toContain("exhaustRune");
    expect(offered).toContain("recycleRune");
    await game.p1.tapRune("r0");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(shortfall(game)).toEqual({ rainbow: 4 });
    // 594 — the tapped rune is still recyclable, so nothing was lost.
    await game.p1.recycleRune("r0");
    expect(shortfall(game)).toEqual({ rainbow: 3 });
    const attempt = await game.p1.try((p) => p.yes());
    expect(attempt.ok).toBe(false);
  });

  test("(b) the prompt stays OPEN across all four Adds — same chain item, same pay line, never re-raised or re-ordered — and every rune still in the pool stays recyclable throughout (429.3)", async () => {
    const game = await board(4, true).build();
    await game.p2.endTurn();
    const item = game.decision()?.source?.chainItemId;
    expect(item).toBeDefined();
    for (const [i, r] of ["r0", "r1", "r2", "r3"].entries()) {
      const recyclable = game.p1.legal().filter((o) => o.verb === "recycleRune").map((o) => o.card);
      expect(recyclable).toHaveLength(4 - i); // the whole rune row, re-derived after each Add
      expect(recyclable).toContain(r);
      await game.p1.recycleRune(r);
      expect(game.decision()).toMatchObject({
        kind: "yes-no",
        prompt: PAY_LINE,
        seat: P1,
        source: { battlefieldId: "nexus", cardId: "nexus", chainItemId: item },
      });
    }
  });

  // ── (c) the load-bearing half: a Gold is a [Reaction] [Add] too ───────────────────────────────

  test("(c) setup for the Gold probe: with ZERO runes the seat's only Power source is the ready Gold token", async () => {
    const game = await board(0, true).build();
    await game.p2.endTurn();
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.gear()).toEqual(["gold"]);
    expect(game.state("gold").isExhausted).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "yes-no", prompt: PAY_LINE, seat: P1 });
  });

  test("(c) a ready Gold's '[Reaction] — [Add] [rainbow]' is enumerated while the pay prompt is open, and cracking it drops the shortfall exactly as a rune recycle does (429.3/429.3.a: ANY Reaction [Add] is legal whenever a cost must be paid)", async () => {
    const game = await board(0, true).build();
    await game.p2.endTurn();
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(shortfall(game)).toEqual({ rainbow: 3 });
  });

  // A Gold is a Reaction [Add] like a rune, so the reachability maths counts it: the seat is one
  // Gold into a four-pip bill — SHORT, not locked out — and "yes" stays visible-but-disabled with
  // the shortfall quoted, exactly as it does for runes (429.3, DESIGN §Paying costs).
  test("(c) with only a Gold to draw on, the prompt reports canAccept:true with the disabled-but-fundable needsAdd it reports for runes", async () => {
    const game = await board(0, true).build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ canAccept: true });
    expect(shortfall(game)).toEqual({ rainbow: 4 });
  });

  test("(c) the Gold's Add is now OFFERED inside the window (429.3), but 'yes' itself stays refused until the pool actually covers the pips", async () => {
    const game = await board(0, true).build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ canAccept: true });
    const attempt = await game.p1.try((p) => p.yes());
    expect(attempt.ok).toBe(false);
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["activate", "concede"]);
  });

  // ── (d) declining is free ─────────────────────────────────────────────────────────────────────

  test("(d) answering no: the ability is removed and treated as not having triggered (383.3.a.2) — no extra point, nothing spent, every rune still ready, and the Hold itself stands", async () => {
    const game = await board(4, true).build();
    await game.p2.endTurn();
    const held = game.p1.points();
    await game.p1.no();
    await game.settle();
    expect(game.p1.points()).toBe(held);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.runes({ ready: true })).toEqual(expect.arrayContaining(["r0", "r1", "r2", "r3"]));
    expect(game.state("gold").isExhausted).toBe(false);
    expect(game.zoneOf("gold")).toBe("base");
    // 470 — the Hold scored the battlefield for the turn; the Nexus prompt must not re-fire.
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["nexus"]);
    expect(game.gameState.battlefields.nexus?.controller).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
