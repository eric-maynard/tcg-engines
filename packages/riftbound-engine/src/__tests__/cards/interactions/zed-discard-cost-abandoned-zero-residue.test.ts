/**
 * Interaction: Zed, From the Shadows (ven-023a-166) · Champion Unit · Fury · 4 + [fury] · 4 Might
 *     "You may discard 1 as an additional cost to play me. When you play me, if you paid the additional
 *      cost, play a 0 [Might] Shadow Clone unit token."
 *   × Flame Chompers (ogn-006-298) · Unit · Fury · 3 · 3 Might — "When you discard me, you may pay [fury] to play me."
 *   × Jinx, Rebel (ogn-202-298) · Champion Unit · Chaos · 5 · 5 Might
 *     "When you discard one or more cards, ready me and give me +1 [Might] this turn."
 *
 * Question: P1's turn. Hand: Zed + Flame Chompers (+ a filler). P1 controls an EXHAUSTED Jinx, Rebel and bf1.
 * P1's pool is short of Zed's cost by exactly what one READY rune would add.
 *   (a) Abandoned line: P1 opens the Zed play (destination base, elects the discard, is to designate
 *       Chompers) and abandons before the cost is met. Required afterwards: Zed and Chompers in hand, Jinx
 *       exhausted / no +1, no Chompers "pay [fury]?" prompt, no Shadow Clone, rune/pool untouched, chain
 *       empty, P2's view identical (never saw Chompers' face), state hash identical, no RNG consumed.
 *   (b) Concede line: P2 concedes while P1's prompt is open — result and residue?
 *   (c) Completed line: P1 taps the rune and finishes. Exact order of discard / payment / Zed entering /
 *       Jinx trigger / Chompers trigger (when is its [fury] asked) / Zed's "if you paid" trigger and the
 *       Shadow Clone; who orders the triggers; does P2 get priority anywhere in there?
 *
 * Rules: 358.5 (an incomplete play is cancelled and undone), 354.4 / 422.1.b (triggers raised mid-play wait),
 * 355.1.a, 356.2.b.1, 357.2, 422.1, 337.2 / 143.4 (a permanent resolves at once, enters exhausted — no
 * priority against it), 383.3.d (controller orders simultaneous triggers), 383.3.b / 204.3.a (Chompers'
 * "pay [fury] TO play me" is a cost decided and paid at FINALIZATION), 383.3.a.2, 650 / 651 (concede at any
 * time; last player standing wins at once).
 *
 * DESIGN (DESIGN.md §Paying costs — deliberate deviation from 357.1.a): payment is MANUAL and pool-only. A
 * play is OFFERED only when the current pool covers it (ready runes are never credited), and a submitted
 * play is ONE atomic move (elect + pay + discard + enter) — there is no engine state "mid-payment" to abandon.
 * So: with the short pool Zed is simply not offered (nothing to undo); the abandonable point is the play
 * DIALOG (destination / cost election / discard designation) before submission, which by construction has
 * executed nothing; and a raw move naming an incomplete cost bundle is refused with the state untouched.
 * Those three are the engine's form of the (a) zero-residue guarantee, and (b) is exercised both in that
 * dialog and at the first real prompt of the completed line.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZED = "ven-023a-166";
const FLAME_CHOMPERS = "ogn-006-298";
const JINX_REBEL = "ogn-202-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — a second discard candidate so the designation is a real choice

/**
 * P1's turn 2, open main phase. P1: {3 energy, fury 2} + ONE ready Fury rune r1 (Zed needs 4 + [fury]);
 * bf1 held by a 2-Might Holder; Jinx, Rebel EXHAUSTED in base; hand = Zed, Chompers, filler. P2: nothing.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 2 } })
    .rune(P1, "fury", { alias: "r1" })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", JINX_REBEL, "jinx", { exhausted: true })
    .hand(P1, ZED, "zed")
    .hand(P1, FLAME_CHOMPERS, "fc")
    .hand(P1, FILLER, "filler");
}

const clones = (game: Game): string[] => [...game.p1.base(), ...game.p1.units("bf1")].filter((c) => game.state(c).isToken && game.state(c).name === "Shadow Clone");

/** P2's redacted observation minus the sequence counter (for before/after identity). */
const p2Sees = (game: Game): string => JSON.stringify({ ...game.p2.view(), seq: 0 });

const describeDecision = (d: Decision | null): string =>
  d ? `${d.seat}:${d.kind}${d.kind === "action" ? `(${d.context})` : ""}@${d.source?.cardId ?? "-"}` : "none";

/** Everything (a)/(b) require to be pristine, checked in one place. */
function expectNoResidue(game: Game, o: { runeTapped: boolean }): void {
  expect(game.zoneOf("zed")).toBe("hand");
  expect(game.zoneOf("fc")).toBe("hand");
  expect(game.zoneOf("filler")).toBe("hand");
  expect(game.p1.trash()).toEqual([]);
  expect(game.state("jinx")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 0 });
  expect(clones(game)).toEqual([]);
  expect(game.chain()).toEqual([]);
  expect(game.state("r1").isExhausted).toBe(o.runeTapped);
  expect(game.p1.resources()).toEqual({ energy: o.runeTapped ? 4 : 3, power: { fury: 2 } });
}

/** (c) rune tapped, Zed played to base electing the discard and designating Chompers — one atomic move. */
async function completedPlay(): Promise<Game> {
  const game = await board().build();
  await game.p1.tapRune("r1");
  await game.p1.play("zed", { discard: "fc", payOptional: true, to: "base" });
  return game;
}

describe("Zed's optional discard × Flame Chompers × Jinx, Rebel — abandoned / conceded / completed", () => {
  // ---- (a) abandoned: nothing may leak or stick --------------------------------------------------------------------

  // DESIGN (§Paying costs): pool-only affordability — the ready rune is not credited, so the play is not even offered.
  test("(a) short pool {3, fury 2} with a READY rune: Zed is not offered at all (with or without the discard) — a raw attempt is refused and the complete position hash is unchanged", async () => {
    const game = await board().build();
    const h0 = game.snapshotHash();
    expect(game.p1.runes({ ready: true })).toEqual(["r1"]);
    expect(game.p1.can("play", "zed")).toBe(false);
    expect(game.p1.option("playUnit", "zed")).toBeUndefined();
    const raw = await game.p1.try((p) => p.do("playUnit", { cardId: "zed", discardId: "fc", location: "base", paidAdditionalCost: true }));
    expect(raw.ok).toBe(false);
    expect(game.snapshotHash()).toBe(h0);
    expectNoResidue(game, { runeTapped: false });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) after tapping r1 the play IS offered: destinations {base, bf1} × {plain, discard fc | filler}; the discard election never discounts the 4 + [fury]", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    const opt = game.p1.option("playUnit", "zed");
    expect(opt).toBeDefined();
    expect([...(opt?.fields.find((f) => f.name === "location")?.options ?? [])].sort()).toEqual(["base", "battlefield-bf1"]);
    expect([...(opt?.fields.find((f) => f.name === "discardId")?.options ?? [])].filter((x) => x !== null).sort()).toEqual(["fc", "filler"]);
    for (const v of opt?.variants ?? []) {
      expect((v.params as { quote?: { energy: number; power: Record<string, number> } }).quote).toMatchObject({ energy: 4, power: { fury: 1 } });
    }
  });

  test("(a) abandoning the play DIALOG (base chosen, discard elected, Chompers not yet designated): nothing was executed while it was open — Zed/Chompers in hand, no prompt for P2, P2 cannot answer it, hash unchanged — and declining it restores the exact menu; P2's view before ≡ after; no RNG consumed (358.5)", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    const h0 = game.snapshotHash(); // covers zones, metas, flow, RNG cursor, trackers
    const menu0 = JSON.stringify(game.p1.legal().map((o) => o.key));
    const p2Before = p2Sees(game);

    const opened = await game.act(P1, { args: { payOptional: true, to: "base" }, key: "playUnit:zed", kind: "action" });
    expect(opened.ok).toBe(true);
    expect(opened.ok && opened.executed).toEqual([]); // provisional: nothing reached the engine
    expect(opened.ok && opened.followUp).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "zed" } });
    expect(((opened.ok && opened.followUp) as { options: { key: string }[] }).options.map((x) => x.key).sort()).toEqual(["fc", "filler"]);
    expect(game.snapshotHash()).toBe(h0);
    expect(game.zoneOf("zed")).toBe("hand");
    // P2 sees at most that P1 is choosing something for a Zed play — never Chompers' face.
    const glimpse = JSON.stringify(game.p2.view().decision);
    expect(glimpse).not.toContain("fc");
    expect(glimpse).not.toContain("Chompers");
    const intruder = await game.p2.try((p) => p.answer("fc"));
    expect(intruder.ok).toBe(false);
    expect((intruder as { error: { code: string } }).error.code).toBe("NOT_YOUR_DECISION");

    const abandoned = await game.act(P1, { kind: "decline" });
    expect(abandoned.ok).toBe(true);
    expect(abandoned.ok && abandoned.executed).toEqual([]);
    expect(game.snapshotHash()).toBe(h0);
    expect(JSON.stringify(game.p1.legal().map((o) => o.key))).toBe(menu0);
    expect(p2Sees(game)).toBe(p2Before);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expectNoResidue(game, { runeTapped: true });
    // and no Chompers / Jinx prompt ever surfaces afterwards
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(describeDecision(game.decision())).toBe("player-1:action(main)@-");
  });

  test("(a) a SUBMITTED move that elects the discard but names no card to discard is refused outright — state untouched, no half-paid play (358.5)", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    const h0 = game.snapshotHash();
    const raw = await game.p1.try((p) => p.do("playUnit", { cardId: "zed", location: "base", paidAdditionalCost: true }));
    expect(raw.ok).toBe(false);
    expect(game.snapshotHash()).toBe(h0);
    expectNoResidue(game, { runeTapped: true });
  });

  // ---- (b) concede ------------------------------------------------------------------------------------------------------

  test("(b) P2 concedes while P1's play dialog is open: the game ends at once with P1 the winner (650/651); the dangling play is dropped with zero residue — no discard, no trigger 'on the way out' — and nothing is answerable any more", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    const opened = await game.act(P1, { args: { payOptional: true, to: "base" }, key: "playUnit:zed", kind: "action" });
    expect(opened.ok && opened.followUp?.kind).toBe("pick");
    expect(game.p2.can("concede")).toBe(true);
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.decision()).toBeNull();
    expectNoResidue(game, { runeTapped: true });
    const late = await game.act(P1, { keys: ["fc"], kind: "pick" });
    expect(late.ok).toBe(false);
    expect((late as { error: { code: string } }).error.code).toBe("GAME_OVER");
  });

  test("(b) P2 concedes at the first real prompt of the COMPLETED play (P1's 'Pay [fury]…?' for Chompers): P1 wins immediately; what was committed stays (Zed in base, Chompers in trash, 4 + [fury] spent) but nothing further resolves — Jinx stays exhausted at 5, no Shadow Clone, Chompers not played, no prompt left", async () => {
    const game = await completedPlay();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fc" } });
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.decision()).toBeNull();
    expect(game.zoneOf("zed")).toBe("base");
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, might: 5 });
    expect(clones(game)).toEqual([]);
    const late = await game.p1.try((p) => p.yes());
    expect(late.ok).toBe(false);
  });

  // ---- (c) completed: the exact order --------------------------------------------------------------------------------

  test("(c) the play is ONE step for the engine: r1 tapped (4 energy), then in a single move Chompers is discarded hand→trash (422.1), 4 + [fury] are paid, and Zed is finalized and enters the base EXHAUSTED (337.2, 143.4) — P2 had no priority against the unit", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
    const r = await game.p1.play("zed", { discard: "fc", payOptional: true, to: "base" });
    expect(r.executed.map((m) => m.moveId)).toEqual(["playUnit"]);
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.zoneOf("filler")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.state("zed")).toMatchObject({ controller: P1, isExhausted: true, location: "base", might: 4 });
    expect(game.chain().some((i) => i.cardId === "zed" && !i.triggered)).toBe(false); // Zed himself never sat on the chain for P2
  });

  test("(c) only AFTER Zed has entered are the pending triggers finalized: chain = [Jinx (discard), Chompers (discard), Zed 'if you paid'] — all P1's; the very first question is Chompers' finalization cost 'Pay [fury]…?' put to P1 (383.3.b / 204.3.a), before any priority", async () => {
    const game = await completedPlay();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "jinx", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "fc", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "zed", controller: P1, triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "fc" }, timing: "FIN" });
    expect(game.state("jinx").isExhausted).toBe(true); // nothing has resolved yet
    expect(clones(game)).toEqual([]);
  });

  test("(c) declining Chompers' cost removes that trigger (383.3.a.2): Chompers stays in the trash, the fury is kept; Zed's token and Jinx's ready/+1 still resolve", async () => {
    const game = await completedPlay();
    await game.p1.no();
    expect(game.chain().map((i) => i.cardId)).toEqual(["jinx", "zed"]);
    await game.settle(); // passes; Shadow Clone destination handed back
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(clones(game)).toHaveLength(1);
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 6 });
  });

  test("(c) paying it: P1 pays the [fury] AT FINALIZATION (fury 1 → 0 before anything resolves); then P1 is softly offered the order of the two discard-event triggers (383.3.d) with Zed's play trigger above them; then P1 and P2 each get priority (Reactions only) before anything resolves", async () => {
    const game = await completedPlay();
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("fc")).toBe("trash"); // paid, not yet played
    const order = game.decision();
    expect(order).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    expect((order as { items: { card?: string }[] }).items.map((i) => i.card).sort()).toEqual(["fc", "jinx"]);
    await game.acceptTriggerOrder();
    expect(game.chain().map((i) => i.cardId)).toEqual(["jinx", "fc", "zed"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.legal().map((o) => o.moveId).sort()).toEqual(["concede", "passChainPriority"]);
    expect(clones(game)).toEqual([]); // still nothing resolved
    expect(game.state("jinx").isExhausted).toBe(true);
  });

  test("(c) resolution is LIFO: Zed's trigger → Shadow Clone (P1 picks base | bf1; 0-Might token, exhausted); Chompers → played from the trash for the fury alone (destination asked, enters exhausted, no energy); Jinx → readied, 5 + 1 = 6. Final: pool 0/0, hand = filler only, trash empty", async () => {
    const game = await completedPlay();
    await game.p1.yes();
    const seen: string[] = [];
    for (let i = 0; i < 24; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      seen.push(describeDecision(d));
      if (d.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
        await game.p1.pick(d.source?.cardId === "fc" ? "battlefield-bf1" : "base");
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        throw new Error(`unexpected decision ${describeDecision(d)} "${d.prompt}"`);
      }
    }
    // Zed's item (top) resolved first, then Chompers', then Jinx's — each behind a P1/P2 priority round.
    const picks = seen.filter((s) => s.startsWith("player-1:pick"));
    expect(picks[0]).toContain("token-shadow-clone"); // the clone's destination came before …
    expect(picks[1]).toBe("player-1:pick@fc"); // … Chompers' destination
    expect(seen.filter((s) => s === "player-2:action(chain)@zed" || s === "player-2:action(chain)@fc" || s === "player-2:action(chain)@jinx")).toHaveLength(3);
    const [tok] = clones(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, location: "base", might: 0 });
    expect(game.state("fc")).toMatchObject({ controller: P1, isExhausted: true, location: "bf1", zone: "battlefield-bf1" });
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 6, mightModifier: 1 });
    expect(game.state("zed")).toMatchObject({ isExhausted: true, location: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p1.hand()).toEqual(["filler"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) contrast proves (a)/(b): every one of those effects — Chompers in trash/on board, fury spent, Jinx ready +1, a Shadow Clone — is absent after the abandoned dialog", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    await game.act(P1, { args: { payOptional: true, to: "base" }, key: "playUnit:zed", kind: "action" });
    await game.act(P1, { kind: "decline" });
    await game.settle();
    expectNoResidue(game, { runeTapped: true });
    expect(game.p2.view().decision).toMatchObject({ kind: "action", seat: P1 }); // P2 just sees P1's ordinary turn
  });
});
