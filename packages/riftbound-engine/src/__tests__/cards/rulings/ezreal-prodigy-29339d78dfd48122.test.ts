/**
 * Ruling 29339d78dfd48122 — Ezreal, Prodigy (sfd-149-221) · Champion Unit · Chaos · 3 · 3 Might
 *   "When you play me, discard 1, then draw 2. Optional additional costs you pay cost [1] or [rainbow] less."
 *   × Blast Corps Cadet (sfd-013-221) "You may pay [1][fury] as an additional cost to play me. When you play
 *     me, if you paid the additional cost, deal 2 to a unit at a battlefield."
 *   × Cruel Patron (ogn-208-298) "As an additional cost to play me, kill a friendly unit."
 *   × Hard Bargain (sfd-136-221) "[Reaction] [Repeat] [2] Counter a spell unless its controller pays [2]."
 *
 * Q: Which costs does Ezreal reduce?
 * A: Only OPTIONAL additional costs ("may … as an additional cost", or keyworded ones like Repeat /
 *    Accelerate — 356.2.b.1, 805.1.a, 820.1.d); the discount hits that cost as it is added (356.4.c/d).
 *    NOT mandatory additional costs (no "may", 356.2.a.1 — Cruel Patron's kill) and NOT payments made
 *    while an effect resolves (Hard Bargain's "unless its controller pays [2]"). Hard Bargain's own
 *    Repeat [2] IS an optional additional cost and is reduced.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EZREAL = "sfd-149-221";
const CADET = "sfd-013-221";
const CRUEL_PATRON = "ogn-208-298";
const HARD_BARGAIN = "sfd-136-221";
const DREDGE_UP = "ven-049-166"; // plain 2-cost "Draw 1" spell to be Hard-Bargained

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn; P2 has a 3-Might unit at bf1 for the Cadet's conditional 2 damage. */
function cadetBoard(p1: { energy: number; fury?: number }, withEzreal: boolean) {
  const s = scenario()
    .resources(P1, { energy: p1.energy, power: { fury: p1.fury ?? 0 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Practice Dummy" }, "dummy")
    .hand(P1, CADET, "cadet");
  return withEzreal ? s.unit(P1, "base", EZREAL, "ezreal") : s;
}

/** Play the Cadet paying its optional cost and let its play trigger hit the only unit at a battlefield. */
async function playCadetPaid(game: Game): Promise<void> {
  await game.p1.play("cadet", { payOptional: true });
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "dummy")) {
    await game.p1.pick("dummy");
    await game.settle();
  }
}

describe("Ruling 29339d78dfd48122 — what Ezreal, Prodigy's discount does and does not touch", () => {
  // ── Optional additional cost (Blast Corps Cadet): reduced ───────────────────────────────────

  test("control (no Ezreal): the Cadet's optional additional cost is the full [1][fury] — 2+1 energy and 1 fury are spent, and the paid-cost trigger deals 2", async () => {
    const game = await cadetBoard({ energy: 3, fury: 1 }, false).build();
    const payField = game.p1.option("play", "cadet")?.fields.find((f) => f.arg === "payOptional");
    expect(payField?.options).toContain(true);
    await playCadetPaid(game);
    expect(game.zoneOf("cadet")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("dummy").damage).toBe(2);
    // And with only 2 energy + 1 fury (no Ezreal) the optional cost is NOT affordable.
    const poor = await cadetBoard({ energy: 2, fury: 1 }, false).build();
    expect(poor.p1.option("play", "cadet")?.fields.find((f) => f.arg === "payOptional")?.options ?? [false]).not.toContain(true);
  });

  // Expected: Ezreal makes the optional [1][fury] cost [1] less → just [fury]; with 2 energy + 1 fury P1
  // can pay it (2 for the Cadet + fury), ends at 0/0, and "if you paid the additional cost" is satisfied
  // (356.4.c, 356.4.f.1). Actual: Ezreal's static discount is not implemented — payOptional is not offered.
  test("ruling 29339d78dfd48122 — with Ezreal the Cadet's optional cost drops the [1]: 2 energy + [fury] suffices, still counts as paid (deal 2)", async () => {
    const game = await cadetBoard({ energy: 2, fury: 1 }, true).build();
    expect(game.p1.option("play", "cadet")?.fields.find((f) => f.arg === "payOptional")?.options).toContain(true);
    await playCadetPaid(game);
    expect(game.zoneOf("cadet")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("dummy").damage).toBe(2);
  });

  // Expected: alternatively Ezreal removes the [rainbow]-class pip → the optional cost is just [1]; with
  // 3 energy and NO fury P1 pays 2+1 and the trigger still fires. Actual: not implemented (see above).
  test("ruling 29339d78dfd48122 — with Ezreal the Cadet's optional cost may instead drop the [fury] pip: 3 energy and no power suffices (deal 2)", async () => {
    const game = await cadetBoard({ energy: 3 }, true).build();
    expect(game.p1.option("play", "cadet")?.fields.find((f) => f.arg === "payOptional")?.options).toContain(true);
    await playCadetPaid(game);
    expect(game.zoneOf("cadet")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.state("dummy").damage).toBe(2);
  });

  // ── Mandatory additional cost (Cruel Patron): NOT reduced ───────────────────────────────────

  // Expected: Cruel Patron's kill is mandatory ("As an additional cost", no "may", 356.2.a.1) — Ezreal
  // does not waive or reduce it: with Ezreal as the only friendly unit, playing Patron must kill Ezreal
  // (the play offers/requires a friendly `sacrifice`, and Ezreal ends in the trash). Actual: the engine
  // does not model Cruel Patron's kill cost at all — Patron is played for 4 with nothing killed.
  test("ruling 29339d78dfd48122 — Ezreal does not reduce Cruel Patron's mandatory kill: Patron still has to kill a friendly unit (here Ezreal himself)", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", EZREAL, "ezreal").hand(P1, CRUEL_PATRON, "patron").build();
    const sac = game.p1.option("play", "patron")?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.options ?? []).toEqual(["ezreal"]);
    // Playing without naming a victim is not a complete, legal play.
    const r = await game.p1.try((p) => p.play("patron", { to: "base" }));
    if (r.ok) {
      await game.settle();
    }
    expect(r.ok && game.zoneOf("ezreal") === "base").toBe(false);
    // Paying it properly: Ezreal dies, Patron enters, 4 energy spent.
    const g2 = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", EZREAL, "ezreal").hand(P1, CRUEL_PATRON, "patron").build();
    await g2.p1.play("patron", { sacrifice: "ezreal" });
    await g2.settle();
    expect(g2.zoneOf("ezreal")).toBe("trash");
    expect(g2.zoneOf("patron")).toBe("base");
    expect(g2.p1.energy()).toBe(0);
  });

  // ── Payment during an effect (Hard Bargain's "unless … pays [2]"): NOT reduced ──────────────

  /** P1 (with Ezreal) casts Dredge Up; P2 answers with Hard Bargain; everyone passes. */
  async function bargained(p1Energy: number): Promise<{ game: Game; hand0: number }> {
    const game = await scenario()
      .resources(P1, { energy: p1Energy })
      .resources(P2, { energy: 2 })
      .unit(P1, "base", EZREAL, "ezreal")
      .hand(P1, DREDGE_UP, "dredge")
      .hand(P2, HARD_BARGAIN, "hb")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("dredge");
    expect(game.p1.energy()).toBe(p1Energy - 2);
    await game.p1.passPriority();
    await game.p2.cast("hb", { targets: "dredge" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "hb"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hard Bargain resolves now
    return { game, hand0 };
  }

  test("Hard Bargain's [2] ransom is a payment during an effect, not an additional cost: with Ezreal and only 1 energy left P1 cannot meet it — Dredge Up is countered (no draw) and the 1 energy is untouched", async () => {
    const { game, hand0 } = await bargained(3); // 3 - 2 for Dredge Up = 1 left < [2]
    // If the engine asks at all, P1 cannot usefully say yes with 1 energy; decline.
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.no();
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // Dredge left, nothing drawn
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("hb")).toBe("trash");
  });

  // Expected: with exactly 2 energy left, Hard Bargain's resolution asks P1 (yes-no) whether to pay; paying
  // costs the FULL [2] even with Ezreal out (not [1]) → energy 0, Dredge Up resolves and draws 1 (158.1).
  // Actual: the engine never offers the "unless its controller pays [2]" payment — it counters outright.
  test.failing("BUG: ruling 29339d78dfd48122 — paying Hard Bargain's ransom with Ezreal out still costs the full [2] (P1 is asked, pays 2 → 0 left, Dredge Up draws)", async () => {
    const { game, hand0 } = await bargained(4); // 4 - 2 = exactly 2 left
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0); // 2 paid, not 1
    expect(game.zoneOf("dredge")).toBe("trash"); // resolved normally
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // drew 1
  });

  // ── Hard Bargain's own Repeat [2]: an optional additional cost → reduced ────────────────────

  test("control (no Ezreal): Hard Bargain with Repeat costs 2 + [2] = 4 — legal at 4 energy (→ 0), not offered at 3", async () => {
    const rich = await scenario().active(P2).resources(P2, { energy: 2 }).resources(P1, { energy: 4 }).hand(P2, DREDGE_UP, "d").hand(P1, HARD_BARGAIN, "hb").build();
    await rich.p2.cast("d");
    await rich.p2.passPriority();
    expect(rich.p1.option("cast", "hb")?.fields.find((f) => f.arg === "repeat")?.options).toContain(1);
    await rich.p1.cast("hb", { repeat: 1, targets: "d" });
    expect(rich.p1.energy()).toBe(0);

    const poor = await scenario().active(P2).resources(P2, { energy: 2 }).resources(P1, { energy: 3 }).hand(P2, DREDGE_UP, "d").hand(P1, HARD_BARGAIN, "hb").build();
    await poor.p2.cast("d");
    await poor.p2.passPriority();
    expect(poor.p1.option("cast", "hb")?.fields.find((f) => f.arg === "repeat")?.options ?? []).not.toContain(1);
    const r = await poor.p1.try((p) => p.cast("hb", { repeat: 1, targets: "d" }));
    expect(r.ok).toBe(false);
  });

  // Expected: Repeat is a keyworded optional additional cost (820.1.d) → Ezreal makes it [1]; Hard Bargain
  // + one Repeat costs 2 + 1 = 3, so P1 with Ezreal and 3 energy can cast it repeated (→ 0 energy).
  // Actual: Ezreal's discount is not implemented; at 3 energy the repeat is not offered.
  test("ruling 29339d78dfd48122 — Ezreal DOES reduce Hard Bargain's Repeat [2] to [1]: castable with one Repeat at 3 energy", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .resources(P1, { energy: 3 })
      .unit(P1, "base", EZREAL, "ezreal")
      .hand(P2, DREDGE_UP, "d")
      .hand(P1, HARD_BARGAIN, "hb")
      .build();
    await game.p2.cast("d");
    await game.p2.passPriority();
    expect(game.p1.option("cast", "hb")?.fields.find((f) => f.arg === "repeat")?.options).toContain(1);
    await game.p1.cast("hb", { repeat: 1, targets: "d" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["d", "hb"]);
  });
});
