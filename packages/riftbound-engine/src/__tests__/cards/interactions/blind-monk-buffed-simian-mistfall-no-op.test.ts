/**
 * Interaction: Blind Monk (ogn-257-298) · Legend (Lee Sin) · Calm/Body
 *     "[1], [Exhaust]: Buff a friendly unit."                                          — P1's legend, ready
 *   × Simian Ancestor (sfd-047-221) · Unit · Calm · 5 + [calm] · 5 Might
 *     "When you buff me, ready me."                                                     — P1's, EXHAUSTED, already BUFFED (6)
 *   × Mistfall (ogn-152-298) · Gear · Body · 3
 *     "When you buff a friendly unit, you may pay [body] and exhaust this to ready it." — P1's gear, ready; [body] available
 *
 * Question. P1 pays [1] and exhausts Blind Monk choosing the already-buffed, exhausted Simian Ancestor.
 *   (a) Is the buffed Simian a legal choice at all, and are [1] + exhaust still paid?
 *   (b) Does Simian gain a second counter / any Might on resolution?
 *   (c) Does Simian's "When you buff me" trigger? Does Mistfall's "When you buff a friendly unit" trigger
 *       (may P1 pay [body] to ready it)?
 *   (d) Contrast: the same activation choosing an UNBUFFED exhausted Simian Ancestor.
 *
 * Rules: 426.1.c (a buffed unit can still be CHOSEN for a Buff action but is not Buffed; its second example
 * is literally "When you buff me, ready me" not triggering), 426.1.b.1 / 702.3.a (no second counter),
 * 703 (each buff = +1 Might), 702.2.a (to buff = choose a unit and place a buff on it).
 *
 * Expected: (a) legal; Monk exhausted, [1] paid, nothing refunded. (b) no: exactly 1 buff, 6 Might before
 * and after. (c) neither triggers — Simian stays exhausted, no Mistfall "you may" window, [body] unspent,
 * Mistfall stays ready. (d) 0 → 1 buff, 5 → 6; Simian's own trigger readies it; Mistfall's trigger exists
 * (P1 is asked "you may pay [body]…").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLIND_MONK = "ogn-257-298";
const SIMIAN_ANCESTOR = "sfd-047-221";
const MISTFALL = "ogn-152-298";

/** Buff-counter inventory on a unit: the first buff flag + any cap-lifted extras (rule 702.3). */
function buffCount(game: Game, card: string): number {
  const s = game.state(card);
  return (s.isBuffed ? 1 : 0) + (((s.meta as { extraBuffs?: number }).extraBuffs ?? 0) as number);
}

/** P1's turn; Monk ready; Mistfall ready; 1 energy for the Monk and 1 [body] for Mistfall. */
function board(simian: { buffed: boolean }) {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 1 } })
    .legend(P1, BLIND_MONK, "monk")
    .gear(P1, MISTFALL, "mist")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", SIMIAN_ANCESTOR, "simian", { buffed: simian.buffed, exhausted: true })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe");
}

/** Every distinct decision / chain item seen while draining passively after the activation. */
async function activateMonkOnSimianWatching(game: Game) {
  const decisions: string[] = [];
  const chainSeen = new Set<string>();
  await game.p1.activate("monk", 0, { targets: "simian" });
  for (let i = 0; i < 16; i++) {
    for (const item of game.chain()) {
      chainSeen.add(`${item.cardId}${item.triggered ? ":trigger" : ""}`);
    }
    const d = game.decision();
    if (!d) {
      break;
    }
    decisions.push(`${d.seat}:${d.kind}${d.kind === "action" ? `(${d.context})` : ""}`);
    if (d.kind === "action" && d.context === "main") {
      break;
    }
    if (d.kind !== "action") {
      break; // a real prompt (yes-no / pick) — hand back to the test
    }
    await game.acting().pass();
  }
  return { chainSeen: [...chainSeen], decisions };
}

describe("(a) the already-buffed Simian is a LEGAL choice; the Monk's [1] + [Exhaust] are paid and not refunded (426.1.c)", () => {
  test("setup: Simian is exhausted with exactly one buff (6 Might); Monk and Mistfall ready", async () => {
    const game = await board({ buffed: true }).build();
    expect(game.state("simian")).toMatchObject({ baseMight: 5, isBuffed: true, isExhausted: true, might: 6 });
    expect(buffCount(game, "simian")).toBe(1);
    expect(game.state("monk").isReady).toBe(true);
    expect(game.state("mist").isReady).toBe(true);
  });

  test("the Monk's ability is offered and accepts the buffed Simian as its target (no rejection)", async () => {
    const game = await board({ buffed: true }).build();
    expect(game.p1.can("activate", "monk")).toBe(true);
    const r = await game.p1.try((p) => p.activate("monk", 0, { targets: "simian" }));
    expect(r.ok).toBe(true);
  });

  test("costs are paid on activation: energy 1 → 0, Monk exhausted; after resolution nothing is refunded", async () => {
    const game = await board({ buffed: true }).build();
    await game.p1.activate("monk", 0, { targets: "simian" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("monk").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(b) resolution places NO second counter: Simian stays at exactly 1 buff and 6 Might (426.1.b.1 / 702.3.a / 703)", () => {
  test("buff inventory 1 before and 1 after; Might 6 before and after; no extraBuffs", async () => {
    const game = await board({ buffed: true }).build();
    expect(buffCount(game, "simian")).toBe(1);
    await game.p1.activate("monk", 0, { targets: "simian" });
    await game.settle();
    expect(buffCount(game, "simian")).toBe(1);
    expect(game.state("simian")).toMatchObject({ isBuffed: true, might: 6 });
    expect((game.state("simian").meta as { extraBuffs?: number }).extraBuffs ?? 0).toBe(0);
  });
});

describe("(c) choosing is not buffing: neither Simian's nor Mistfall's 'when you buff' triggers (426.1.c second example)", () => {
  test("Simian's 'When you buff me, ready me' does not fire — Simian stays EXHAUSTED", async () => {
    const game = await board({ buffed: true }).build();
    await game.p1.activate("monk", 0, { targets: "simian" });
    await game.settle();
    expect(game.state("simian").isExhausted).toBe(true);
  });

  test("Mistfall gets no trigger window: P1 is never asked 'you may pay [body]…'; [body] unspent, Mistfall still ready", async () => {
    const game = await board({ buffed: true }).build();
    const seen = await activateMonkOnSimianWatching(game);
    expect(seen.decisions.some((d) => d.endsWith(":yes-no"))).toBe(false);
    expect(seen.chainSeen.filter((c) => c.endsWith(":trigger"))).toEqual([]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.power("body")).toBe(1);
    expect(game.state("mist").isReady).toBe(true);
    expect(game.state("simian").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) contrast — UNBUFFED exhausted Simian: the counter lands, Simian readies itself, Mistfall triggers", () => {
  test("buff inventory 0 → 1 and Might 5 → 6; the Monk's costs are paid the same way", async () => {
    const game = await board({ buffed: false }).script(P1, ["no"]).build();
    expect(game.state("simian")).toMatchObject({ isBuffed: false, isExhausted: true, might: 5 });
    expect(buffCount(game, "simian")).toBe(0);
    await game.p1.activate("monk", 0, { targets: "simian" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("monk").isExhausted).toBe(true);
    await game.settle();
    expect(buffCount(game, "simian")).toBe(1);
    expect(game.state("simian")).toMatchObject({ isBuffed: true, might: 6 });
  });

  test("Simian's own trigger readies it (a real buff was placed)", async () => {
    const game = await board({ buffed: false }).script(P1, ["no"]).build();
    await game.p1.activate("monk", 0, { targets: "simian" });
    await game.settle();
    expect(game.state("simian")).toMatchObject({ isBuffed: true, isReady: true, might: 6 });
  });

  test("Mistfall's trigger EXISTS: P1 is asked 'you may pay [body] and exhaust this'; declining leaves [body] and Mistfall untouched", async () => {
    const game = await board({ buffed: false }).build();
    await game.p1.activate("monk", 0, { targets: "simian" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.p1.power("body")).toBe(1);
    expect(game.state("mist").isReady).toBe(true);
    expect(game.state("simian")).toMatchObject({ isBuffed: true, isReady: true, might: 6 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("…accepting it pays [body] and exhausts Mistfall (the ready is redundant — Simian is already ready, 415.1.c)", async () => {
    const game = await board({ buffed: false }).build();
    await game.p1.activate("monk", 0, { targets: "simian" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.power("body")).toBe(0);
    expect(game.state("mist").isExhausted).toBe(true);
    expect(game.state("simian")).toMatchObject({ isBuffed: true, isReady: true, might: 6 });
    expect(buffCount(game, "simian")).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
