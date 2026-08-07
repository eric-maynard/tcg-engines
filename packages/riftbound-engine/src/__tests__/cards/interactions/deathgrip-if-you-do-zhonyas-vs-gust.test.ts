/**
 * Interaction: Deathgrip (sfd-163-221) · Spell · Order · 2 · Reaction
 *     "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this
 *      turn. Draw 1."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · Reaction
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Question: P1 plays Deathgrip choosing its own 3-Might V (at bf1) to kill and friendly W to pump.
 *   (a) P1 also controls a face-up Zhonya's Hourglass. Does W get +3? Does P1 draw?
 *   (b) No Zhonya's, but P2 responds with Gust returning V to P1's hand. +3 from last-known Might? Draw?
 *   (c) Baseline with neither.
 *
 * Rules: 359.3.e.14.b (Deathgrip is the CR's own example: "If you do" references the kill ACTION, so a
 * replaced death gives nothing), 370.1.a.1 (a death replaced by Zhonya's = the kill did not occur; the
 * replacement has no "may" → mandatory), 359.3.e.5 / 359.3.e.11 ("Draw 1" is an independent instruction
 * and is still followed), 359.3.e.12 (V in hand is an illegal target: the kill is ignored and V's Might
 * reads null), 359.3.e.14.a (earlier linked instruction ignored → later one ignored), 359.3.e.13
 * (baseline: look back at V's Might as it left the board).
 *
 * Expected: (a) Zhonya's killed instead; V healed, exhausted, recalled to base; W gets NOTHING; P1 draws 1;
 * no opt-out prompt. (b) Gust resolves first, V → P1's hand; kill ignored, W gets nothing, P1 still draws
 * 1; Deathgrip → trash and still counts as played. (c) V killed, W +3 this turn (5), P1 draws 1.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const ZHONYAS = "ogn-077-298";
const GUST = "ogn-169-298";

/** P1's turn. V (3 Might, 1 damage) at bf1; W (2) and W2 (1) in P1's base; P2 holds Gust with 1 energy. */
function board(opts: { zhonyas: boolean }) {
  const s = scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { energyCost: 2, might: 3, name: "Victim V" }, "V", { damage: 1 })
    .unit(P1, "base", { might: 2, name: "Recipient W" }, "W")
    .unit(P1, "base", { might: 1, name: "Other Friendly W2" }, "W2")
    .unit(P2, "base", { might: 2, name: "Enemy E" }, "E")
    .hand(P1, DEATHGRIP, "grip")
    .hand(P2, GUST, "gust");
  return opts.zhonyas ? s.gear(P1, ZHONYAS, "zh") : s;
}

type Logged = Pick<Decision, "kind" | "seat" | "prompt">;

/**
 * Drain the chain. If Deathgrip asks (on resolution) which friendly unit receives the +Might, answer W.
 * Returns every non-priority prompt seen on the way.
 */
async function resolveAll(game: Game): Promise<Logged[]> {
  const log: Logged[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      return log;
    }
    const d = game.decision() as Decision;
    log.push({ kind: d.kind, prompt: d.prompt, seat: d.seat });
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("W");
    } else {
      throw new Error(`unexpected decision: ${JSON.stringify(d)}`);
    }
  }
  return log;
}

/** (b): P1 casts Deathgrip on V, passes; P2 answers with Gust on V; everything resolves. */
async function gripThenGust(): Promise<{ game: Game; log: Logged[]; p1Hand0: number }> {
  const game = await board({ zhonyas: false }).build();
  const p1Hand0 = game.p1.hand().length;
  await game.p1.cast("grip", { targets: "V" });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("gust", { targets: "V" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["grip", "gust"]);
  const log = await resolveAll(game);
  return { game, log, p1Hand0 };
}

describe("Deathgrip 'If you do' × Zhonya's Hourglass (replaced kill) × Gust (target gone)", () => {
  test("setup: Deathgrip's play-time target is the FRIENDLY unit to kill — V, W, W2 offered, the enemy E is not; costs 2", async () => {
    const game = await board({ zhonyas: false }).build();
    const field = game.p1.option("cast", "grip")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
    expect(offered).toEqual(["V", "W", "W2"]);
    await expect(game.p1.cast("grip", { targets: "E" })).rejects.toThrow();
    await game.p1.cast("grip", { targets: "V" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((i) => i.cardId)).toEqual(["grip"]);
  });

  // ---- (c) baseline ---------------------------------------------------------------------------------

  test("(c) baseline: V is killed → P1's trash; W (chosen on resolution) gets +3 = V's Might as it left (359.3.e.13) → 5 this turn; W2 unchanged", async () => {
    const game = await board({ zhonyas: false }).build();
    await game.p1.cast("grip", { targets: "V" });
    await resolveAll(game);
    expect(game.zoneOf("V")).toBe("trash");
    expect(game.p1.trash()).toContain("V");
    expect(game.state("W").might).toBe(5);
    expect(game.state("W").mightModifier).toBe(3);
    expect(game.state("W2").might).toBe(1);
    expect(game.zoneOf("grip")).toBe("trash");
  });

  test("(c) baseline: P1 draws 1 (hand −Deathgrip +1 draw, deck −1) and the +3 lapses at end of turn", async () => {
    const game = await board({ zhonyas: false }).build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.cast("grip", { targets: "V" });
    await resolveAll(game);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    await game.advanceTurn();
    expect(game.state("W").might).toBe(2);
  });

  // ---- (a) Zhonya's replaces the kill ------------------------------------------------------------------

  test("(a) with Zhonya's: the kill on V is replaced — Hourglass → trash; V stays on the board in base, healed (0 damage) and exhausted (370.1.a.1)", async () => {
    const game = await board({ zhonyas: true }).build();
    expect(game.state("V").damage).toBe(1);
    await game.p1.cast("grip", { targets: "V" });
    await resolveAll(game);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("V")).toBe("base");
    expect(game.p1.units("base")).toContain("V");
    expect(game.state("V").damage).toBe(0);
    expect(game.state("V").isExhausted).toBe(true);
    expect([...game.p1.trash()].sort()).toEqual(["grip", "zh"]); // only the Hourglass died (+ the spent spell)
  });

  test("(a) 'If you do' — the kill was replaced, so NO unit gets +Might: W and W2 keep their printed Might, V too (359.3.e.14.b)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("grip", { targets: "V" });
    await resolveAll(game); // answers a recipient prompt with W if one is (spuriously) raised
    expect(game.state("W").might).toBe(2);
    expect(game.state("W").mightModifier).toBe(0);
    expect(game.state("W2").might).toBe(1);
    expect(game.state("V").might).toBe(3);
  });

  // Expected: the linked instruction does not execute at all (359.3.e.14.a/b), so P1 is not asked to
  // choose "another friendly unit" — exactly as in the Gust case below, where no prompt appears.
  // Actual: the engine still raises "Choose a target for Deathgrip" for the recipient, then gives +0.
  test("(a) with the kill replaced, no recipient prompt is raised for the non-executing 'if you do' instruction (359.3.e.14.b)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("grip", { targets: "V" });
    const log = await resolveAll(game);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(log.filter((l) => l.kind === "pick")).toEqual([]);
  });

  test("(a) 'Draw 1' is independent of the kill — P1 still draws exactly 1 (359.3.e.5 / e.11)", async () => {
    const game = await board({ zhonyas: true }).build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.cast("grip", { targets: "V" });
    await resolveAll(game);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.zoneOf("grip")).toBe("trash");
  });

  test("(a) Zhonya's is mandatory ('would die … instead', no 'may'): P1 gets no yes/no to decline it and fish for the pump", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("grip", { targets: "V" });
    const log = await resolveAll(game);
    expect(log.filter((l) => l.kind === "yes-no")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("zh")).toBe("trash");
  });

  // ---- (b) Gust bounces V in response ---------------------------------------------------------------------

  test("(b) P2 may respond to Deathgrip with Gust on V (3 Might, at a battlefield); Gust resolves first and V returns to its owner P1's hand", async () => {
    const { game } = await gripThenGust();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("V")).toBe("hand");
    expect(game.p1.hand()).toContain("V");
    expect(game.p2.hand()).not.toContain("V");
    expect(game.p2.energy()).toBe(0);
  });

  test("(b) V in hand is an illegal target: it is not killed (stays in hand, not in trash) and its damage is gone as a new object (359.3.e.12, 124.1)", async () => {
    const { game } = await gripThenGust();
    expect(game.zoneOf("V")).toBe("hand");
    expect(game.p1.trash()).not.toContain("V");
    expect(game.state("V").damage).toBe(0);
  });

  test("(b) the kill was ignored → the linked 'if you do' pump is ignored too: W stays 2, W2 stays 1 — no last-known-Might +3 (359.3.e.14.a)", async () => {
    const { game, log } = await gripThenGust();
    expect(game.state("W").might).toBe(2);
    expect(game.state("W").mightModifier).toBe(0);
    expect(game.state("W2").might).toBe(1);
    expect(log.filter((l) => l.kind === "pick")).toEqual([]);
  });

  test("(b) P1 still draws 1; Deathgrip goes to trash and still counts as a card P1 played this turn", async () => {
    const { game, p1Hand0 } = await gripThenGust();
    // −Deathgrip, +V bounced back, +1 drawn
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1 + 1 + 1);
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
  });

  test("(b) contrast: Gust cannot pick W (in a base, not 'at a battlefield') — only V is offered to P2", async () => {
    const game = await board({ zhonyas: false }).build();
    await game.p1.cast("grip", { targets: "V" });
    await game.p1.passPriority();
    const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toEqual(["V"]);
    await expect(game.p2.cast("gust", { targets: "W" })).rejects.toThrow();
  });
});
