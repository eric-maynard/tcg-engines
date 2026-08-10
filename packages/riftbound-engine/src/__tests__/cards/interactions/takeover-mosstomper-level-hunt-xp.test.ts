/**
 * Interaction: Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow][rainbow] · Action
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *      there. Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *   × Mosstomper (unl-047-219) · Unit · Calm · 3 + [calm] · 3 Might
 *     "[Hunt 2] (When I conquer or hold, gain 2 XP.)
 *      [Level 3][>] I have +1 [Might] and [Deflect]. (While you have 3+ XP, get the effect.)"
 *   (+ Discipline ogn-058-298 · Reaction · 2 · "Give a unit +2 [Might] this turn. Draw 1." in both hands,
 *    to probe who owes the Deflect pip after the steal.)
 *
 * Question: P2 has 4 XP and holds battlefield B with a lone EXHAUSTED Mosstomper (so: 4 Might, Deflect).
 * P1 has 0 XP (variant: 1 XP). On P1's turn P1 plays Hostile Takeover on Mosstomper.
 *   (a) Does P1 pay the Deflect surcharge?
 *   (b) After resolution, whose XP does [Level 3] read — 4-with-Deflect or plain 3?
 *   (c) P1 conquers B with it: who scores, does Hunt 2 trigger, and WHO gains the 2 XP? In the 1-XP
 *       variant, what is Mosstomper right after Hunt resolves?
 *   (d) End of turn: where does Mosstomper go, what are its stats, does P1 keep the XP?
 *
 * Rules: 809.1.c + 824.1.c (at play time it is P2's levelled Deflect unit and P1 is an opponent → +1
 * power of any domain), 477.1.a (take control = layer-1 control change), 824.1.c.1 / 824.1.d (Level is
 * re-evaluated against the NEW controller's XP → inactive under 0/1/2 XP), 190.3.a (present under a
 * non-controller → Contested → Non-Combat Showdown → establish control), 466.5.d / 469.1 (that is a
 * Conquer: P1 scores 1), 383.4.c.2.a + 191.4.a (the unit's conquer trigger is controlled by its CURRENT
 * controller), 823.1.c.1 (Hunt: "my CONTROLLER gains X XP"), 317.1 + 455 / 458.1 (Ending Step: lose
 * control, recall to P2's base — not a move), 728/729 (XP is a player resource; nothing transfers).
 *
 * Expected: (a) yes — 5 energy + 2 + 1 power. (b) P1-controlled, ready, 3 Might, no Deflect. (c) P1 +1
 * point, P2 0; Hunt goes on the chain under P1 and P1 gains 2 XP (P2 stays 4). Base case 0→2 XP: still a
 * plain 3. Variant 1→3 XP: Level 3 turns on under P1 → 4 Might + Deflect, and now P2 is the one taxed to
 * target it. (d) Back in P2's base under P2's control, 4 Might + Deflect again (P2 has 4 XP); P1 keeps
 * its XP and its point.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const MOSSTOMPER = "unl-047-219";
const DISCIPLINE = "ogn-058-298";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function castTargets(game: G, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/**
 * P1's turn 2. P2 (4 XP by default) controls bfB with a lone exhausted Mosstomper. P1 has `p1xp` XP,
 * exactly HT's 5 energy + [rainbow][rainbow] + ONE spare calm for the Deflect pip, plus 2 more energy and
 * a Discipline for the follow-up probe. P2 holds a Discipline with exactly its 2 energy (+ `p2spare` power).
 */
function board(p1xp: number, opts: { p2xp?: number; p2spare?: number } = {}) {
  return scenario()
    .xp(P1, p1xp)
    .xp(P2, opts.p2xp ?? 4)
    .resources(P1, { energy: 5 + 2, power: { rainbow: 2, calm: 1 } })
    .resources(P2, { energy: 2, power: { fury: opts.p2spare ?? 0 } })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", MOSSTOMPER, "moss", { exhausted: true })
    .hand(P1, HOSTILE_TAKEOVER, "ht")
    .hand(P1, DISCIPLINE, "p1Disc")
    .hand(P2, DISCIPLINE, "p2Disc");
}

/** Cast HT on Mosstomper and let exactly the spell resolve (both pass once). */
async function stolen(p1xp: number, opts: { p2xp?: number; p2spare?: number } = {}): Promise<G> {
  const game = await board(p1xp, opts).build();
  await game.p1.cast("ht", { targets: "moss" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("ht")).toBe("trash");
  return game;
}

/** …then pass Focus through the Non-Combat Showdown (P1 conquers) and resolve the Hunt trigger. */
async function conquered(p1xp: number, opts: { p2xp?: number; p2spare?: number } = {}): Promise<G> {
  const game = await stolen(p1xp, opts);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "moss", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Hostile Takeover × Mosstomper — Deflect tax at cast, Level re-reads the thief's XP, Hunt XP goes to the controller", () => {
  // ---- (a) the Deflect surcharge -----------------------------------------------------------------------

  test("(a) setup: under P2's 4 XP the exhausted Mosstomper is 4 Might with Deflect; HT offers it as the (only) target", async () => {
    const game = await board(0).build();
    expect(game.p2.xp()).toBe(4);
    expect(game.state("moss")).toMatchObject({ baseMight: 3, controller: P2, isExhausted: true, might: 4, owner: P2, zone: "battlefield-bfB" });
    expect(game.state("moss").keywords).toContain("Deflect");
    expect(castTargets(game, "p1", "ht")).toEqual(["moss"]);
  });

  test("(a) P1 pays 5 energy + [rainbow][rainbow] + ONE extra power of any domain for Deflect — all 3 power gone (809.1.c, 824.1.c)", async () => {
    const game = await board(0).build();
    await game.p1.cast("ht", { targets: "moss" });
    expect(game.p1.energy()).toBe(2); // 7 − 5
    expect(game.p1.power()).toBe(0); // 2 rainbow + 1 calm all spent
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ht", controller: P1, targets: ["moss"] })]);
  });

  test("(a) contrast: if P2 had only 2 XP (no Level → no Deflect) the same cast costs just the two pips — the spare calm is kept", async () => {
    const game = await board(0, { p2xp: 2 }).build();
    expect(game.state("moss").might).toBe(3);
    expect(game.state("moss").keywords).not.toContain("Deflect");
    await game.p1.cast("ht", { targets: "moss" });
    expect(game.p1.resources().power).toEqual({ calm: 1, rainbow: 0 });
  });

  test("(a) contrast: with only the two [rainbow] and no spare power, the levelled Mosstomper cannot be chosen at all — HT is not castable (356.2.a.2, 355.8)", async () => {
    const game = await scenario()
      .xp(P2, 4)
      .resources(P1, { energy: 5, power: { rainbow: 2 } })
      .battlefield("bfB", { controller: P2 })
      .unit(P2, "bfB", MOSSTOMPER, "moss", { exhausted: true })
      .hand(P1, HOSTILE_TAKEOVER, "ht")
      .build();
    expect(game.p1.can("cast", "ht")).toBe(false);
    const r = await game.p1.try((p) => p.cast("ht", { targets: "moss" }));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 5, power: { rainbow: 2 } });
  });

  // ---- (b) Level re-evaluated against the new controller ---------------------------------------------------

  test("(b) after HT resolves: P1 controls it (owner P2), it is READY, still at bfB — and Level 3 reads P1's 0 XP: plain 3 Might, NO Deflect (477.1.a, 824.1.c.1, 824.1.d)", async () => {
    const game = await stolen(0);
    expect(game.state("moss")).toMatchObject({ controller: P1, isReady: true, might: 3, owner: P2, zone: "battlefield-bfB" });
    expect(game.state("moss").keywords).toEqual(["Hunt"]);
    expect(game.p1.units("bfB")).toEqual(["moss"]);
    expect(game.p2.units("bfB")).toEqual([]);
  });

  test("(b) variant 1 XP: same — 1 < 3, so still a plain 3 with no Deflect while P1 holds it", async () => {
    const game = await stolen(1);
    expect(game.state("moss")).toMatchObject({ controller: P1, might: 3 });
    expect(game.state("moss").keywords).not.toContain("Deflect");
  });

  // ---- (c) conquer, Hunt, whose XP -----------------------------------------------------------------------

  test("(c) alone at bfB it is Contested by P1 → a Non-Combat Showdown opens with P1's Focus; nobody has scored yet (190.3.a)", async () => {
    const game = await stolen(0);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.gameState.battlefields.bfB?.controller ?? null).not.toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("(c) both pass Focus → P1 establishes control = CONQUER: P1 scores 1, P2 scores 0; Mosstomper's Hunt goes on the chain controlled by P1 (466.5.d, 383.4.c.2.a, 191.4.a)", async () => {
    const game = await stolen(0);
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfB?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "moss", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0); // nothing before the trigger resolves
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(c) Hunt 2 resolves: the CONTROLLER P1 gains exactly 2 XP (0 → 2); the owner P2 stays at 4 (823.1.c.1)", async () => {
    const game = await conquered(0);
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) base case: at 2 XP P1 is still below Level 3 — Mosstomper stays a plain 3 with no Deflect", async () => {
    const game = await conquered(0);
    expect(game.state("moss").might).toBe(3);
    expect(game.state("moss").keywords).toEqual(["Hunt"]);
  });

  test("(c) base case: so P2 (now the opponent of its own card) may choose it with Discipline for just 2 energy — no Deflect to pay", async () => {
    const game = await conquered(0);
    await game.p1.cast("p1Disc", { targets: "moss" }); // opens a chain so P2 gets priority on P1's turn
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(castTargets(game, "p2", "p2Disc")).toEqual(["moss"]);
    await game.p2.cast("p2Disc", { targets: "moss" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(c) variant 1 XP: Hunt takes P1 to exactly 3 XP → Level 3 switches ON under P1 right away: 4 Might AND Deflect (824.1.c, 727.1.c.2)", async () => {
    const game = await conquered(1);
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(4);
    expect(game.state("moss")).toMatchObject({ controller: P1, might: 4 });
    expect(game.state("moss").keywords).toContain("Deflect");
    expect(game.p1.points()).toBe(1);
  });

  test("(c) variant: P1 — its controller — still targets it for free: Discipline costs P1 exactly 2 energy, no power", async () => {
    const game = await conquered(1);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0, rainbow: 0 } });
    expect(castTargets(game, "p1", "p1Disc")).toEqual(["moss"]);
    await game.p1.cast("p1Disc", { targets: "moss" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("moss").might).toBe(6); // 4 + 2
  });

  test("(c) variant: now it is P2, the OWNER, who is the opponent — with only 2 energy P2's Discipline cannot choose its own Mosstomper (809.1.c is about control, not ownership)", async () => {
    const game = await conquered(1, { p2spare: 0 });
    await game.p1.cast("p1Disc", { targets: "moss" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(castTargets(game, "p2", "p2Disc")).not.toContain("moss");
    const r = await game.p2.try((p) => p.cast("p2Disc", { targets: "moss" }));
    expect(r.ok).toBe(false);
    expect(game.p2.energy()).toBe(2);
  });

  test("(c) variant: …and with one spare power P2 may, paying 2 energy + that power for the Deflect pip", async () => {
    const game = await conquered(1, { p2spare: 1 });
    await game.p1.cast("p1Disc", { targets: "moss" });
    await game.p1.passPriority();
    expect(castTargets(game, "p2", "p2Disc")).toContain("moss");
    await game.p2.cast("p2Disc", { targets: "moss" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["p1Disc", "p2Disc"]);
  });

  // ---- (d) end of turn -----------------------------------------------------------------------------------

  test("(d) at end of turn P1 loses control and Mosstomper is recalled to P2's BASE; under P2's 4 XP it is a 4 with Deflect again; bfB is left with no P1 unit (317.1, 455, 824.1.c.1)", async () => {
    const game = await conquered(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("moss")).toMatchObject({ controller: P2, damage: 0, might: 4, owner: P2, zone: "base" });
    expect(game.state("moss").keywords).toContain("Deflect");
    expect(game.p2.base()).toContain("moss");
    expect(game.p1.units()).toEqual([]);
    expect(game.gameState.battlefields.bfB?.controller ?? null).not.toBe(P1);
  });

  test("(d) XP is a player resource: P1 KEEPS its 2 XP (variant: 3) and its point; nothing transfers to P2 (still 4)", async () => {
    const base = await conquered(0);
    await base.advanceTurn();
    expect(base.p1.xp()).toBe(2);
    expect(base.p2.xp()).toBe(4);
    expect(base.p1.points()).toBe(1);
    expect(base.p2.points()).toBe(0);

    const variant = await conquered(1);
    await variant.advanceTurn();
    expect(variant.p1.xp()).toBe(3);
    expect(variant.p2.xp()).toBe(4);
    expect(variant.state("moss")).toMatchObject({ controller: P2, might: 4, zone: "base" });
    expect(variant.violations()).toEqual([]);
  });
});
