/**
 * Interaction: Grim Resolve (unl-095-219) · Spell · Body · 2 · Action
 *     "Give a friendly unit +3 [Might] this turn. When it wins a combat this turn, gain 2 XP."
 *   × Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 · [Hidden]
 *     "Take control of an enemy unit at a battlefield. Ready it. … Lose control of that unit and recall
 *      it at end of turn."
 *   × Wind Wall (ogn-064-298) · Spell · Calm · 3 · Reaction — "Counter a spell."
 *
 * Question: P1's turn, both players 0 XP. P2 controls bf1 with defender D (4) and a facedown Hostile
 * Takeover there. P1 group-moves U (3) and A (2) into bf1 → combat showdown, P1 attacker with Focus. P1
 * plays Grim Resolve choosing U.
 *   (a) P2 lets Grim Resolve resolve (U = 6, delayed trigger created), THEN flips Hostile Takeover on U:
 *       U becomes P2's readied Defender. Combat: A (2) alone vs D (4) + U (6) → A dies, P2's side wins.
 *       Does the delayed trigger fire, and WHO gains the 2 XP? Does U keep the +3 after changing sides?
 *   (b) P2 flips Hostile Takeover IN RESPONSE (HT resolves first): is U still "a friendly unit" when
 *       Grim Resolve resolves? +3? delayed trigger?
 *   (c) P2 Wind Walls Grim Resolve; P1 wins the combat with U present — any XP?
 *   (d) (a)-without-HT where P1 wins but U itself died while A survived — XP?
 *
 * Rules: 466.3.a / 466.3.c (units at the battlefield inherit their CONTROLLER's combat result), 466.4
 * (post-combat trigger window), 390.2 / 392 / 191.2 / 191.4.b / 359.3.f.4 (a delayed triggered ability
 * is controlled by the player whose effect created it, regardless of who now controls the watched unit),
 * 477.1.a (control change is a trait change — continuous +3 survives it), 359.3.e.2 / 359.3.e.5
 * ("friendly" re-checked at resolution relative to the spell's controller → illegal target → does
 * nothing), 323.2.b (side swap at cleanup), 811.1.b (facedown Reaction for 0), 425.1.b (countered →
 * never resolved).
 *
 * Expected: (a) U is a 6-Might P2 defender; P2 wins; U "won a combat" → the delayed trigger fires as
 * P1's chain item → P1 +2 XP, P2 0; P2 keeps bf1, A in P1's trash; at end of turn U returns to P1's base
 * as a plain 3. (b) HT first → U is P2's → Grim Resolve does nothing: U defends as a 3, no trigger,
 * spell still played and trashed; A dies, 0 XP all round. (c) countered → no +3, no trigger → P1's win
 * yields 0 XP. (d) U in the trash did not "win a combat" → 0 XP although P1 won (contrast: U alive → 2).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GRIM_RESOLVE = "unl-095-219";
const HOSTILE_TAKEOVER = "sfd-202-221";
const WIND_WALL = "ogn-064-298";

interface Opts {
  /** P2's facedown Hostile Takeover at bf1 (default true). */
  ht?: boolean;
  /** Defender D's Might (default 4). */
  dMight?: number;
}

/**
 * P1's turn 2, 0 XP each. bf1: P2's D (+ P2's facedown Hostile Takeover). P1: U (3) and A (2) in base,
 * Grim Resolve in hand + exactly 2 energy. P2: Wind Wall in hand + {3, calm 2}.
 */
function board(o: Opts = {}) {
  const b = scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: o.dMight ?? 4, name: "Defender D" }, "D")
    .unit(P1, "base", { might: 3, name: "Unit U" }, "U")
    .unit(P1, "base", { might: 2, name: "Ally A" }, "A")
    .hand(P1, GRIM_RESOLVE, "grim")
    .hand(P2, WIND_WALL, "ww");
  if (o.ht ?? true) {
    b.facedown(P2, "bf1", HOSTILE_TAKEOVER, "ht");
  }
  return b;
}

/** U + A attack bf1 (combat showdown, P1 has Focus) and P1 casts Grim Resolve on U — it waits on the chain. */
async function grimOnChain(o: Opts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.move(["U", "A"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("grim", { targets: "U" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grim", controller: P1, targets: ["U"], triggered: false })]);
  return game;
}

/** P2 flips Hostile Takeover naming U (whenever P2 may act). */
async function flipTakeoverOnU(game: Game): Promise<void> {
  expect(game.p2.can("reveal", "ht")).toBe(true);
  await game.p2.reveal("ht");
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("U");
  }
  expect(game.chain().at(-1)).toMatchObject({ cardId: "ht", controller: P2, targets: ["U"] });
}

/** Line (a): Grim Resolve resolves (both pass), then P2 — now holding Focus — flips HT on U and it resolves. */
async function lineA(): Promise<Game> {
  const game = await grimOnChain();
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("grim")).toBe("trash");
  expect(game.state("U")).toMatchObject({ controller: P1, might: 6 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // Focus passed to P2
  await flipTakeoverOnU(game);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("ht")).toBe("trash");
  return game;
}

describe("Grim Resolve × Hostile Takeover — the stolen unit wins for P2, but whose delayed trigger is it?", () => {
  test("setup: the group move opens a combat showdown at bf1 with P1 holding Focus; Grim Resolve offers only P1's units U and A ('friendly'), never D", async () => {
    const game = await board().build();
    await game.p1.move(["U", "A"], "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    const offered = (game.p1.option("cast", "grim")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect([...offered].sort()).toEqual(["A", "U"]);
    await expect(game.p1.cast("grim", { targets: "D" })).rejects.toThrow();
    await game.p1.cast("grim", { targets: "U" });
    expect(game.p1.energy()).toBe(0);
  });

  // ---- (a) Grim Resolve resolves, THEN the takeover ---------------------------------------------------------

  test("(a) Grim Resolve resolves first: U = 3 + 3 = 6; P2 then flips Hostile Takeover for 0 (targets offered: U, A) and U becomes P2-controlled, READIED, a Defender — and keeps the +3 across the control change (477.1.a, 323.2.b)", async () => {
    const game = await grimOnChain();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("U")).toMatchObject({ controller: P1, isExhausted: true, might: 6, mightModifier: 3 });
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 2 } });
    await game.p2.reveal("ht");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect((d as { options: { card?: string }[] }).options.map((o) => o.card).sort()).toEqual(["A", "U"]);
    await game.p2.pick("U");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 2 } }); // flipped for 0 (811.1.b)
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("U")).toMatchObject({ combatRole: "defender", controller: P2, isReady: true, location: "bf1", might: 6, mightModifier: 3, owner: P1 });
    expect(game.state("A")).toMatchObject({ combatRole: "attacker", controller: P1, might: 2 });
    expect(game.state("D")).toMatchObject({ combatRole: "defender", controller: P2, might: 4 });
  });

  test("(a) combat A (2) vs D (4) + U (6): A dies; in the post-combat window the delayed 'when it wins a combat' ability goes on the chain as P1's item — created by P1's spell, controlled by P1 although P2 controls U (466.3.c, 466.4, 191.2, 392)", async () => {
    const game = await lineA();
    await game.acting().passFocus();
    await game.acting().passFocus();
    // P1 assigns A's 2 damage (nothing is lethal); the defenders' 10 kill A.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 2 });
    await game.p1.distribute({ D: 2 });
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "U", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.xp()).toBe(0); // not yet — it is a chain item, P2 gets a window
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
  });

  test("(a) result: P1 gains exactly 2 XP, P2 gains 0; P2 keeps bf1 (no conquer, no points for anyone); A is in P1's trash; U stays at bf1 as P2's 6-Might unit for the rest of the turn", async () => {
    const game = await lineA();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.state("A").owner).toBe(P1);
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(0); // healed by the Combat Cleanup (466.1.a.1)
    expect(game.state("U")).toMatchObject({ controller: P2, location: "bf1", might: 6 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 0]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) at end of turn P1 regains U and it is recalled to P1's base (Hostile Takeover's rider); the +3 expires → a plain 3; the XP stays", async () => {
    const game = await lineA();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("U")).toMatchObject({ controller: P1, location: "base", might: 3, mightModifier: 0, owner: P1, zone: "base" });
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
  });

  // ---- (b) the takeover IN RESPONSE ----------------------------------------------------------------------------

  test("(b) P2 flips Hostile Takeover in response: chain = [Grim Resolve, HT]; LIFO → HT resolves first and U is P2's BEFORE Grim Resolve resolves", async () => {
    const game = await grimOnChain();
    await game.p1.passPriority();
    expect(game.p2.legal().map((o) => o.key)).toContain("revealHidden:ht");
    await flipTakeoverOnU(game);
    expect(game.chain().map((i) => i.cardId)).toEqual(["grim", "ht"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("ht")).toBe("trash");
    expect(game.state("U")).toMatchObject({ controller: P2, isReady: true, might: 3 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grim", controller: P1, targets: ["U"] })]);
  });

  test("(b) Grim Resolve then re-checks 'friendly' relative to P1 at resolution: U is no longer legal → it resolves doing NOTHING (359.3.e.2/.5): no +3 (U defends as a 3), the card still counts as played and goes to P1's trash", async () => {
    const game = await grimOnChain();
    await game.p1.passPriority();
    await flipTakeoverOnU(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    // now Grim Resolve (alone on the chain) resolves
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("grim")).toBe("trash");
    expect(game.state("grim").owner).toBe(P1);
    expect(game.state("U")).toMatchObject({ combatRole: "defender", controller: P2, might: 3, mightModifier: 0 });
    expect(game.state("A")).toMatchObject({ might: 2, mightModifier: 0 }); // not re-aimed at the other friendly unit
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.energy()).toBe(0); // nothing refunded
  });

  test("(b) combat A (2) vs D (4) + U (3): A dies, P2 wins — and NO delayed trigger was ever created, so nobody gains XP; P2 keeps bf1", async () => {
    const game = await grimOnChain();
    await game.p1.passPriority();
    await flipTakeoverOnU(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.state("U")).toMatchObject({ controller: P2, location: "bf1", might: 3 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 0]);
    expect(game.chain()).toEqual([]);
  });

  // ---- (c) Wind Wall -----------------------------------------------------------------------------------------------

  test("(c) P2 Wind Walls Grim Resolve: countered → never resolved → no +3 and no delayed trigger (425.1.b, 392); P1 still WINS the combat (U 3 + A 2 vs D 4 → conquers bf1, 1 point) yet gains 0 XP", async () => {
    const game = await grimOnChain({ ht: false });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "ww")).toBe(true);
    await game.p2.cast("ww", { targets: "grim" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["grim", "ww"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("grim")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.gameState.battlefields.bf1.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
    // whichever P1 unit survived D's 4 damage carries no +3
    for (const u of game.p1.units("bf1")) {
      expect(game.state(u).mightModifier).toBe(0);
    }
  });

  // ---- (d) P1 wins but U itself died ------------------------------------------------------------------------------

  test("(d) no takeover, D is a 7: Grim Resolve resolves (U = 6), U + A (8) kill D, P2 puts 6 on U and 1 on A → U dies, A survives, P1 conquers bf1 — but U was not at the battlefield for the result, so it did not 'win a combat': 0 XP (466.3.c)", async () => {
    const game = await board({ dMight: 7, ht: false })
      .script(P2, [{ allocation: { A: 1, U: 6 }, kind: "distribute" }])
      .build();
    await game.p1.move(["U", "A"], "bf1");
    await game.p1.cast("grim", { targets: "U" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("grim")).toBe("trash");
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("U")).toBe("trash");
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
  });

  test("(d) contrast — no takeover, D is a 4: U (6) survives and P1's side wins → the delayed trigger fires for P1: exactly 2 XP, bf1 conquered", async () => {
    const game = await grimOnChain({ ht: false });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.state("U")).toMatchObject({ controller: P1, location: "bf1", might: 6 });
    expect(game.gameState.battlefields.bf1.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
