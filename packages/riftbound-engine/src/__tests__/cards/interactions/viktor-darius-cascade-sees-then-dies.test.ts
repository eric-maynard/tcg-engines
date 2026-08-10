/**
 * Interaction: a trigger created INSIDE a Cleanup cascade whose source dies in the NEXT cascaded Cleanup.
 *   × Viktor, Leader (ogn-246-298) · Champion Unit · Order · 4 · 4 Might
 *     "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *   × Darius, Executioner (ogn-243-298) · Champion Unit · Order · 6 · 6 Might
 *     "[Legion] — When you play me, ready me. Other friendly units have +1 [Might] here."
 *   × Falling Star (ogn-029-298) · Spell · Fury · 2+[fury][fury] · Action — "Deal 3 to a unit. Deal 3 to a unit."
 *
 * Rules: 319.5 (Cleanup after an item leaves the chain), 323.5 (lethal units are killed together in step 3b), 383.2.c
 * (trigger conditions are evaluated right after the inciting event is processed — Viktor is still on the board when
 * Darius's death is processed), 320.1 (during a Cleanup pending items may be ADDED but nothing is finalized/resolved and
 * no priority is given), 319.6 + 322 / 322.1 (Darius leaving the board makes a NEW Cleanup outstanding; the aura is
 * gone in it → Viktor is now lethal and dies there), 383.2.c.2 (a unit that leaves the board in the SAME game action as
 * the inciting event cannot evaluate its trigger — Viktor is the rule's own example), 337.4 (the item's controller gets
 * priority first), 355.9.c (an ability is a separate object from its source — it resolves with the source in the trash).
 *
 * Question — P2's turn; P1 controls Darius and Viktor together at bf1; Viktor already carries 4 damage (alive only
 * because Darius makes him 5):
 *   (a) SEQUENTIAL: P2's Falling Star puts both 3s into the undamaged Darius (6 → lethal). C1 kills Darius; the aura
 *       drops; the cascaded C2 kills Viktor (4/4). Did Viktor trigger off Darius's death? When is the item finalized,
 *       and does it still make a Recruit with Viktor in the trash? Does Viktor trigger off his own death?
 *   (b) SIMULTANEOUS: Darius pre-damaged 3, Viktor 4; Falling Star deals 3 to each → both lethal in the SAME Cleanup.
 *
 * Expected: (a) yes — exactly ONE Viktor item (off Darius, not himself), pending through C1/C2, finalized after the
 * cascade with Viktor already in the trash; P1 gets priority first; it resolves and P1 gets one 1-Might Recruit token
 * in base. Darius + Viktor in P1's trash (Darius first). No ordering prompt (only P1 has a trigger). (b) both die in one
 * game action → Viktor cannot evaluate → NO item, NO Recruit.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR = "ogn-246-298";
const DARIUS = "ogn-243-298";
const FALLING_STAR = "ogn-029-298";

/**
 * Turn 3, P2 active (Neutral Open). bf1: P1's — Darius (6, `dariusDamage` marked) and Viktor (4 +1 from Darius = 5,
 * 4 damage marked). P2: exactly 2 energy + 2 fury and Falling Star in hand. P1's base starts empty.
 */
function board(dariusDamage: number) {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DARIUS, "darius", dariusDamage > 0 ? { damage: dariusDamage } : undefined)
    .unit(P1, "bf1", VIKTOR, "vik", { damage: 4 })
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .hand(P2, FALLING_STAR, "star");
}

const recruitsOf = (game: Game) => game.p1.base().filter((id) => game.state(id).isToken && game.state(id).name.startsWith("Recruit"));
const viktorItem = expect.objectContaining({ cardId: "vik", controller: P1, name: "Viktor, Leader", triggered: true, type: "ability" });

/** P2 casts Falling Star with the given two targets; P2 then P1 pass → it resolves and leaves the chain → Cleanup(s). */
async function starResolves(dariusDamage: number, targets: [string, string]): Promise<{ game: Game; lastPass: Awaited<ReturnType<Game["p1"]["passPriority"]>> }> {
  const game = await board(dariusDamage).build();
  await game.p2.cast("star", { targets });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P2, targets, triggered: false })]);
  await game.p2.passPriority();
  const lastPass = await game.p1.passPriority();
  expect(game.zoneOf("star")).toBe("trash");
  return { game, lastPass };
}

describe("setup — Darius's aura is what keeps the 4-damage Viktor alive", () => {
  test("Darius 6 (undamaged), Viktor 4 +1 here = 5 carrying 4 damage — alive; Falling Star may put both 3s into Darius ([darius, darius] is an offered target tuple)", async () => {
    const game = await board(0).build();
    expect(game.state("darius")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bf1" });
    expect(game.state("vik")).toMatchObject({ baseMight: 4, damage: 4, might: 5, zone: "battlefield-bf1" });
    const tuples = game.p2.option("cast", "star")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(tuples).toContainEqual(["darius", "darius"]);
    expect(tuples).toContainEqual(["darius", "vik"]);
    expect(recruitsOf(game)).toEqual([]);
  });
});

describe("(a) SEQUENTIAL — 6 into Darius: Darius dies in C1, Viktor in the cascaded C2, and Viktor's trigger (seen in C1) survives him", () => {
  test("right after P1's pass BOTH are in P1's trash — Darius first (C1), Viktor after him (C2) — before anyone is asked anything; the only move executed was the pass (320.1, 322)", async () => {
    const { game, lastPass } = await starResolves(0, ["darius", "darius"]);
    expect(lastPass.executed.filter((m) => m.auto !== true).map((m) => m.moveId)).toEqual(["passChainPriority"]);
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.zoneOf("vik")).toBe("trash");
    const trash = game.p1.trash();
    expect(trash.indexOf("darius")).toBeGreaterThanOrEqual(0);
    expect(trash.indexOf("vik")).toBeGreaterThan(trash.indexOf("darius"));
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("exactly ONE Viktor item is on the chain: triggered off DARIUS's death (383.2.c — Viktor was on the board when it was processed), none off his own ('another'); it is already FINALIZED although its source is in the trash, and no Recruit exists yet (nothing resolved inside the Cleanups)", async () => {
    const { game } = await starResolves(0, ["darius", "darius"]);
    expect(game.chain()).toEqual([viktorItem]);
    const raw = game.gameState.interaction?.chain?.items ?? [];
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ cardId: "vik", controller: P1, status: "finalized", triggered: true, triggerEvent: { cardId: "darius", type: "die" } });
    expect(game.zoneOf("vik")).toBe("trash"); // source.zone === trash at FIN
    expect(recruitsOf(game)).toEqual([]);
  });

  test("priority: P1 — the item's controller — is asked first although it is P2's turn (337.4), then P2; no ordering prompt for anyone (only P1 has a trigger, and only one)", async () => {
    const { game, lastPass } = await starResolves(0, ["darius", "darius"]);
    expect(lastPass.decision).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(lastPass.decision?.kind).not.toBe("order");
    expect(game.gameState.pendingTriggerOrder).toBeUndefined();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("it resolves with Viktor in the trash (355.9.c): P1 gets exactly ONE 1-Might Recruit unit token in base; net board = Darius + Viktor in trash, 1 Recruit; bf1 (empty) no longer P1's; back to P2's Neutral Open main phase", async () => {
    const { game } = await starResolves(0, ["darius", "darius"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Viktor item resolves
    expect(game.zoneOf("vik")).toBe("trash"); // source.zone === trash at RES too
    const recruits = recruitsOf(game);
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ controller: P1, isToken: true, might: 1, owner: P1, zone: "base" });
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["darius", "vik"]));
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) SIMULTANEOUS — 3 to each pre-damaged champion: both lethal in the SAME Cleanup → Viktor cannot evaluate (383.2.c.2)", () => {
  test("premise: Darius 6 carrying 3, Viktor 5 carrying 4 — one more 3 each is lethal for both in C1", async () => {
    const game = await board(3).build();
    expect(game.state("darius")).toMatchObject({ damage: 3, might: 6 });
    expect(game.state("vik")).toMatchObject({ damage: 4, might: 5 });
  });

  test("after Falling Star [darius, vik] resolves both are in P1's trash and NOTHING is on the chain — zero Viktor items; the next decision is P2's plain main-phase menu", async () => {
    const { game, lastPass } = await starResolves(3, ["darius", "vik"]);
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.zoneOf("vik")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.chain?.items ?? []).toEqual([]);
    expect(lastPass.decision).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("no Recruit is ever made: settling changes nothing — P1's base stays empty, bf1 uncontrolled, no violations", async () => {
    const { game } = await starResolves(3, ["darius", "vik"]);
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(recruitsOf(game)).toEqual([]);
    expect(game.p1.base()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});
