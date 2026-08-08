/**
 * Interaction: Ravenbloom Student (ogn-103-298) · Unit · Mind · 2 · 2 Might
 *     "When you play a spell, give me +1 [Might] this turn."
 *   × Void Seeker (ogn-024-298) · Spell · Fury · 3+[fury] · Action — "Deal 4 to a unit at a
 *     battlefield. Draw 1."
 *   × Wind Wall (ogn-064-298) · Spell · Calm · 3+[calm][calm] · Reaction — "Counter a spell."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · Reaction — "Move up to 2 friendly units to base."
 *
 * Question: P1 has Ravenbloom Student in base and plays Void Seeker at P2's unit at bf1.
 * (a) P2 counters it with Wind Wall — does Ravenbloom get +1? Does P1 draw? (b) P2 instead
 * Flashes the target to base so Void Seeker's only targeted instruction fails — +1? draw?
 * (c) While Void Seeker is still on the chain, has Ravenbloom already gotten +1?
 *
 * Rules: 419.4.a (play-triggers fire when the play is completed by the card's RESOLUTION),
 * 419.4.a.1 / 425.1.b (a countered card is not "played" for play-triggers), 419.4.b (…but it IS
 * finalized/played for non-triggered checks), 425.1.a / 425.1.a.1 / 425.1.c (countered → does
 * nothing, to trash, no refund), 359.3.e.5 (illegal target → that instruction skipped, independent
 * "Draw 1" still happens), 359.3.e.10 (a fully fizzled spell is still played → the +1 trigger fires).
 *
 * Expected: (a) no +1 (Might stays 2), no damage, no draw, both spells in trash, no refunds; the
 * countered spell still counts as a card P1 played this turn. (b) Flash resolves first; Void
 * Seeker resolves: no damage, P1 draws 1, Ravenbloom +1 (3 Might) this turn. (c) No — Might is
 * still 2 while Void Seeker sits on the chain.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const VOID_SEEKER = "ogn-024-298";
const WIND_WALL = "ogn-064-298";
const FLASH = "ogs-011-024";

/**
 * P1's turn: Student (2 Might) in base, Void Seeker in hand with exactly 3+[fury]. P2: a 5-Might
 * target at bf1 (survives 4), Wind Wall + Flash in hand with 3 energy + 2 calm (enough for either).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "bf1", { might: 5, name: "Seeker Target" }, "foe")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P2, WIND_WALL, "windwall")
    .hand(P2, FLASH, "flash");
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1 casts Void Seeker at foe and passes; P2 responds with `reply` (targeting `target`). */
async function seekerAnsweredBy(reply: "windwall" | "flash"): Promise<{ game: Game; hand0: number }> {
  const game = await board().build();
  const hand0 = game.p1.hand().length; // includes Void Seeker itself
  await game.p1.cast("seeker", { targets: "foe" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["seeker"]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast(reply, { targets: reply === "windwall" ? "seeker" : "foe" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["seeker", reply]);
  await game.settle();
  return { game, hand0 };
}

describe("Ravenbloom Student × Void Seeker — countered (Wind Wall) vs fizzled (Flash)", () => {
  // ---- control ---------------------------------------------------------------------------------

  test("control: unopposed Void Seeker resolves — 4 damage to foe, P1 draws 1, Ravenbloom Student +1 Might this turn (419.4.a)", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("seeker", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(4);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.state("student").might).toBe(3);
    expect(game.zoneOf("seeker")).toBe("trash");
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2); // "this turn"
  });

  // ---- (c) timing: nothing happens at finalization -------------------------------------------

  test("(c) while Void Seeker is still on the chain Ravenbloom has NOT gotten +1 — the trigger keys off resolution, not finalization (419.4.a)", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "foe" });
    expect(game.zoneOf("seeker")).toBe("chain");
    expect(game.state("student").might).toBe(2);
    expect(game.chain().map((i) => i.name)).toEqual(["Void Seeker"]); // no Student trigger queued either
    await game.p1.passPriority();
    expect(game.state("student").might).toBe(2); // still pending with P2 holding priority
    await game.p2.cast("windwall", { targets: "seeker" });
    expect(game.state("student").might).toBe(2); // and still 2 with the counter on top
  });

  // ---- (a) countered by Wind Wall -------------------------------------------------------------

  test("(a) Wind Wall is a legal response for P2 targeting Void Seeker on the chain", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "foe" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "windwall")).toBe(true);
    const field = game.p2.option("cast", "windwall")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toContain("seeker");
  });

  test("(a) countered Void Seeker does nothing: foe undamaged, P1 does NOT draw (425.1.a)", async () => {
    const { game, hand0 } = await seekerAnsweredBy("windwall");
    expect(game.state("foe").damage).toBe(0);
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // Seeker left the hand, nothing drawn
  });

  test("(a) a COUNTERED spell is not 'played' for play-triggers — Ravenbloom Student stays at 2 Might (419.4.a.1, 425.1.b)", async () => {
    const { game } = await seekerAnsweredBy("windwall");
    expect(game.state("student").might).toBe(2);
    expect(game.state("student").mightModifier).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("(a) both spells end in their owners' trash and no costs are refunded (425.1.a.1, 425.1.c)", async () => {
    const { game } = await seekerAnsweredBy("windwall");
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.p1.trash()).toContain("seeker");
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.p2.trash()).toContain("windwall");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("(a) contrast (419.4.b): the countered Void Seeker still counts as a card P1 PLAYED this turn for non-triggered checks", async () => {
    const { game } = await seekerAnsweredBy("windwall");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
  });

  // ---- (b) fizzled by Flash ---------------------------------------------------------------------

  test("(b) Flash resolves first and moves foe to P2's base; Void Seeker then resolves with an illegal target — foe takes no damage (359.3.e.5)", async () => {
    const { game } = await seekerAnsweredBy("flash");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("foe")).toBe("base");
    expect(game.state("foe").damage).toBe(0);
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("(b) the independent 'Draw 1' still happens — P1 draws exactly 1 (359.3.e.5, Void Seeker example)", async () => {
    const { game, hand0 } = await seekerAnsweredBy("flash");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });

  test("(b) the spell RESOLVED (even with its targeted instruction skipped) so it was played — Ravenbloom Student gets +1 Might this turn (359.3.e.10, 419.4.a)", async () => {
    const { game } = await seekerAnsweredBy("flash");
    expect(game.state("student").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });

  test("no invariant violations in either branch", async () => {
    for (const reply of ["windwall", "flash"] as const) {
      const { game } = await seekerAnsweredBy(reply);
      expect(game.violations()).toEqual([]);
      expect(game.turnPlayer()).toBe(P1);
      expect(game.actingSeat()).toBe(P1);
    }
  });
});
