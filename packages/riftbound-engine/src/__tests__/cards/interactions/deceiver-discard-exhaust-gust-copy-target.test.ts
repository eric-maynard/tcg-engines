/**
 * Interaction: Deceiver (unl-199-219) · Legend (LeBlanc)
 *     "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token
 *      there. It becomes a copy of another unit there. Give it [Temporary]."
 *   × Daring Poro (ogn-210-298) · Unit · Order · 2 · 2 Might · [Assault]
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · [Reaction]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Rules: 383.3.a (leading "you may" → opt-in decided at finalization), 383.3.b / 383.3.b.1 ("discard 1 and
 * exhaust me TO …" is the trigger's BASE cost — every part must be payable, and it is paid to finalize),
 * 402.2 / 355.10 ("another unit there" is a chosen board object → a target, locked in at finalization step 2),
 * 402.4 (no legal target → removed), 404.1 / 404.2 (costs paid at step 4; unpayable → removed, never asked),
 * 406.4 (only after finalization does anyone get priority), 359.3.e.1/.2/.4/.5/.11 (resolve as much as
 * possible; an instruction whose target left the board is ignored, independent instructions still happen),
 * 187.6 (Reflection = domainless 0-Might unit token), 477.1.b (copy = printed name/Might/text), 816.1.b
 * (Temporary dies at the start of its controller's Beginning Phase, before scoring), 190.4.c / 323.6 (control
 * of a battlefield is only stripped by the open-state cleanup, which a live chain defers).
 *
 * Q: P1's lone Daring Poro conquers bf1; P2 holds Gust.
 *   (a) What is locked in before P2 can react?  → P1 opts in, picks the discard, the copy target (Poro) is
 *       fixed, the card is in the trash and Deceiver is exhausted — all before P2's first priority.
 *   (b) P2 Gusts the Poro in response.          → Gust resolves first; Deceiver still plays a ready 0-Might
 *       vanilla Reflection at bf1 (copy instruction ignored), with Temporary; P1 keeps bf1; the token dies at
 *       P1's next Beginning Phase before the Hold is scored.
 *   (c) Empty hand / exhausted legend.           → No prompt at all in either case.
 *   (d) No Gust.                                 → A ready "Daring Poro" token copy (2 Might, Assault) + Temporary.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";
const DARING_PORO = "ogn-210-298";
const GUST = "ogn-169-298";
const FODDER = "ogn-175-298"; // vanilla Shipyard Skulker — the card P1 discards

/**
 * P1's turn. P1: Deceiver (ready unless `exhausted`), a ready Daring Poro in base, `hand` fodder cards.
 * bf1 is uncontrolled and empty (walk-in conquer). P2: Gust in hand + 1 energy to cast it.
 */
function board(opts: { hand?: number; exhausted?: boolean } = {}) {
  const b = scenario();
  if (opts.exhausted) {
    b.card("leblanc", { def: DECEIVER, meta: { exhausted: true }, owner: P1, zone: "legendZone" });
  } else {
    b.legend(P1, DECEIVER, "leblanc");
  }
  b.battlefield("bf1", { controller: null }).unit(P1, "base", DARING_PORO, "poro").hand(P2, GUST, "gust").resources(P2, { energy: 1 });
  for (let i = 0; i < (opts.hand ?? 1); i++) {
    b.hand(P1, FODDER, `fodder${i}`);
  }
  return b;
}

/** Pass focus/priority (nothing else) until a non-action prompt or an open main phase. */
async function untilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** Poro walks onto bf1 and conquers; P1 accepts Deceiver and discards fodder0; stop at P2's first priority. */
async function conquerAndAccept(game: Game): Promise<void> {
  await game.p1.move("poro", "bf1");
  await untilPrompt(game);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    const want = d.options.find((o) => (o.card ?? o.key) === "fodder0") ?? d.options[0]!;
    await game.p1.pick(want.key);
  }
  // P1 (turn player) gets priority first; pass it so P2 may react.
  for (let i = 0; i < 3 && game.decision()?.kind === "action" && game.decision()?.seat === P1; i++) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

const tokensAt = (game: Game, loc: string) => game.p1.units(loc as "base").filter((id) => game.state(id).isToken);

describe("Deceiver × Gust — cost/target lock-in at finalization, partial resolution after the copy source is bounced", () => {
  // ── (a) what is fixed before P2 can react ─────────────────────────────────────────────────────
  test("(a) the conquer scores and raises Deceiver's 'you may' for P1 with the trigger on the chain; nothing is paid before P1 opts in (383.3.a)", async () => {
    const game = await board().build();
    await game.p1.move("poro", "bf1");
    await untilPrompt(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.p1.hand()).toEqual(["fodder0"]);
    expect(game.state("leblanc").isExhausted).toBe(false);
  });

  test("(a) by P2's FIRST priority the discard is in the trash and Deceiver is exhausted (383.3.b.1, 404.1, 406.4)", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    expect(game.zoneOf("fodder0")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", triggered: true })]);
    // P2 may now react with Gust — and the Poro (2 Might, at a battlefield) is a legal Gust target.
    expect(game.p2.can("cast", "gust")).toBe(true);
    const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("poro");
  });

  test.failing("BUG: (a) 'It becomes a copy of ANOTHER unit there' is a chosen board object, so the copy source must be LOCKED on the chain item at finalization (402.2, 355.10)", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", targets: ["poro"], triggered: true })]);
  });

  test("(a) with two cards in hand P1 CHOOSES which one pays the cost; the other stays in hand", async () => {
    const game = await board({ hand: 2 }).build();
    await game.p1.move("poro", "bf1");
    await untilPrompt(game);
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["fodder0", "fodder1"]);
    await game.p1.pick("fodder1");
    expect(game.zoneOf("fodder1")).toBe("trash");
    expect(game.p1.hand()).toEqual(["fodder0"]);
    expect(game.state("leblanc").isExhausted).toBe(true);
  });

  // ── (b) Gust in response ─────────────────────────────────────────────────────────────────────
  test("(b) Gust goes on top of Deceiver's trigger (LIFO) and resolves first: Poro returns to P1's hand", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    await game.p2.cast("gust", { targets: "poro" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["leblanc", "gust"]);
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p1.hand()).toEqual(["poro"]);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("(b) the cost is never refunded: after Gust, fodder is still in the trash and Deceiver is still exhausted", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    await game.p2.cast("gust", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("fodder0")).toBe("trash");
    expect(game.state("leblanc").isExhausted).toBe(true);
  });

  test("(b) Deceiver still resolves as far as it can: exactly one READY Reflection token is played AT bf1 (not base), controlled by P1 (359.3.e.1/.11)", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    await game.p2.cast("gust", { targets: "poro" });
    await game.settle();
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    expect(tokensAt(game, "base")).toEqual([]);
    expect(game.state(toks[0]!)).toMatchObject({ controller: P1, isReady: true, isToken: true, owner: P1, zone: "battlefield-bf1" });
  });

  test("(b) the copy instruction is ignored (target left the board, 359.3.e.2/.4/.5): the token is a vanilla 0-Might domainless 'Reflection' (187.6) — NOT a Daring Poro, no Assault", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    await game.p2.cast("gust", { targets: "poro" });
    await game.settle();
    const tok = tokensAt(game, "bf1")[0]!;
    const s = game.state(tok);
    expect(s.name).toBe("Reflection");
    expect(s.might).toBe(0);
    expect(s.baseMight).toBe(0);
    expect(s.domains).toEqual([]);
    expect(s.keywords).not.toContain("Assault");
    expect(s.meta.copyOfCardId).toBeUndefined();
  });

  test("(b) 'Give it [Temporary]' names the token, not the target → the vanilla Reflection still has Temporary", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    await game.p2.cast("gust", { targets: "poro" });
    await game.settle();
    const tok = tokensAt(game, "bf1")[0]!;
    expect(game.state(tok).keywords).toContain("Temporary");
  });

  test("(b) P1 KEEPS bf1: the chain kept the turn closed so control was never stripped while bf1 was momentarily empty (190.4.c, 323.6); P1 is back in an open main phase with 1 point", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    await game.p2.cast("gust", { targets: "poro" });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) the 0-Might Temporary token survives P2's turn but dies at the START of P1's next Beginning Phase before scoring (816.1.b): no Hold point, bf1 uncontrolled, token gone", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    await game.p2.cast("gust", { targets: "poro" });
    await game.settle();
    const tok = tokensAt(game, "bf1")[0]!;
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf(tok)).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // → P1's turn: Temporary kill, then (no) Hold
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(tok) ? game.zoneOf(tok) : "gone").toBe("gone");
    expect(game.p1.points()).toBe(1); // no Hold scored
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.state("leblanc").isExhausted).toBe(false); // legend readied normally
  });

  // ── (c) unpayable cost → no prompt ───────────────────────────────────────────────────────────
  test("(c) EMPTY hand, Deceiver ready → 'discard 1' is unpayable → P1 is never prompted; conquer still scores; legend stays ready; no token (383.3.b.1, 404.2)", async () => {
    const game = await board({ hand: 0 }).build();
    await game.p1.move("poro", "bf1");
    await untilPrompt(game);
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false).toBe(false);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("leblanc").isExhausted).toBe(false);
    expect(tokensAt(game, "bf1")).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("(c) cards in hand but Deceiver already EXHAUSTED → 'exhaust me' is unpayable → never prompted; hand untouched; no token", async () => {
    const game = await board({ exhausted: true }).build();
    expect(game.state("leblanc").isExhausted).toBe(true);
    await game.p1.move("poro", "bf1");
    await untilPrompt(game);
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false).toBe(false);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toEqual(["fodder0"]);
    expect(game.p1.points()).toBe(1);
    expect(tokensAt(game, "bf1")).toEqual([]);
    // P2 never even got a window to Gust — nothing was ever on the chain.
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.p2.energy()).toBe(1);
  });

  // ── (d) no Gust: the full effect ─────────────────────────────────────────────────────────────
  test("(d) P2 passes instead: a READY token enters bf1 as a copy of Daring Poro — name 'Daring Poro', 2 Might, [Assault] (477.1.b) — with [Temporary] on top; the real Poro is untouched", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    await game.p2.passPriority();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    const toks = tokensAt(game, "bf1");
    expect(toks).toHaveLength(1);
    const s = game.state(toks[0]!);
    expect(s).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 2, name: "Daring Poro", zone: "battlefield-bf1" });
    expect(s.keywords).toEqual(expect.arrayContaining(["Assault", "Temporary"]));
    expect(s.meta.copyOfCardId).toBe("poro");
    // The source keeps its own identity and does NOT pick up Temporary; it stays exhausted from the move.
    expect(game.state("poro")).toMatchObject({ isExhausted: true, might: 2, name: "Daring Poro" });
    expect(game.state("poro").keywords).toEqual(["Assault"]);
    expect(game.p1.units("bf1")).toHaveLength(2);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("(d) contrast with (b): with the real Poro still there next to the Temporary copy, P1 DOES hold bf1 at the next Beginning Phase (token dies, Poro holds → 2 points)", async () => {
    const game = await board().build();
    await conquerAndAccept(game);
    await game.p2.passPriority();
    await game.settle();
    const tok = tokensAt(game, "bf1")[0]!;
    await game.advanceTurn(); // → P2
    await game.p2.endTurn();
    // → P1's Beginning Phase: Temporary kill, then the Hold is scored. P1's hand is empty at that moment
    // (the draw comes later), so Deceiver's Hold trigger cannot be paid and is not offered — see (c).
    await untilPrompt(game);
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.has(tok) ? game.zoneOf(tok) : "gone").toBe("gone");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toEqual(["poro"]);
    expect(game.p1.points()).toBe(2);
    expect(game.state("leblanc").isExhausted).toBe(false);
  });
});
