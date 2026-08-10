/**
 * Interaction: Darius, Executioner (ogn-243-298) · Champion Unit · Order · 6 · 6 Might
 *     "[Legion] — When you play me, ready me. / Other friendly units have +1 [Might] here."
 *   × Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow][rainbow] · [Hidden]
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *      there. Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *
 * Question: P2 controls battlefield B with Darius (6) and a facedown Hostile Takeover. On P1's turn P1
 * moves vanilla A (4) and vanilla Bo (3) into B; the combat showdown opens (P1 attacker). P2 flips
 * Hostile Takeover for 0 targeting Bo.
 *   (a) Before the flip, did A or Bo get Darius's +1?
 *   (b) After it resolves: who controls Bo, is it readied, which side of the combat is it on, what is
 *       its Might — does Darius's aura switch on for it? Does A ever get the aura?
 *   (c) Combat damage: P1 assigns A's 4 — how much kills Bo, whose trash does Bo go to? What do the
 *       defenders deal to A?
 *   (d) If Bo survives, what happens to it at end of P1's turn (controller, location, damage, Might)?
 *
 * Rules: 740.1.a ("friendly" = shares a controller), 477.1.a (control change is a layer-1 trait change),
 * 811.1.b / 811.1.d.2 (facedown card played as a Reaction for 0; must target at THAT battlefield),
 * 190.4.b (battlefield control cannot change mid-combat), 323.2.b (a unit whose designation no longer
 * matches its controller swaps sides at the next cleanup), 465 (both sides assign combat damage
 * simultaneously; lethal = Might incl. passives), 323.5 / 056.2 / 127.1 (killed → OWNER's trash),
 * 317.1 + 455/456 (EOT: lose control, Recall to controller's base — not a Move), 317.2 (EOT heal),
 * 364 (passive abilities are continuously evaluated).
 *
 * Expected: (a) No — neither attacker is friendly to Darius: Bo 3, A 4. (b) Flip legal (targets offered:
 * A, Bo only). Bo → P2's, readied, becomes a Defender, 3+1 = 4 (aura now applies); A never gets it.
 * (c) Defenders deal 6+4 = 10 to A → A dies (P1's trash). Lethal for Bo is 4; all 4 on Bo kills it →
 * P1's trash (owner). 4 on Darius kills nothing. P2 keeps B, no points either way. (d) Bo survives →
 * at EOT reverts to P1, recalled to P1's base, 0 damage, plain 3 again.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-243-298";
const HOSTILE_TAKEOVER = "sfd-202-221";

/** P1's turn 2. bfB: P2's Darius (6) + P2's facedown Hostile Takeover. P1: A (4) and Bo (3) in base. bfC: empty, uncontrolled. */
function board(opts: { autoProcedures?: boolean } = {}) {
  return scenario()
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P2, "bfB", DARIUS, "darius")
    .facedown(P2, "bfB", HOSTILE_TAKEOVER, "ht")
    .unit(P1, "base", { might: 4, name: "Vanilla A" }, "A")
    .unit(P1, "base", { might: 3, name: "Vanilla Bo" }, "Bo")
    .autoProcedures(opts.autoProcedures ?? true);
}

/** A + Bo attack bfB; P1 (attacker, Focus first) passes Focus → P2 holds Focus with the flip available. */
async function atP2Focus(opts: { autoProcedures?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.move(["A", "Bo"], "bfB");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

/** …P2 flips Hostile Takeover choosing Bo, and both pass so that exactly HT resolves. */
async function flippedOnBo(opts: { autoProcedures?: boolean } = {}): Promise<Game> {
  const game = await atP2Focus(opts);
  await game.p2.reveal("ht");
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("Bo");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ht", controller: P2, targets: ["Bo"] })]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("ht")).toBe("trash");
  return game;
}

describe("Darius, Executioner × facedown Hostile Takeover mid-combat — the aura follows control", () => {
  // ---- (a) before the flip --------------------------------------------------------------------------

  test("(a) after the move, before any flip: A and Bo are P1's attackers at bfB and get NO +1 from P2's Darius — 'friendly' means same controller (740.1.a): Bo 3, A 4, Darius 6", async () => {
    const game = await board().build();
    await game.p1.move(["A", "Bo"], "bfB");
    expect(game.state("A")).toMatchObject({ combatRole: "attacker", controller: P1, location: "bfB", might: 4, staticMightBonus: 0 });
    expect(game.state("Bo")).toMatchObject({ combatRole: "attacker", controller: P1, location: "bfB", might: 3, staticMightBonus: 0 });
    expect(game.state("darius")).toMatchObject({ combatRole: "defender", controller: P2, might: 6 }); // "Other" — never pumps himself
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  // ---- (b) the flip and its resolution ---------------------------------------------------------------

  test("(b) the flip is legal once P2 holds Focus: played from facedown for 0 (811.1.b) at a battlefield P2 still controls mid-combat (190.4.b); only the enemy units AT bfB — A and Bo — are offered (811.1.d.2), never Darius", async () => {
    const game = await atP2Focus();
    expect(game.p2.can("reveal", "ht")).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.p2.reveal("ht");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // paid nothing
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect((d as { options: { card?: string }[] }).options.map((o) => o.card).sort()).toEqual(["A", "Bo"]);
    await game.p2.pick("Bo");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ht", controller: P2, targets: ["Bo"], triggered: false })]);
  });

  test("(b) while P1 still holds Focus and no chain exists, P2 has nothing to play — the facedown Reaction needs Focus or a chain to respond to", async () => {
    const game = await board().build();
    await game.p1.move(["A", "Bo"], "bfB");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("reveal", "ht")).toBe(false);
  });

  test("(b) HT resolves: Bo is P2-controlled (owner still P1), READIED (it was exhausted by the move), still at bfB, and has swapped to the DEFENDING side (477.1.a, 323.2.b)", async () => {
    const game = await board().build();
    await game.p1.move(["A", "Bo"], "bfB");
    expect(game.state("Bo").isExhausted).toBe(true); // the Standard Move exhausted it
    await game.p1.passFocus();
    await game.p2.reveal("ht");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("Bo");
    }
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("Bo")).toMatchObject({ combatRole: "defender", controller: P2, isReady: true, location: "bfB", owner: P1, zone: "battlefield-bfB" });
    expect(game.state("A")).toMatchObject({ combatRole: "attacker", controller: P1 });
    expect(game.state("darius")).toMatchObject({ combatRole: "defender", controller: P2 });
    // The showdown continues — Focus passes back to P1.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, controller: P2 });
  });

  test("(b) Darius's aura is continuously evaluated (364): Bo now shares a controller with Darius and is 'here' → 3 + 1 = 4; A is still P1's → stays 4; Darius stays 6", async () => {
    const game = await flippedOnBo();
    expect(game.state("Bo")).toMatchObject({ baseMight: 3, might: 4, staticMightBonus: 1 });
    expect(game.state("A")).toMatchObject({ baseMight: 4, might: 4, staticMightBonus: 0 });
    expect(game.state("darius").might).toBe(6);
  });

  // ---- (c) combat damage ---------------------------------------------------------------------------------

  test("(c) P1's assignment prompt: 4 damage to distribute over Darius (lethal at 6) and Bo (lethal at 4 — the aura counts, not the printed 3) (465)", async () => {
    const game = await flippedOnBo({ autoProcedures: false });
    await game.settle(); // both pass Focus → combat resolution is offered as a procedure
    await game.acting().choose("resolveFullCombat:bfB");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
    const buckets = (d as { buckets: { key: string; lethal?: number }[] }).buckets;
    expect(Object.fromEntries(buckets.map((b) => [b.key, b.lethal]))).toEqual({ Bo: 4, darius: 6 });
    // 3 on Bo is no longer lethal, so P1 may not move on to Darius after only 3 (465.2.c).
    expect((await game.p1.try((p) => p.distribute({ Bo: 3, darius: 1 }))).ok).toBe(false);
  });

  test("(c) P1 puts all 4 on Bo: Bo (4 ≥ 4) is killed and goes to its OWNER's trash — P1's, although P2 controlled it (323.5, 056.2); the defenders' 6 + 4 = 10 kill A (P1's trash); Darius unhurt; P2 keeps bfB, nobody scores", async () => {
    const game = await flippedOnBo();
    game.script(P1, [{ allocation: { Bo: 4 }, kind: "distribute" }]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("Bo")).toBe("trash");
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["A", "Bo"]);
    expect(game.p2.trash()).toEqual(["ht"]); // only the resolved spell — Bo is NOT here
    expect(game.state("darius")).toMatchObject({ damage: 0, location: "bfB", zone: "battlefield-bfB" });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) alternatively all 4 on Darius: not lethal (4 < 6) — nothing of P2's dies, A still dies to 10; Bo stays at bfB as P2's ready 4-Might unit; P2 keeps bfB, no points", async () => {
    const game = await flippedOnBo();
    game.script(P1, [{ allocation: { darius: 4 }, kind: "distribute" }]);
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.p1.trash()).toEqual(["A"]);
    expect(game.zoneOf("darius")).toBe("battlefield-bfB");
    expect(game.state("Bo")).toMatchObject({ controller: P2, isReady: true, location: "bfB", might: 4, owner: P1 });
    expect(game.p2.units("bfB").sort()).toEqual(["Bo", "darius"]);
    expect(game.p1.units("bfB")).toEqual([]);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  // ---- (d) end of turn --------------------------------------------------------------------------------

  test("(d) Bo survived → at end of P1's turn HT's rider ends P2's control and recalls Bo to P1's base (317.1, 455/456 — not a Move): controller P1, 0 damage, and without Darius's aura a plain 3 again", async () => {
    const game = await flippedOnBo();
    game.script(P1, [{ allocation: { darius: 4 }, kind: "distribute" }]);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("Bo")).toMatchObject({ controller: P1, damage: 0, location: "base", might: 3, owner: P1, staticMightBonus: 0, zone: "base" });
    expect(game.p1.base()).toContain("Bo");
    expect(game.p2.base()).not.toContain("Bo");
    expect(game.p2.units("bfB")).toEqual(["darius"]);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(1); // P2 kept bfB and Holds it in P2's Beginning Phase
    expect(game.violations()).toEqual([]);
  });

  // ---- contrast: no flip ----------------------------------------------------------------------------------

  test("contrast — P2 never flips: attackers 4 + 3 = 7 ≥ 6 kill Darius; Darius's 6 must go somewhere lethal-first; P1 conquers bfB (+1) and the still-facedown HT is trashed at cleanup (323.7)", async () => {
    const game = await board().build();
    await game.p1.move(["A", "Bo"], "bfB");
    await game.settle();
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["darius", "ht"]);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("bfB").length).toBeGreaterThanOrEqual(1); // 6 damage kills at most one of A (4) / Bo (3) lethal-first
  });
});
