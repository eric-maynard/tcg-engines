/**
 * Interaction: Yi, Honed (ogs-009-024) · Champion Unit · Body · 7 + [body] · 6 Might
 *     "[Ganking] (I can move from battlefield to battlefield.)  I enter ready."
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2 + [chaos] · Action — "Move a friendly unit and ready it."
 *   (+ inline vanilla V (3, P1) and D (5, P2).)
 *
 * Question: P1's turn. P1 controls bfA with a READY Yi, Honed; V (3) ready in P1's base; Ride the Wind in
 * hand. P2 holds bfB with D (5). P1 Standard-Moves V base→bfB; combat opens with P1 attacking, on Focus.
 *   (a) During this showdown, is Yi's Ganking move bfA→bfB offered so he can pile in?
 *   (b) Instead P1 (Focus) casts Ride the Wind on Yi → bfB. Is bf→bf legal for a spell move? Does Yi JOIN
 *       the ongoing combat (designation) or stage a second showdown? Who has Focus after the chain closes?
 *       What happens to bfA?
 *   (c) Both pass: outcome of the single combat.
 *   (d) Contrast: no Ride the Wind, V simply dies to D. Back in Neutral Open, Yi ganks bfA→bfB — a NEW
 *       combat with Yi attacking? And if bfB were already P1's, does ganking onto it open anything?
 *
 * Rules: 144.1.a / 144.1.c (Standard Move: Main Phase only, never during a Showdown/Combat), 810.1.c /
 * 810.1.c.3 (Ganking only adds a destination option to the Standard Move — no timing permission),
 * 449.1 (an effect move takes its destination legality from the effect), 347.1 / 347.1.b (Focus holder may
 * start a chain; when it closes Focus passes), 450 (Contested only applies to an UNCONTESTED battlefield not
 * controlled by the mover), 323.2.a / 464.2.c.3.a (a unit arriving at the combat battlefield undesignated
 * gains its controller's designation at the next Cleanup), 323.6 (empty controlled battlefield in an Open
 * State with no showdown there → control lost), 466.3.a / 466.5.d (win → conquer), 144.4.c.1 / 323.13 /
 * 461 / 464.1 (a gank into an enemy battlefield in Neutral Open stages and begins a new combat).
 *
 * Expected: (a) not offered. (b) legal; Yi moves bfA→bfB, stays ready, becomes an ATTACKER in THIS combat
 * (one showdown, never two); Focus passes to P2; bfA (empty) stops being P1's. (c) 6+3 = 9 vs 5 → D dies,
 * Yi survives whatever P2 assigns (≤5 < 6), P1 conquers bfB (+1). (d) YES — new combat, Yi attacker, P1
 * on Focus. NO — onto his own battlefield it is a mere reposition: no showdown, and bfA is lost.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YI_HONED = "ogs-009-024";
const RIDE_THE_WIND = "ogn-173-298";

const showdownStack = (game: Game) => game.gameState.interaction?.showdownStack ?? [];
const topShowdown = (game: Game) => showdownStack(game).at(-1);
const bf = (game: Game, id: string) => game.gameState.battlefields[id];

/** P1's turn. bfA: P1 + ready Yi. bfB: P2 + D (5). P1 base: V (3). P1: 2 + [chaos], Ride the Wind. */
function board(opts: { bfBController?: typeof P1 | typeof P2 } = {}) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: opts.bfBController ?? P2 })
    .unit(P1, "bfA", YI_HONED, "yi")
    .unit(P1, "base", { might: 3, name: "Vanilla V" }, "v")
    .hand(P1, RIDE_THE_WIND, "rtw");
  return (opts.bfBController ?? P2) === P2 ? s.unit(P2, "bfB", { might: 5, name: "Defender D" }, "d") : s.unit(P1, "bfB", { might: 1, name: "Holder" }, "holder").unit(P2, "base", { might: 5, name: "Defender D" }, "d");
}

/** V attacks bfB: combat showdown opens with P1 (attacker) on Focus. */
async function vAttacks(game: Game): Promise<void> {
  await game.p1.move("v", "bfB");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(topShowdown(game)).toMatchObject({ active: true, battlefieldId: "bfB", isCombatShowdown: true });
  expect(game.state("v").combatRole).toBe("attacker");
  expect(game.state("d").combatRole).toBe("defender");
}

/**
 * With Focus, P1 casts Ride the Wind on Yi naming bfB, and the chain is resolved (P2 then P1 pass —
 * or whoever holds priority). The destination may be asked at play (355.4) or at resolution; both are
 * answered here.
 */
async function rideYiToBfB(game: Game): Promise<void> {
  await game.p1.cast("rtw", { targets: "yi" });
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toContain("battlefield-bfB"); // bf→bf destination offered
      await game.p1.pick("battlefield-bfB");
      continue;
    }
    if (game.chain().length === 0) {
      break;
    }
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Yi, Honed × Ride the Wind — joining an in-progress combat; Ganking grants no timing", () => {
  // ── (a) ───────────────────────────────────────────────────────────────────────────────────────
  test("(a) during the combat showdown at bfB, Yi's Ganking Standard Move bfA→bfB is NOT offered and is rejected (144.1.c, 810.1.c.3) — even though P1 holds Focus", async () => {
    const game = await board().build();
    // Sanity: in Neutral Open before the attack the gank IS on the menu.
    expect(game.p1.can("gank", "yi")).toBe(true);
    await vAttacks(game);
    expect(game.p1.can("gank", "yi")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "move" || o.verb === "gank")).toBe(false);
    expect((await game.p1.try((p) => p.gank("yi", "bfB"))).ok).toBe(false);
    expect(game.locationOf("yi")).toBe("bfA");
    // …but an Action spell is playable with Focus (347.1).
    expect(game.p1.can("cast", "rtw")).toBe(true);
  });

  // ── (b) ───────────────────────────────────────────────────────────────────────────────────────
  test("(b) Ride the Wind on Yi may name bfB (bf→bf is legal for an effect move, 449.1); on resolution Yi is at bfB, still ready, and P1 paid exactly 2 + [chaos]", async () => {
    const game = await board().build();
    await vAttacks(game);
    await rideYiToBfB(game);
    expect([game.p1.energy(), game.p1.power()]).toEqual([0, 0]);
    expect(game.locationOf("yi")).toBe("bfB");
    expect(game.state("yi").isReady).toBe(true);
  });

  test("(b) Yi JOINS the ongoing combat: he gains the Attacker designation at the following Cleanup (323.2.a / 464.2.c.3.a); there is still exactly ONE showdown, at bfB, and nothing new is staged", async () => {
    const game = await board().build();
    await vAttacks(game);
    await rideYiToBfB(game);
    expect(game.state("yi").combatRole).toBe("attacker");
    expect(game.state("v").combatRole).toBe("attacker");
    expect(game.state("d").combatRole).toBe("defender");
    expect(showdownStack(game).filter((s) => s.active)).toHaveLength(1);
    expect(topShowdown(game)).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: true });
    expect(bf(game, "bfB")).toMatchObject({ contested: true, controller: P2 });
  });

  test("(b) the chain P1 opened has closed → Focus passes to P2 (347.1.b): it is P2's showdown action decision", async () => {
    const game = await board().build();
    await vAttacks(game);
    await rideYiToBfB(game);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("passFocus")).toBe(true);
  });

  test("(b) bfA, now empty of P1's units with no showdown THERE, stops being P1's (323.6) — at the latest once the combat is over", async () => {
    const game = await board().build();
    await vAttacks(game);
    await rideYiToBfB(game);
    expect(game.cardsAt("bfA")).toEqual([]);
    await game.settle();
    expect(bf(game, "bfA")?.controller).not.toBe(P1);
  });

  test("(b) 323.6 timing: bfA is already uncontrolled in the Cleanup right after Ride the Wind resolves (a Showdown Open State is an Open State; the showdown is at bfB, not bfA)", async () => {
    const game = await board().build();
    await vAttacks(game);
    await rideYiToBfB(game);
    expect(bf(game, "bfA")?.controller).not.toBe(P1);
  });

  // ── (c) ───────────────────────────────────────────────────────────────────────────────────────
  test("(c) both pass → ONE damage step: attackers 6+3 = 9 into D (5) → D dies; Yi (6) survives any assignment of D's 5; P1 wins and conquers bfB (+1); no second combat follows", async () => {
    const game = await board().build();
    await vAttacks(game);
    await rideYiToBfB(game);
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.locationOf("yi")).toBe("bfB");
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(showdownStack(game).filter((s) => s.active)).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) P2 assigns D's 5 lethal-first: putting 3 on V (lethal) and 2 on Yi is legal → V dies, Yi lives and still conquers", async () => {
    const game = await board().build();
    await vAttacks(game);
    await rideYiToBfB(game);
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { v: 3, yi: 2 }, kind: "distribute" } : undefined)]);
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.state("yi")).toMatchObject({ zone: "battlefield-bfB" });
    expect(bf(game, "bfB")?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // ── (d) YES / NO contrast ─────────────────────────────────────────────────────────────────────
  test("(d-YES) no Ride the Wind: V dies to D; back in Neutral Open (P1's Main Phase) Yi's gank bfA→bfB IS offered and opens a brand-NEW combat with Yi attacking and P1 on Focus (144.4.c.1, 450, 323.13)", async () => {
    const game = await board().build();
    await vAttacks(game);
    await game.settle(); // 3 into 5: V dies, D holds
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.zoneOf("d")).toBe("battlefield-bfB");
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(showdownStack(game).filter((s) => s.active)).toHaveLength(0);

    expect(game.p1.can("gank", "yi")).toBe(true);
    await game.p1.gank("yi", "bfB");
    expect(game.locationOf("yi")).toBe("bfB");
    expect(bf(game, "bfB")).toMatchObject({ contested: true, contestedBy: P1 });
    expect(topShowdown(game)).toMatchObject({ active: true, battlefieldId: "bfB", isCombatShowdown: true });
    expect(game.state("yi").combatRole).toBe("attacker");
    expect(game.state("d").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // and it plays out as its own combat: 6 into 5 → D dies, Yi conquers.
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(bf(game, "bfB")?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("(d-NO) if bfB is already P1's, Yi ganking bfA→bfB applies no Contested (450) → no showdown, no combat — a mere reposition; bfA, left empty, is lost at that Cleanup (323.6)", async () => {
    const game = await board({ bfBController: P1 }).build();
    expect(game.p1.can("gank", "yi")).toBe(true);
    await game.p1.gank("yi", "bfB");
    expect(game.locationOf("yi")).toBe("bfB");
    expect(game.state("yi")).toMatchObject({ combatRole: null, isExhausted: true });
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P1 });
    expect(showdownStack(game).filter((s) => s.active)).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(bf(game, "bfA")?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });
});
