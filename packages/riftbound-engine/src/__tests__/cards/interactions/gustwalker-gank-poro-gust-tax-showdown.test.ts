/**
 * Interaction: Gustwalker (unl-075-219) · Unit · Mind · 3 · 3 Might
 *     "[Hunt 2] (When I conquer or hold, gain 2 XP.) [Level 3][>] I have +1 [Might] and [Ganking]."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · Reaction
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (+ a vanilla 3-Might unit V for P2; a Flurry of Blades ogn-133-298 in P2's hand only to probe P2's
 *    Reaction window against the Hunt trigger.)
 *
 * Question — judge line for the whole cluster. P1's turn, Neutral Open, P1 has 4 XP. P1 controls bfA with
 * a ready Gustwalker (Level 3 → 4 Might, Ganking). P2 holds bfB with Pouty Poro (2, Deflect) + V (3). P1
 * holds Gust.
 *   (a) NO side: at 2 XP is bfA→bfB offered at all?
 *   (b) YES side: Gustwalker ganks bfA→bfB — what does the single post-move Cleanup do (bfA control,
 *       Contested, Showdown/Combat), does any trigger (Hunt?) pend, who has Focus, when may P2 act?
 *   (c) P1 (Focus) Gusts the Poro at Reaction speed inside the combat showdown: does Deflect still tax
 *       it? Cost with {1 energy, 1 calm}? Targets with {1, 0}? Can P2 respond; where does Focus go?
 *   (d) Both pass: resolve combat; when does Hunt 2 pend, does P2 get a Reaction window against it,
 *       and is that before or after "combat ends"? Final XP?
 *
 * Rules: 824.1.d (Level inactive below N XP), 144.4.b / 144.4.c.1 / 810.1.b (bf→bf only with Ganking),
 * 144.2 (Standard Move exhausts), 319.8 + 323.6 / 323.8 / 323.9 / 323.13 (one Cleanup: lose empty bfA
 * in Open State, stage Showdown, stage Combat, begin it), 450, 464.2.c.1.a / 464.2.c.3 / 464.2.f.1
 * (attacker = who applied Contested, designations, no combat chain → state stays open), 823.1.b (Hunt is
 * a conquer/hold trigger, not a move trigger), 809.1.c / 809.1.c.1 / 809.1.d + 356.2.a.2 (Deflect =
 * mandatory extra Power of ANY domain, no timing exception), 355.16 / 358.5 (unaffordable target not
 * offered), 337.4 + 347.1.b (caster keeps priority; when the chain closes Focus passes on), 347.2.a,
 * 466.1 / 466.3.a / 466.5.d (kill, heal, winner conquers), 383.4.c.2.a, 466.6 (chain items from
 * establishing control resolve BEFORE 466.7 "combat ends" / 466.7.a designations removed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUSTWALKER = "unl-075-219";
const POUTY_PORO = "ogn-013-298";
const GUST = "ogn-169-298";
const FLURRY = "ogn-133-298";

interface BoardOpts {
  xp?: number;
  /** P1's pool; default exactly Gust's [1] + one calm for the Deflect pip. */
  pool?: { energy: number; power?: Record<string, number> };
}

/** P1's turn 2, Neutral Open. bfA: P1 + ready Gustwalker. bfB: P2 + Pouty Poro + vanilla V (3). */
function board(opts: BoardOpts = {}) {
  return scenario()
    .xp(P1, opts.xp ?? 4)
    .resources(P1, opts.pool ?? { energy: 1, power: { calm: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", GUSTWALKER, "gw")
    .unit(P2, "bfB", POUTY_PORO, "poro")
    .unit(P2, "bfB", { might: 3, name: "Vanilla V" }, "vee")
    .hand(P1, GUST, "gust")
    .hand(P2, FLURRY, "p2Flurry");
}

function castTargets(game: Game, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

async function ganked(opts: BoardOpts = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.gank("gw", "bfB");
  return game;
}

/** Gank, Gust the Poro, chain resolves (P1 then P2 pass priority). Focus is now P2's. */
async function poroGusted(): Promise<Game> {
  const game = await ganked();
  await game.p1.cast("gust", { targets: "poro" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

/** …then P2 and P1 pass Focus → damage step + Combat Cleanup + establish control; the Hunt trigger is pending. */
async function combatResolvedHuntPending(): Promise<Game> {
  const game = await poroGusted();
  await game.p2.passFocus();
  await game.p1.passFocus();
  return game;
}

describe("(a) NO side — 2 XP: Level 3 is inactive, no Ganking, bfA→bfB is not a legal Standard Move", () => {
  test("Gustwalker reads 3 Might with only [Hunt]; `gank` is not offered and neither is a standard move to bfB — only 'to base' (824.1.d, 144.4.b, 810.1.b)", async () => {
    const game = await board({ xp: 2 }).build();
    expect(game.state("gw")).toMatchObject({ isReady: true, might: 3 });
    expect(game.state("gw").keywords).toEqual(["Hunt"]);
    expect(game.p1.can("gank", "gw")).toBe(false);
    const moveKeys = game.p1.legal().filter((o) => o.verb === "move" || o.verb === "gank").map((o) => o.key);
    expect(moveKeys).toEqual(["standardMove:to:base"]);
    expect((await game.p1.try((p) => p.gank("gw", "bfB"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("gw", "bfB"))).ok).toBe(false);
    expect(game.locationOf("gw")).toBe("bfA");
    expect(game.state("gw").isReady).toBe(true);
  });

  test("contrast at 4 XP: 4 Might, [Ganking] granted, and bfB IS offered as a destination", async () => {
    const game = await board().build();
    expect(game.state("gw")).toMatchObject({ might: 4, staticMightBonus: 1 });
    expect(game.state("gw").keywords).toEqual(expect.arrayContaining(["Hunt", "Ganking"]));
    expect(game.p1.can("gank", "gw")).toBe(true);
    expect(game.p1.option("gank", "gw")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bfB"]);
  });
});

describe("(b) YES side — the gank and its single Cleanup", () => {
  test("Gustwalker exhausts (144.2) and is now at bfB; no chain was used", async () => {
    const game = await ganked();
    expect(game.state("gw")).toMatchObject({ isExhausted: true, location: "bfB", might: 4, zone: "battlefield-bfB" });
    expect(game.chain()).toEqual([]);
  });

  test("323.6: Open State and nothing left at bfA → P1 LOSES control of bfA (uncontrolled, not contested)", async () => {
    const game = await ganked();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
  });

  test("323.8 / 323.9 / 323.13: bfB is Contested BY P1 (still controlled by P2) and a COMBAT showdown has begun there: P1 = Attacker, P2 = Defender, all three units designated (450, 464.2.c.3)", async () => {
    const game = await ganked();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfB", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("gw").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("vee").combatRole).toBe("defender");
  });

  test("NO trigger pends — Hunt is a conquer/hold effect, not a move/attack trigger (823.1.b): empty chain, no combat chain, state open with P1 holding Focus (464.2.c.1.a / 464.2.f.1); XP still 4, no points", async () => {
    const game = await ganked();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.focusPlayer).toBe(P1);
    expect(game.p1.xp()).toBe(4);
    expect(game.p1.points()).toBe(0);
  });

  test("P2 cannot act yet: P2 has no legal action while P1 holds Focus with an empty chain; P2's first window is Focus after P1 passes (347.2.b)…", async () => {
    const game = await ganked();
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "p2Flurry")).toBe(false);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "p2Flurry")).toBe(true);
  });

  test("…or priority on a chain P1 starts (P1 casts Gust → after P1 passes priority, P2 may respond with a Reaction)", async () => {
    const game = await ganked();
    await game.p1.cast("gust", { targets: "poro" });
    expect(game.p2.legal()).toEqual([]); // 337.4: the caster holds priority first
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "p2Flurry")).toBe(true);
    expect(game.chain().map((i) => i.cardId)).toEqual(["gust"]);
  });
});

describe("(c) Gust at the Poro during the combat showdown — Deflect still taxes it", () => {
  test("with {1 energy, 1 calm}: both Poro and V are offered (Gustwalker, 4 Might, is not); choosing the Poro costs 1 energy + the calm — Deflect's pip is Power of ANY domain, Reaction timing / showdown notwithstanding (809.1.c.1, 809.1.d)", async () => {
    const game = await ganked();
    expect(castTargets(game, "gust")).toEqual(["poro", "vee"]);
    await game.p1.cast("gust", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", controller: P1, targets: ["poro"], triggered: false })]);
  });

  test("with {1 energy, 0 power}: the Poro is NOT offered / castable at it (unpayable mandatory cost, 355.16 / 358.5); V (3 ≤ 3, no Deflect) is, for exactly 1 energy", async () => {
    const game = await ganked({ pool: { energy: 1 } });
    expect(castTargets(game, "gust")).toEqual(["vee"]);
    expect((await game.p1.try((p) => p.cast("gust", { targets: "poro" }))).ok).toBe(false);
    expect(game.zoneOf("gust")).toBe("hand");
    await game.p1.cast("gust", { targets: "vee" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("P2 gets priority before Gust resolves; when both pass it resolves — Poro → P2's (owner's) hand — and as P1's chain closes Focus passes to P2 (347.1.b); combat still pending, V still defending", async () => {
    const game = await ganked();
    await game.p1.cast("gust", { targets: "poro" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("poro")).toBe("battlefield-bfB"); // not yet
    await game.p2.passPriority();
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p2.hand()).toContain("poro");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfB", focusPlayer: P2 });
    expect(game.p2.units("bfB")).toEqual(["vee"]);
    expect(game.state("vee").combatRole).toBe("defender");
  });
});

describe("(d) both pass → combat resolves; Hunt pends on the conquer and resolves BEFORE combat ends", () => {
  test("P2 passes, P1 passes → showdown ends (347.2.a) → damage: Gustwalker 4 into V 3 → V dies; Gustwalker took 3 < 4 and is healed to 0 (466.1)", async () => {
    const game = await combatResolvedHuntPending();
    expect(game.zoneOf("vee")).toBe("trash");
    expect(game.state("gw")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bfB" });
    expect((game.state("gw").meta as { lastDamage?: { amount: number; combat: boolean } }).lastDamage).toMatchObject({ amount: 3, combat: true });
  });

  test("P1 won (466.3.a) and established control = CONQUER: bfB is P1's, uncontested, P1 scores 1 (466.5.d) — and NOW, not earlier, Gustwalker's Hunt 2 is on the chain under P1 (383.4.c.2.a); XP still 4", async () => {
    const game = await combatResolvedHuntPending();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gw", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(4);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("466.6 before 466.7: while the Hunt trigger waits, combat has NOT ended — Gustwalker still carries its Attacker designation", async () => {
    const game = await combatResolvedHuntPending();
    expect(game.state("gw").combatRole).toBe("attacker");
  });

  test("P2 receives a Reaction window against the Hunt trigger (after P1 passes, P2 holds priority with the trigger still on the chain and may play a Reaction)", async () => {
    const game = await combatResolvedHuntPending();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gw", triggered: true })]);
    expect(game.p2.can("cast", "p2Flurry")).toBe(true);
    expect(game.p1.xp()).toBe(4);
  });

  test("P2 passes too → Hunt resolves: P1 XP 4 → 6, P2 0; THEN combat ends and designations clear (466.7.a); P1 is back in an open main phase holding bfB only", async () => {
    const game = await combatResolvedHuntPending();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(6);
    expect(game.p2.xp()).toBe(0);
    expect(game.state("gw")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, might: 4, zone: "battlefield-bfB" });
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active) ?? false).toBe(false);
    expect(game.p1.battlefields({ controlled: true })).toEqual(["bfB"]);
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.hand().sort()).toEqual(["p2Flurry", "poro"]);
    expect(game.violations()).toEqual([]);
  });

  test("alternative line: P1 Gusts V instead (no Deflect → the calm is kept); 4 vs Poro 2 → Poro dies, same conquer, same Hunt → 6 XP", async () => {
    const game = await ganked();
    await game.p1.cast("gust", { targets: "vee" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    await game.settle();
    expect(game.zoneOf("vee")).toBe("hand");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("gw")).toMatchObject({ damage: 0, zone: "battlefield-bfB" });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("negative space: no Gust at all — 4 vs 2+3 = 5: whichever defender P1 makes lethal, Gustwalker takes 5 ≥ 4 and dies; P2 keeps bfB, no conquer, no Hunt, XP stays 4", async () => {
    const game = await ganked();
    await game.settle();
    expect(game.zoneOf("gw")).toBe("trash");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p1.xp()).toBe(4);
  });
});
