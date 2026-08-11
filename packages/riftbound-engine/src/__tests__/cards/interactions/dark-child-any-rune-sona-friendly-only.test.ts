/**
 * Interaction: two end-of-turn rune readiers on the same board, differing only by the word "friendly".
 *   × Dark Child - Starter (ogs-017-024) · Legend · Fury/Chaos · Annie
 *       "At the end of your turn, ready up to 2 runes."                                    — P1's legend
 *   × Sona, Harmonious (ogn-073-298) · Unit · Calm · 4 · Champion, 4 Might
 *       "At the end of your turn, if I'm at a battlefield, ready up to 4 friendly runes."   — P1, at bf1
 *
 * Board: P1's turn is ending. P1 controls Sona at bf1. P1 has EXACTLY 2 exhausted runes (p1a, p1b);
 * P2 has 3 exhausted (e1, e2, e3) and 1 ready (e4).
 *
 * Questions / expected answers:
 *  (a) Dark Child says "runes" with no qualifier — 355.9.a.1 makes that "a rune on the board" and
 *      355.9.b applies only the restrictions the card actually states, and it states none about
 *      control. So all five exhausted runes (P1's 2 + P2's 3) are legal choices and P1 may ready an
 *      opponent's rune, split however they like. (415.1.b's "cannot be Readied again" is written about
 *      Units; a ready RUNE stays a legal, merely pointless, choice — 415.1.c.)
 *  (b) Sona says "friendly runes" — 740.1.a defines friendly relative to the ability's SOURCE, so only
 *      objects sharing Sona's controller qualify; P2's runes are enemies (740.1.b) and are never
 *      offered. That holds even though P1 has only 2 exhausted runes and 2 of the "up to 4" go unused:
 *      the engine must not backfill the spare picks with enemy runes.
 *  (c) Both say "up to": 355.13 lets the player choose any number including zero, and the ability is
 *      still played/resolved with no targets. Because zero is always a legal choice neither trigger is
 *      ever blocked by 355.8 — with NO exhausted rune on the board at all both still go on the chain
 *      and resolve doing nothing.
 *  (d) "If I'm at a battlefield" is part of Sona's trigger CONDITION — she is the rules' own worked
 *      example (383.2.a.1 / 383.3.e) — so with Sona in P1's BASE the condition is unfulfilled at the
 *      Ending Step and NO Sona trigger is generated. Dark Child is unaffected and still offers all five.
 *
 * Rules: 317.1.a, 355.8, 355.9.a.1, 355.9.b, 355.13, 383.2.a.1, 383.3.e, 415.1.b, 740.1.a, 740.1.b.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARK_CHILD = "ogs-017-024";
const SONA = "ogn-073-298";

/** P1's turn 3. Sona at bf1 (or base), Dark Child as P1's legend. Exhausted runes: P1 2, P2 3 (+1 ready, e4). */
function board(opts: { p1Exhausted?: number; sonaAt?: "base" | "bf1" } = {}) {
  const b = scenario()
    .turn(3)
    .active(P1)
    .legend(P1, DARK_CHILD, "darkChild")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, opts.sonaAt ?? "bf1", SONA, "sona")
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2Home");
  for (let i = 0; i < (opts.p1Exhausted ?? 2); i++) {
    b.rune(P1, "calm", { alias: `p1${"abcdef"[i]}`, exhausted: true });
  }
  return b
    .rune(P2, "fury", { alias: "e1", exhausted: true })
    .rune(P2, "fury", { alias: "e2", exhausted: true })
    .rune(P2, "fury", { alias: "e3", exhausted: true })
    .rune(P2, "fury", { alias: "e4", exhausted: false });
}

/** Build the position and end P1's turn → the Ending Step's 317.1.a triggers are pending / finalizing. */
async function atEndOfTurn(opts: { p1Exhausted?: number; sonaAt?: "base" | "bf1" } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

/** The finalization pick currently in front of P1, if it belongs to `card` (rule 402.2). */
function finPickFor(game: Game, card: string) {
  const d = game.decision();
  return d?.kind === "pick" && d.seat === P1 && d.source?.cardId === card ? d : undefined;
}

/**
 * rule 402.2 — each triggered item names its rune set while it is FINALIZED, before anyone holds
 * priority. Walk the finalization picks until the one raised by `card` is in front of us, declining
 * the other (a legal "up to" answer, 355.13).
 */
async function pickPromptFor(game: Game, card: string) {
  for (let i = 0; i < 4; i++) {
    const hit = finPickFor(game, card);
    if (hit) {
      return hit;
    }
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    await game.p1.decline();
  }
  throw new Error(`no finalization pick raised by ${card}; decision = ${JSON.stringify(game.decision())}`);
}

/** Answer every pending P1 finalization pick from `picks` (`[]` = decline, 355.13). */
async function finalize(game: Game, picks: { darkChild?: readonly string[]; sona?: readonly string[] }): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      return;
    }
    const chosen = d.source?.cardId === "sona" ? picks.sona : d.source?.cardId === "darkChild" ? picks.darkChild : undefined;
    if (chosen === undefined) {
      return;
    }
    await (chosen.length === 0 ? game.p1.decline() : game.p1.pick(...chosen));
  }
}

/**
 * Answer the picks, then take the soft 383.3.d ordering offer so that `top` resolves FIRST, and pass
 * priority around once. The other trigger is still on the chain afterwards, so the Ending Step has not
 * finished and the turn has NOT rolled over to P2 — whose own Beginning Phase would ready every P2 rune
 * and destroy the very observation these tests are about.
 */
async function resolveFirst(game: Game, top: "darkChild" | "sona", picks: { darkChild?: readonly string[]; sona?: readonly string[] }): Promise<void> {
  await finalize(game, picks);
  const order = game.decision();
  if (order?.kind === "order") {
    const keys = order.items.map((it) => it.key);
    const topKey = order.items.find((it) => it.card === top)?.key;
    await game.p1.order(topKey === undefined ? keys : [...keys.filter((k) => k !== topKey), topKey]); // last = top
  }
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.phase()).toBe("ending");
  expect(game.chain().map((c) => c.cardId)).not.toContain(top);
}

const offeredOf = (d: { options: readonly { card?: string; key: string }[] }) => [...new Set(d.options.map((o) => o.card ?? o.key))].sort();

const readyRunes = (game: Game, seat: typeof P1 | typeof P2) => [...game.seat(seat).runes({ ready: true })].sort();

describe("Dark Child ('runes') vs Sona ('friendly runes') — whose runes may be readied at end of turn", () => {
  // ── (a) Dark Child: no control qualifier at all ──────────────────────────────────────────────

  test("(a) 355.9.a.1 / 355.9.b — Dark Child's 'ready up to 2 runes' offers EVERY rune on the board, P2's three exhausted ones included; 'up to 2' means min 0, max 2", async () => {
    const game = await atEndOfTurn();
    const d = await pickPromptFor(game, "darkChild");
    expect(offeredOf(d)).toContain("e1");
    expect(offeredOf(d)).toContain("e2");
    expect(offeredOf(d)).toContain("e3");
    expect(offeredOf(d)).toEqual(["e1", "e2", "e3", "e4", "p1a", "p1b"]); // e4 is ready: legal but pointless (415.1.b/c)
    expect(d).toMatchObject({ allowDecline: true, max: 2, min: 0, timing: "FIN" });
  });

  test("(a) P1 may spend BOTH Dark Child picks on the opponent's runes: e1 and e2 ready, P1's own two stay exhausted", async () => {
    const game = await atEndOfTurn();
    await pickPromptFor(game, "darkChild");
    await resolveFirst(game, "darkChild", { darkChild: ["e1", "e2"], sona: [] });
    expect(readyRunes(game, P2)).toEqual(["e1", "e2", "e4"]);
    expect(game.state("e3").isExhausted).toBe(true);
    expect(readyRunes(game, P1)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) the two picks may be SPLIT across controllers — one of P1's, one of P2's", async () => {
    const game = await atEndOfTurn();
    await pickPromptFor(game, "darkChild");
    await resolveFirst(game, "darkChild", { darkChild: ["p1a", "e3"], sona: [] });
    expect(game.state("p1a").isExhausted).toBe(false);
    expect(game.state("e3").isExhausted).toBe(false);
    expect(game.state("p1b").isExhausted).toBe(true);
    expect(game.state("e1").isExhausted).toBe(true);
  });

  test("(a) 'up to 2' is a hard cap even with five candidates: a third pick is rejected", async () => {
    const game = await atEndOfTurn();
    await pickPromptFor(game, "darkChild");
    expect((await game.p1.try((p) => p.pick("e1", "e2", "e3"))).ok).toBe(false);
  });

  // ── (b) Sona: "friendly" is relative to the ability's source ─────────────────────────────────

  test("(b) 740.1.a / 740.1.b — Sona's 'up to 4 friendly runes' offers ONLY P1's runes; none of P2's four appears", async () => {
    const game = await atEndOfTurn();
    const d = await pickPromptFor(game, "sona");
    expect(offeredOf(d)).toEqual(["p1a", "p1b"]);
    for (const enemy of ["e1", "e2", "e3", "e4"]) {
      expect(offeredOf(d)).not.toContain(enemy);
    }
    expect(d.max).toBeLessThanOrEqual(4);
  });

  test("(b) the two unused picks of 'up to 4' are NOT backfilled with enemy runes: Sona readies p1a+p1b and every P2 rune keeps its status", async () => {
    const game = await atEndOfTurn();
    await resolveFirst(game, "sona", { darkChild: [], sona: ["p1a", "p1b"] });
    expect(readyRunes(game, P1)).toEqual(["p1a", "p1b"]);
    expect(readyRunes(game, P2)).toEqual(["e4"]); // e1–e3 still exhausted
  });

  test("(b) P1 cannot force an enemy rune into Sona's set — naming e1 is rejected outright", async () => {
    const game = await atEndOfTurn();
    await pickPromptFor(game, "sona");
    expect((await game.p1.try((p) => p.pick("e1"))).ok).toBe(false);
    expect(game.state("e1").isExhausted).toBe(true);
  });

  test("(b) with FOUR of P1's own runes exhausted Sona fills all four picks — the cap is real, the restriction is control", async () => {
    const game = await atEndOfTurn({ p1Exhausted: 4 });
    const d = await pickPromptFor(game, "sona");
    expect(offeredOf(d)).toEqual(["p1a", "p1b", "p1c", "p1d"]);
    expect(d.max).toBe(4);
    await resolveFirst(game, "sona", { darkChild: [], sona: ["p1a", "p1b", "p1c", "p1d"] });
    expect(readyRunes(game, P1)).toEqual(["p1a", "p1b", "p1c", "p1d"]);
    expect(readyRunes(game, P2)).toEqual(["e4"]);
  });

  // ── (c) "up to" means zero is a legal answer, and 355.8 never blocks either trigger ──────────

  test("(c) 355.13 — P1 may decline BOTH triggers: each pick is declinable, both items still resolve, nothing readies, and the turn then passes to P2", async () => {
    const game = await atEndOfTurn();
    const d = await pickPromptFor(game, "darkChild");
    expect(d.allowDecline).toBe(true);
    await resolveFirst(game, "darkChild", { darkChild: [], sona: [] });
    expect(readyRunes(game, P1)).toEqual([]);
    expect(readyRunes(game, P2)).toEqual(["e4"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("(c) 355.8 never blocks them — with NO exhausted rune anywhere on the board both triggers still go on the chain (355.13) and resolve doing nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .legend(P1, DARK_CHILD, "darkChild")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SONA, "sona")
      .rune(P1, "calm", { alias: "p1a" })
      .rune(P2, "fury", { alias: "e1" })
      .build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["darkChild", "sona"]);
    expect(game.chain().every((c) => c.triggered)).toBe(true);
    // Nothing to actually ready — both sets are answered with zero picks (355.13) and both items resolve.
    await finalize(game, { darkChild: [], sona: [] });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("p1a").isExhausted).toBe(false);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) Sona's intervening-if ───────────────────────────────────────────────────────────────

  test("(d) 383.2.a.1 / 383.3.e — Sona in P1's BASE: her condition is unfulfilled at the Ending Step, so NOTHING of hers goes on the chain; only Dark Child triggers", async () => {
    const game = await atEndOfTurn({ sonaAt: "base" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["darkChild"]);
    expect(game.decision()?.kind).not.toBe("order"); // a single trigger — no 383.3.d ordering offer
  });

  test("(d) Dark Child is unaffected by Sona's failed condition — still every rune on the board, and readying one of P2's works", async () => {
    const game = await atEndOfTurn({ sonaAt: "base" });
    const d = await pickPromptFor(game, "darkChild");
    expect(offeredOf(d)).toEqual(["e1", "e2", "e3", "e4", "p1a", "p1b"]);
    await game.p1.pick("e1", "p1a"); // 402.2 — the set is named on the item now, before it resolves
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darkChild", controller: P1, triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual(expect.arrayContaining(["e1", "p1a"]));
    await game.acting().passPriority();
    await game.acting().passPriority(); // Dark Child resolves; the Ending Step is now done
    expect(game.state("p1a").isExhausted).toBe(false);
    expect(game.state("p1b").isExhausted).toBe(true); // not chosen, and P2's Awaken never touches P1's runes
    expect(game.violations()).toEqual([]);
  });
});
