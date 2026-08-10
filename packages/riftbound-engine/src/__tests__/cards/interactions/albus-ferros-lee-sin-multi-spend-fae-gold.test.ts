/**
 * Interaction: Albus Ferros (ogn-230-298) · Unit · Order · 4 · 3 Might
 *     "When you play me, spend any number of buffs. For each buff spent, channel 1 rune exhausted."
 *   × Lee Sin, Ascetic (ogn-078-298) · Champion Unit · Calm · 5 Might
 *     "[Shield] … [Exhaust]: Buff me. I can have any number of buffs."
 *   × Fae Dragon (sfd-101-221) · Unit · Body · 7 Might
 *     "… When you spend a buff, play a Gold gear token exhausted."
 *
 * Question: P1 controls Lee Sin with 3 Buff counters (8 Might) and Fae Dragon; P2 controls a buffed unit.
 * P1 plays Albus Ferros.
 *   (a) Is the spend a COST (paid on activation) or an instruction resolved on the chain?
 *   (b) May P1 spend 2 of Lee Sin's 3 counters and keep 1? May P1 include P2's unit's buff?
 *   (c) P1 spends all 3 from Lee Sin: runes channeled, Gold tokens from Fae Dragon (per counter or per
 *       batch), Lee Sin's Might / 'buffed' status afterwards?
 *   (d) P1 spends 0 — anything happen?
 *
 * Rules: 205 / 355.10.c.1 (no "[do X] to [do Y]" linkage → not a cost, an instruction on resolution),
 * 702.2.b (spending a buff removes a SINGLE Buff counter), 702.2.b.2 / 745.2 (only counters on objects you
 * control), 745 / 745.1 (spend = remove that many counters), 747 (removed counters cease to exist), 703
 * (each Buff is +1 Might individually).
 *
 * Expected: (a) trigger goes on the chain, P2 gets priority, no buff removed yet. (b) any number 0–3 from
 * Lee Sin — spending 2 leaves 1 (6 Might, still buffed); P2's buff is never offered. (c) 3 counters removed
 * → 3 runes channeled exhausted; Fae Dragon sees three separate spends → three exhausted Gold gear tokens;
 * Lee Sin 8 → 5 Might, not buffed. (d) spend 0 is legal: nothing channeled, no Gold, Lee Sin unchanged.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALBUS = "ogn-230-298";
const LEE_SIN = "ogn-078-298";
const FAE_DRAGON = "sfd-101-221";

type Pick = Extract<Decision, { kind: "pick" }>;

function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", LEE_SIN, "lee", { buffed: true, extraBuffs: 2 })
    .unit(P1, "base", FAE_DRAGON, "fae")
    .unit(P2, "base", { might: 2, name: "Enemy Buffed" }, "theirs", { buffed: true })
    .hand(P1, ALBUS, "albus");
}

const golds = (game: Game, seat: "p1" | "p2") =>
  [...game[seat].gear(), ...game[seat].base()].filter((id, i, a) => a.indexOf(id) === i && game.state(id).isToken && game.state(id).name === "Gold");

/** Play Albus and pass priority round so his play trigger starts resolving; return the spend prompt. */
async function playAlbusToPrompt(game: Game): Promise<Pick> {
  await game.p1.play("albus");
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as Pick;
}

/** Drain the chain (Fae Dragon Gold triggers etc.) back to P1's open Main Phase. */
async function finish(game: Game): Promise<void> {
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

describe("Albus Ferros × Lee Sin (3 buffs) × Fae Dragon — multi-counter spend, per-spend Gold triggers", () => {
  test("setup: Lee Sin carries 3 Buff counters → 5 + 3 = 8 Might and is 'buffed' (703); P2's unit is buffed (3)", async () => {
    const game = await board().build();
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 8 });
    expect(game.state("theirs")).toMatchObject({ controller: P2, isBuffed: true, might: 3 });
    expect(golds(game, "p1")).toEqual([]);
  });

  test("(a) not a cost: playing Albus pays only [4]; the spend is inside his play TRIGGER on the chain — P2 gets priority and no buff has been removed yet (205, 355.10.c.1)", async () => {
    const game = await board().build();
    await game.p1.play("albus");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("albus")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "albus", controller: P1, triggered: true })]);
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 8 });
    expect(game.p1.runes()).toHaveLength(0);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // P2 may respond before any counter is touched
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 8 });
  });

  test("(b) the resolution prompt never offers P2's buffed unit (702.2.b.2, 745.2) and may be answered with nothing (min 0 / decline)", async () => {
    const game = await board().build();
    const d = await playAlbusToPrompt(game);
    const offered = d.options.map((o) => o.card ?? o.key);
    expect(offered).not.toContain("theirs");
    expect(offered.some((k) => String(k).startsWith("lee"))).toBe(true);
    expect(d.allowDecline || d.min === 0).toBe(true);
  });

  test("(b) each Buff on Lee Sin is a separate counter (702.2.b) — the prompt must let P1 spend exactly 2 of his 3, leaving Lee Sin buffed at 6 Might with 2 runes channeled", async () => {
    // Expected: a way to name a COUNT of Lee Sin's counters (max ≥ 3 over Lee Sin, or per-counter options) →
    // spend 2: Lee Sin 8 → 6, still buffed, pool +2 exhausted runes. Actual: the prompt is one option per
    // buffed UNIT (max 1 here), so "2 of 3" cannot be expressed at all.
    const game = await board().build();
    const d = await playAlbusToPrompt(game);
    const leeOptions = d.options.filter((o) => (o.card ?? o.key).toString().startsWith("lee"));
    expect(Math.min(d.max, Math.max(leeOptions.length, d.max))).toBeGreaterThanOrEqual(3);
    // Spend two counters: either two per-counter options or Lee Sin twice.
    const keys = leeOptions.length >= 2 ? leeOptions.slice(0, 2).map((o) => o.key) : ["lee", "lee"];
    await game.p1.pick(...keys);
    await finish(game);
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 6 });
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
  });

  test("(c) spending ALL of Lee Sin's buffs removes 3 counters → 'for each buff spent' channels 3 runes exhausted (702.2.b, 745.1)", async () => {
    // Expected: 3 counters spent → rune pool +3, all exhausted, rune deck −3. Actual: picking Lee Sin spends
    // "his buff" as ONE spend → only 1 rune is channeled.
    const game = await board().build();
    const deck0 = game.p1.runeDeck().length;
    const d = await playAlbusToPrompt(game);
    const leeKeys = d.options.filter((o) => (o.card ?? o.key).toString().startsWith("lee")).map((o) => o.key);
    await game.p1.pick(...leeKeys); // every Lee Sin counter on offer
    await finish(game);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: false })).toHaveLength(3);
    expect(game.p1.runeDeck()).toHaveLength(deck0 - 3);
    expect(game.p1.energy()).toBe(0);
  });

  test("(c) Lee Sin after all 3 are spent: 8 → 5 Might and no longer 'buffed'; the counters cease to exist (703, 747)", async () => {
    // Expected: no Buff counters left → printed 5, isBuffed false. Actual: the spend clears the `buffed` flag but
    // leaves the two stacked counters behind → Lee Sin reads 7 Might while "not buffed".
    const game = await board().build();
    const d = await playAlbusToPrompt(game);
    const leeKeys = d.options.filter((o) => (o.card ?? o.key).toString().startsWith("lee")).map((o) => o.key);
    await game.p1.pick(...leeKeys);
    await finish(game);
    expect(game.state("lee")).toMatchObject({ isBuffed: false, might: 5 });
    expect(game.state("theirs")).toMatchObject({ isBuffed: true, might: 3 }); // untouched
  });

  test("(c) Fae Dragon sees three distinct spend events → three triggers → THREE exhausted Gold gear tokens for P1 (702.2.b: one counter per spend)", async () => {
    // Expected: 3 Gold tokens, each exhausted, all P1's; none for P2. Actual: one spend event → one Gold.
    const game = await board().build();
    const d = await playAlbusToPrompt(game);
    const leeKeys = d.options.filter((o) => (o.card ?? o.key).toString().startsWith("lee")).map((o) => o.key);
    await game.p1.pick(...leeKeys);
    await finish(game);
    const g = golds(game, "p1");
    expect(g).toHaveLength(3);
    for (const id of g) {
      expect(game.state(id)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true });
    }
    expect(golds(game, "p2")).toEqual([]);
  });

  test("(c, engine today) picking Lee Sin spends from him: at least one exhausted rune is channeled, at least one exhausted Gold token is played for P1, and P2's buff is untouched", async () => {
    const game = await board().build();
    const d = await playAlbusToPrompt(game);
    const leeKeys = d.options.filter((o) => (o.card ?? o.key).toString().startsWith("lee")).map((o) => o.key);
    expect(leeKeys.length).toBeGreaterThanOrEqual(1);
    await game.p1.pick(...leeKeys);
    await finish(game);
    expect(game.p1.runes({ ready: false }).length).toBeGreaterThanOrEqual(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    const g = golds(game, "p1");
    expect(g.length).toBeGreaterThanOrEqual(1);
    expect(game.state(g[0] as string)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true });
    expect(golds(game, "p2")).toEqual([]);
    expect(game.state("theirs")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("lee").might).toBeLessThan(8);
  });

  test("(d) spending 0 is legal ('any number'): decline → nothing channeled, Fae Dragon does not trigger (no Gold), Lee Sin stays at 3 counters / 8 Might, Albus on the board", async () => {
    const game = await board().build();
    await playAlbusToPrompt(game);
    await game.p1.decline();
    await finish(game);
    expect(game.p1.runes()).toHaveLength(0);
    expect(golds(game, "p1")).toEqual([]);
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 8 });
    expect(game.state("theirs")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.zoneOf("albus")).toBe("base");
    expect(game.state("albus").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
