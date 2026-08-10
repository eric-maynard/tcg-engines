/**
 * Interaction: Voidreaver (unl-201-219) · Legend · Body/Chaos
 *     "When you win a combat, gain 1 XP. / Spend 1 XP, [Exhaust]: [Buff] a unit. /
 *      Spend 2 XP, [Exhaust]: Move an exhausted friendly unit from a battlefield to its base."
 *   × Mosstomper (unl-047-219) · Unit · Calm · 3 Might
 *     "[Hunt 2] / [Level 3][>] I have +1 [Might] and [Deflect]."
 *   × Discipline (ogn-058-298) · Spell · [Reaction] "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Rules: 174.8 / 728–732 (XP is a per-PLAYER resource; 729.2/731 each player has their own total),
 * 381 (activated abilities: controller's turn, Open State), 402.3 (no legal way to pay/choose → not
 * legal to activate), 403.1.a ("Spend N XP, [Exhaust]" is the cost before the colon), 404.1 + 730.2
 * (costs are paid at finalization — XP drops and the legend exhausts BEFORE anyone gets priority),
 * 824.1.c/824.1.d (Level N reads the CONTROLLER's XP and goes Inactive "as soon as" it drops below N),
 * 809.1.c (Deflect surcharge applies only while the target HAS Deflect; opponents only), 415.3.a (an
 * exhausted legend readies only in its controller's Awaken step), 425.1.c analog (spent XP is gone).
 *
 * Question: P1 (Voidreaver READY, exactly 3 XP) has an EXHAUSTED Mosstomper alone at bf1 (→ 4 Might,
 * Deflect). P2 has 10 XP and holds Discipline with 2 energy and NO power. P1's turn, Neutral Open.
 *   (a) Which legend abilities are offered at 3 XP / 0 XP / 3 XP-but-exhausted? Does P2's XP matter?
 *   (b) P1 activates "Spend 1 XP: Buff" on Mosstomper — when does XP become 2, and what is Mosstomper
 *       while the ability is still on the chain?
 *   (c) In that window P2 Disciplines Mosstomper with no power — legal (no Deflect any more)? Contrast:
 *       with P1 still at 3+ XP in the same window, is it legal?
 *   (d) After everything resolves: Might, XP per seat, legend state, is "Spend 2 XP" offered at XP = 2?
 *
 * Expected: (a) both / neither / neither; P2's XP is irrelevant. (b) XP 3→2 + legend exhausted at once;
 * Mosstomper is 3 Might, no Deflect while the item is pending. (c) legal, resolves first (5 Might, P2
 * draws 1); at 3 XP it is NOT legal (surcharge unpayable). (d) 3 +1 buff +2 = 6, no Deflect, P1 XP 2,
 * P2 XP 10, legend exhausted → no ability offered despite XP = 2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOIDREAVER = "unl-201-219";
const MOSSTOMPER = "unl-047-219";
const DISCIPLINE = "ogn-058-298";

/** P1's turn-2 main phase. Voidreaver ready, Mosstomper exhausted alone at P1's bf1, P2 holds Discipline with 2 energy. */
function board(opts: { p1Xp?: number; legendExhausted?: boolean } = {}) {
  const { p1Xp = 3, legendExhausted = false } = opts;
  return scenario()
    .xp(P1, p1Xp)
    .xp(P2, 10)
    .card("vr", { def: VOIDREAVER, meta: legendExhausted ? { exhausted: true } : undefined, owner: P1, zone: "legendZone" })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", MOSSTOMPER, "moss", { exhausted: true })
    .resources(P2, { energy: 2 })
    .hand(P2, DISCIPLINE, "disc");
}

const legendAbilities = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.verb === "activate" && o.card === "vr")
    .map((o) => o.key)
    .sort();

const targetsOf = (game: Game, seat: "p1" | "p2", verbOrKey: string, card?: string): string[] => {
  const opt = game[seat].option(verbOrKey, card);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
};

const hasDeflect = (game: Game) => game.state("moss").keywords.includes("Deflect");

/** P1 activates the buff on Mosstomper and passes; returns with P2 holding priority over the pending item. */
async function activateBuffAndPassToP2(game: Game): Promise<void> {
  await game.p1.activate("vr", 1, { targets: "moss" });
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.actingSeat()).toBe(P2);
}

describe("Voidreaver XP costs × Mosstomper Level 3 Deflect × Discipline in the response window", () => {
  // ── (a) what is offered ───────────────────────────────────────────────────────────────────────

  test("(a) setup: at P1 = 3 XP the exhausted Mosstomper is 4 Might with Deflect; XP is per seat (P1 3 / P2 10)", async () => {
    const game = await board().build();
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(10);
    expect(game.state("vr").isReady).toBe(true);
    expect(game.state("moss")).toMatchObject({ baseMight: 3, isExhausted: true, might: 4, zone: "battlefield-bf1" });
    expect(hasDeflect(game)).toBe(true);
  });

  test("(a) 3 XP + ready legend: BOTH abilities are offered — Buff lists Mosstomper as a target, Move lists exactly the exhausted friendly Mosstomper at bf1", async () => {
    const game = await board().build();
    expect(legendAbilities(game)).toEqual(["activateAbility:vr#1", "activateAbility:vr#2"]);
    expect(targetsOf(game, "p1", "activateAbility:vr#1")).toContain("moss");
    expect(targetsOf(game, "p1", "activateAbility:vr#2")).toEqual(["moss"]);
  });

  test("(a) 0 XP + ready legend: NEITHER ability is offered (Spend N XP is an unpayable cost, 402.3/403.1.a) and a forced attempt is refused without touching state", async () => {
    const game = await board({ p1Xp: 0 }).build();
    expect(legendAbilities(game)).toEqual([]);
    expect((await game.p1.try((p) => p.activate("vr", 1, { targets: "moss" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("vr", 2, { targets: "moss" }))).ok).toBe(false);
    expect(game.p1.xp()).toBe(0);
    expect(game.state("vr").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) 3 XP but legend EXHAUSTED: neither ability ([Exhaust] unpayable) — XP alone is not enough", async () => {
    const game = await board({ legendExhausted: true }).build();
    expect(game.state("vr").isExhausted).toBe(true);
    expect(legendAbilities(game)).toEqual([]);
    expect((await game.p1.try((p) => p.activate("vr", 1, { targets: "moss" }))).ok).toBe(false);
    expect(game.p1.xp()).toBe(3);
  });

  test("(a) P2's 10 XP never levels P1's Mosstomper (824.1.c reads the controller): at P1 = 0 XP it is a plain 3 with no Deflect", async () => {
    const game = await board({ p1Xp: 0 }).build();
    expect(game.p2.xp()).toBe(10);
    expect(game.state("moss").might).toBe(3);
    expect(hasDeflect(game)).toBe(false);
  });

  // ── (b) paying the cost ───────────────────────────────────────────────────────────────────────

  test("(b) activating 'Spend 1 XP, [Exhaust]: Buff' pays at finalization: XP 3→2 and legend exhausted immediately, one un-triggered Voidreaver item on the chain, no buff yet (404.1, 730.2)", async () => {
    const game = await board().build();
    await game.p1.activate("vr", 1, { targets: "moss" });
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(10);
    expect(game.state("vr").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vr", controller: P1, triggered: false })]);
    expect(game.state("moss").isBuffed).toBe(false);
  });

  test("(b) Level 3 goes Inactive 'as soon as' XP < 3 (824.1.d): while the buff item is still on the chain Mosstomper is 3 Might with NO Deflect", async () => {
    const game = await board().build();
    await activateBuffAndPassToP2(game);
    expect(game.chain()).toHaveLength(1);
    expect(game.state("moss").might).toBe(3);
    expect(hasDeflect(game)).toBe(false);
    expect(game.state("moss").grantedKeywords.map((k) => k.keyword)).not.toContain("Deflect");
  });

  // ── (c) Discipline in the window ──────────────────────────────────────────────────────────────

  test("(c) in P2's response window Discipline (2 energy, 0 power) may choose the now non-Deflect Mosstomper: offered as a target and the cast goes through, P2 pool → 0", async () => {
    const game = await board().build();
    await activateBuffAndPassToP2(game);
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(targetsOf(game, "p2", "cast", "disc")).toContain("moss");
    await game.p2.cast("disc", { targets: "moss" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((i) => i.cardId)).toEqual(expect.arrayContaining(["vr", "disc"]));
    expect(game.chain()).toHaveLength(2);
  });

  test("(c) Discipline resolves FIRST (LIFO): Mosstomper 3 → 5 this turn and P2 draws 1 while Voidreaver's buff is still pending", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await activateBuffAndPassToP2(game);
    await game.p2.cast("disc", { targets: "moss" });
    // Both pass once → the top item (Discipline) resolves; the Voidreaver item is still there.
    await game.acting().passPriority();
    if (game.chain().length === 2) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((i) => i.cardId)).toEqual(["vr"]);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("moss")).toMatchObject({ isBuffed: false, might: 5 });
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
  });

  test("(c) contrast — P1 started at 4 XP so is still at 3 after paying: Deflect stays ON in the window and P2 (no power for the [rainbow] surcharge) is NOT offered Mosstomper; the cast is refused (809.1.c)", async () => {
    const game = await board({ p1Xp: 4 }).build();
    await activateBuffAndPassToP2(game);
    expect(game.p1.xp()).toBe(3);
    expect(game.state("moss").might).toBe(4);
    expect(hasDeflect(game)).toBe(true);
    expect(targetsOf(game, "p2", "cast", "disc")).not.toContain("moss");
    const r = await game.p2.try((p) => p.cast("disc", { targets: "moss" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("disc")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: {} });
    expect(game.chain()).toHaveLength(1);
  });

  test("(c) contrast — on P2's own turn with P1 sitting at 3 XP, Discipline with 2 energy / 0 power cannot choose the Deflect Mosstomper either (a plain unit still could)", async () => {
    const game = await board().active(P2).unit(P2, "base", { might: 2, name: "Plain" }, "plain").build();
    expect(hasDeflect(game)).toBe(true);
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(targetsOf(game, "p2", "cast", "disc")).toEqual(["plain"]);
    expect((await game.p2.try((p) => p.cast("disc", { targets: "moss" }))).ok).toBe(false);
    expect(game.zoneOf("disc")).toBe("hand");
  });

  // ── (d) everything resolves ───────────────────────────────────────────────────────────────────

  test("(d) resolve everything: Mosstomper = 3 base +1 buff +2 Discipline = 6 this turn, buffed, still NO Deflect; P1 XP 2 (not refunded), P2 XP 10; legend exhausted", async () => {
    const game = await board().build();
    await activateBuffAndPassToP2(game);
    await game.p2.cast("disc", { targets: "moss" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.state("moss")).toMatchObject({ baseMight: 3, isBuffed: true, isExhausted: true, might: 6, zone: "battlefield-bf1" });
    expect(hasDeflect(game)).toBe(false);
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(10);
    expect(game.state("vr").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) with exactly 2 XP left the 'Spend 2 XP, [Exhaust]' move is NOT offered — the legend is exhausted until P1's next Awaken (415.3.a); nor is the buff", async () => {
    const game = await board().build();
    await activateBuffAndPassToP2(game);
    await game.p2.cast("disc", { targets: "moss" });
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(legendAbilities(game)).toEqual([]);
    expect((await game.p1.try((p) => p.activate("vr", 2, { targets: "moss" }))).ok).toBe(false);
    expect(game.locationOf("moss")).toBe("bf1");
    expect(game.p1.xp()).toBe(2);
  });

  test("(d) the +2 is 'this turn' and Level stays off at 2 XP: after the turn passes Mosstomper is 3 base +1 buff = 4, no Deflect; on P1's next turn the legend is ready again (Mosstomper held → Hunt 2 → 4 XP, levelled again) and the Buff is offered once more — the Move is not, only because Awaken also readied Mosstomper", async () => {
    const game = await board().build();
    await activateBuffAndPassToP2(game);
    await game.p2.cast("disc", { targets: "moss" });
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("moss").might).toBe(4);
    expect(hasDeflect(game)).toBe(false);
    expect(game.state("vr").isExhausted).toBe(true); // P2's Awaken readies nothing of P1's
    await game.advanceTurn(); // → P1: Awaken readies the legend; Mosstomper holds bf1 → Hunt 2 → 2 + 2 = 4 XP
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("vr").isReady).toBe(true);
    expect(game.p1.xp()).toBe(4);
    expect(game.state("moss").might).toBe(5); // 3 +1 buff +1 Level 3
    expect(hasDeflect(game)).toBe(true);
    expect(game.state("moss").isReady).toBe(true);
    expect(legendAbilities(game)).toEqual(["activateAbility:vr#1"]);
  });
});
