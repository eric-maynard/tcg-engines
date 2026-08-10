/**
 * Interaction: Kato the Arm (sfd-112-221) × Vault Breaker (unl-010-219) × Pouty Poro (ogn-013-298)
 *
 *   Kato the Arm — Unit · Body · 4 + [body] · 3 Might
 *     "[Deflect] When I move to a battlefield, give another friendly unit my keywords and +[Might] equal to
 *      my Might this turn."                                             — P1, ready at bfA
 *   Vault Breaker — Spell [Action] · Fury · 1 + [fury]
 *     "Give a unit [Assault 2] and [Ganking] this turn."               — in P1's hand
 *   Pouty Poro — Unit · Fury · 2 · 2 Might · "[Deflect]"              — P1, ready at bfA
 *   D — vanilla 4-Might unit holding bfB for P2; Sentry — vanilla 1 at P2's bfC; Hextech Ray (ogn-009-298,
 *   [Action] 1 + [fury] "Deal 3 to a unit at a battlefield") in P2's hand as the Deflect price probe.
 *
 * Rules: 144.1.a / 144.2 (Standard Move: main phase, exhaust), 144.4.b + 144.4.c.1 / 810.1.b-c (bf → bf only
 * with Ganking; otherwise bf → base), 810.2 (extra Ganking redundant), 809.1.c (Deflect taxes only OPPONENTS'
 * choices), 809.2 (granted Deflect sums with existing Deflect), 319.8 / 450 (move Cleanup applies Contested),
 * 323.8 / 323.9 / 323.13 / 460 (showdown + combat are staged but begin only once the chain is empty), 464.2.c.3
 * (Attacker designation is assigned when combat opens), 807.1.c-d (Assault counts only while an attacker),
 * 466.5.d (winner with no defender left conquers), 144.1.a again for the Poro's later gank; "this turn" expiry.
 *
 * Question: (a) can Kato gank before the spell / does walking home trigger him? (b) Vault Breaker on own
 * Deflect unit — surcharge? (c) gank bfA→bfB: order of Contested, trigger, P2's window, combat start; does the
 * trigger copy 3 or 5? (d) what does the Poro end up with, and what does P2's Hextech Ray at it cost now?
 * (e) combat result at bfB. (f) can the ready Poro then gank, and what survives the end of turn?
 *
 * Expected: (a) no bf→bf move offered; bf→base legal, no trigger. (b) 1 + fury flat; Kato: Assault 2 + Ganking
 * this turn, still 3 at rest. (c) Kato exhausts, is at bfB; bfB Contested by P1; his trigger (→ Poro, free) is
 * on the chain BEFORE any showdown; Kato is not yet an attacker → copies 3; P2 gets priority (Reactions only);
 * after it resolves combat opens with P1's Focus and Kato 3+2 = 5. (d) Poro 5 Might, Deflect 1+1 = 2, Assault 2,
 * Ganking; Hextech Ray at it costs 1 + fury + 2 any-domain (1 extra is not enough — though it is for Kato).
 * (e) 5 ≥ 4 kills D, 4 < 5 Kato lives healed, P1 conquers bfB +1. (f) yes: gank to bfB (own → no showdown) or
 * bfC (combat, 5+2 = 7 kills the Sentry, second conquer); at end of turn Poro is 2 / Deflect only, Kato 3 /
 * Deflect only, and next turn neither can gank.
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KATO = "sfd-112-221";
const VAULT_BREAKER = "unl-010-219";
const POUTY_PORO = "ogn-013-298";
const HEXTECH_RAY = "ogn-009-298";

/**
 * P1's turn 2, Neutral Open. P1: bfA with Kato + Pouty Poro (both ready); exactly 1 energy + 1 fury (Vault
 * Breaker's cost) — nothing spare for any surcharge. P2: D (4) holds bfB, Sentry (1) holds bfC; Hextech Ray in
 * hand with 1 energy + 1 fury + `spare` calm power for Deflect surcharges.
 */
function board(spare = 2) {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { calm: spare, fury: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: P2 })
    .unit(P1, "bfA", KATO, "kato")
    .unit(P1, "bfA", POUTY_PORO, "poro")
    .unit(P2, "bfB", { might: 4, name: "Defender D" }, "dee")
    .unit(P2, "bfC", { might: 1, name: "Sentry" }, "sentry")
    .hand(P1, VAULT_BREAKER, "vb")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** (b) done: Vault Breaker resolved on Kato, back in Neutral Open. */
async function vaultBroken(spare = 2): Promise<Game> {
  const game = await board(spare).build();
  await game.p1.cast("vb", { targets: "kato" });
  const s = await game.settle();
  expect(s.reason).toBe("open");
  return game;
}

/** (c) step 1: Kato ganks bfA → bfB; his trigger names the Poro (the only other friendly unit — bound or picked). */
async function ganked(spare = 2): Promise<Game> {
  const game = await vaultBroken(spare);
  await game.p1.gank("kato", "bfB");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("poro");
  }
  return game;
}

/** (c) step 2: both pass on the trigger → it resolves → the staged combat opens (P1 has Focus). */
async function combatOpen(spare = 2): Promise<Game> {
  const game = await ganked(spare);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** (e): the whole combat settled, back in P1's open main phase. */
async function afterCombat(): Promise<Game> {
  const game = await ganked();
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

const rayTargets = (game: Game) => (game.p2.option("cast", "ray")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];

describe("(a) NO side — without Ganking Kato cannot go battlefield → battlefield; walking home does not trigger him", () => {
  test("before the spell: no gank option, no 'move → bfB/bfC'; the only Standard Move destination from bfA is base (144.4.b)", async () => {
    const game = await board().build();
    expect(game.p1.can("gank", "kato")).toBe(false);
    const moves = game.p1.legal().filter((o) => o.verb === "move" || o.verb === "gank").map((o) => o.key);
    expect(moves).toEqual(["standardMove:to:base"]);
    await expect(game.p1.move("kato", "bfB")).rejects.toThrow();
    expect(game.locationOf("kato")).toBe("bfA");
    expect(game.state("kato").isReady).toBe(true);
  });

  test("bfA → base is legal, exhausts him, and 'When I move to a BATTLEFIELD' does NOT trigger: empty chain, Poro untouched, still Neutral Open", async () => {
    const game = await board().build();
    await game.p1.move("kato", "base");
    expect(game.locationOf("kato")).toBe("base");
    expect(game.state("kato").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("poro")).toMatchObject({ grantedKeywords: [], might: 2 });
  });
});

describe("(b) Vault Breaker on P1's own Deflect unit", () => {
  test("both of P1's Deflect units are offered and Kato is chosen for exactly 1 + [fury] — no Deflect surcharge for your own unit (809.1.c)", async () => {
    const game = await board().build();
    const offered = (game.p1.option("cast", "vb")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(expect.arrayContaining(["kato", "poro"]));
    await game.p1.cast("vb", { targets: "kato" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("vb")).toBe("trash");
  });

  test("Kato now has Assault 2 and Ganking (this turn) on top of printed Deflect; at rest he is still 3 Might; gank to bfB / bfC is now on the menu", async () => {
    const game = await vaultBroken();
    expect(game.state("kato").grantedKeywords).toEqual([
      { duration: "turn", keyword: "Assault", value: 2 },
      expect.objectContaining({ duration: "turn", keyword: "Ganking" }),
    ]);
    expect(game.state("kato").keywords).toEqual(expect.arrayContaining(["Deflect", "Assault", "Ganking"]));
    expect(game.state("kato")).toMatchObject({ combatRole: null, might: 3 });
    expect(game.p1.can("gank", "kato")).toBe(true);
    expect(game.p1.option("gank", "kato")?.fields.find((f) => f.name === "toBattlefield")?.options).toEqual(["bfB", "bfC"]);
    expect(game.p1.can("gank", "poro")).toBe(false); // the Poro got nothing yet
  });
});

describe("(c) the gank bfA → bfB: Cleanup, trigger, response window, then combat", () => {
  test("immediately after the move: Kato is EXHAUSTED at bfB (144.2); bfB is Contested by P1 but still P2's (450); Poro stayed, so bfA is still P1's", async () => {
    const game = await ganked();
    expect(game.locationOf("kato")).toBe("bfB");
    expect(game.state("kato").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.locationOf("poro")).toBe("bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
  });

  test("Kato's move trigger is on the chain (→ Poro, chosen for free despite Poro's Deflect — P1's own ability) and P1 holds CHAIN priority; no showdown has begun yet (323.13 / 460)", async () => {
    const game = await ganked();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kato", controller: P1, targets: ["poro"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1, source: { cardId: "kato" } });
    expect((game.decision() as ActionDecision).context).not.toBe("showdown");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // nothing was charged for choosing the Poro
  });

  test("Kato is NOT yet an Attacker while his trigger is pending (464.2.c.3): combatRole null, Might 3 — Assault is not live (807.1.c/d)", async () => {
    const game = await ganked();
    expect(game.state("kato")).toMatchObject({ combatRole: null, might: 3 });
    expect(game.state("dee").combatRole).toBeNull();
  });

  test("P1 passes → P2 receives priority on the trigger; P2's Hextech Ray ([Action]) is NOT playable there (no showdown, not a Reaction) — only pass; the Poro is still 2", async () => {
    const game = await ganked();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ray")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    expect(game.state("poro").might).toBe(2);
  });

  test("P2 passes → the trigger resolves copying Kato's CURRENT 3 (not 5): Poro 2 + 3 = 5; only THEN does combat open at bfB — P1 is the Attacker with Focus, empty chain, Kato now attacker at 3 + 2 = 5", async () => {
    const game = await combatOpen();
    expect(game.state("poro").might).toBe(5);
    expect(game.state("poro").might).not.toBe(7);
    expect(game.chain()).toEqual([]);
    expect(game.state("kato")).toMatchObject({ combatRole: "attacker", might: 5 });
    expect(game.state("dee")).toMatchObject({ combatRole: "defender", might: 4 });
    expect(game.state("poro").combatRole).toBeNull(); // back at bfA, not in this combat
  });
});

describe("(d) what the Poro is holding this turn, and the Deflect bill for P2", () => {
  test("Poro: 5 Might; granted Deflect 1 (on top of its printed Deflect 1), Assault 2, Ganking — all 'this turn'", async () => {
    const game = await combatOpen();
    expect(game.state("poro").might).toBe(5);
    expect(game.state("poro").grantedKeywords).toEqual(
      expect.arrayContaining([
        { duration: "turn", keyword: "Deflect", value: 1 },
        { duration: "turn", keyword: "Assault", value: 2 },
        expect.objectContaining({ duration: "turn", keyword: "Ganking" }),
      ]),
    );
    expect(game.state("poro").grantedKeywords).toHaveLength(3);
    expect(game.state("poro").keywords).toEqual(expect.arrayContaining(["Deflect", "Assault", "Ganking"]));
    expect(game.state("poro").keywords).not.toContain("$self-keywords");
  });

  test("809.2 — Deflect 1 + 1 = Deflect 2: in the showdown P2 (1 + fury + ONE spare power) may Hextech Ray Kato (Deflect 1) or its own units but NOT the Poro", async () => {
    const game = await combatOpen(1);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ray")).toBe(true);
    const offered = rayTargets(game);
    expect(offered).toEqual(expect.arrayContaining(["kato", "dee", "sentry"]));
    expect(offered).not.toContain("poro");
    expect((await game.p2.try((p) => p.cast("ray", { targets: "poro" }))).ok).toBe(false);
    expect(game.zoneOf("ray")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1, fury: 1 } });
  });

  test("…with TWO spare power the Poro is a legal Ray target and casting it drains 1 energy + fury + both spare power (1 + [fury] + 2 any-domain)", async () => {
    const game = await combatOpen(2);
    await game.p1.passFocus();
    expect(rayTargets(game)).toContain("poro");
    await game.p2.cast("ray", { targets: "poro" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2 })]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    // 3 damage on a 5-Might Poro this turn: it lives.
    expect(game.state("poro")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bfA" });
  });
});

describe("(e) combat at bfB", () => {
  test("Kato fights at 5 (3 + Assault 2 as attacker) vs D 4: D dies, Kato takes 4 < 5 and survives healed; P1 establishes control and CONQUERS bfB (+1) (466.5.d)", async () => {
    const game = await afterCombat();
    expect(game.zoneOf("dee")).toBe("trash");
    expect(game.state("kato")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, zone: "battlefield-bfB" });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    const toKato = (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === "kato").reduce((s, r) => s + r.amount, 0);
    expect(toKato).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("the Poro took no part: still ready at bfA with its 5 Might and borrowed keywords; bfA still P1's", async () => {
    const game = await afterCombat();
    expect(game.state("poro")).toMatchObject({ damage: 0, isReady: true, might: 5, zone: "battlefield-bfA" });
    expect(game.state("poro").keywords).toEqual(expect.arrayContaining(["Deflect", "Assault", "Ganking"]));
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
  });
});

describe("(f) after combat, still P1's Main Phase: the ready Poro's borrowed Ganking, and end-of-turn expiry", () => {
  test("the Poro may now gank from bfA to bfB (P1's) or bfC (enemy) — both are offered Standard Move destinations (144.1.a, 810.1.b); the exhausted Kato has no move", async () => {
    const game = await afterCombat();
    expect(game.p1.can("gank", "poro")).toBe(true);
    expect(game.p1.option("gank", "poro")?.fields.find((f) => f.name === "toBattlefield")?.options).toEqual(["bfB", "bfC"]);
    expect(game.p1.can("gank", "kato")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "move" && o.fields.some((f) => (f.options ?? []).flat().includes("kato")))).toBe(false);
  });

  test("gank bfA → bfB (now P1's own): the Poro joins Kato, exhausted; no Contested, no showdown, no combat — straight back to Neutral Open; bfA left empty is no longer held", async () => {
    const game = await afterCombat();
    await game.p1.gank("poro", "bfB");
    expect(game.locationOf("poro")).toBe("bfB");
    expect(game.state("poro").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.units("bfB").sort()).toEqual(["kato", "poro"]);
    expect(game.gameState.battlefields.bfA?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(1);
  });

  test("gank bfA → bfC (enemy): new Contested → new combat; the Poro attacks at 5 + Assault 2 = 7, kills the Sentry, survives 1, and P1 conquers a SECOND battlefield this turn (+1 → 2)", async () => {
    const game = await afterCombat();
    await game.p1.gank("poro", "bfC");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.chain()).toEqual([]); // the Poro has no move trigger of its own
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("poro")).toMatchObject({ combatRole: "attacker", might: 7 });
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 0, zone: "battlefield-bfC" });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("end of turn: every 'this turn' grant expires — Poro back to 2 Might with printed Deflect only (no Ganking/Assault/extra Deflect), Kato back to 3 with Deflect only", async () => {
    const game = await afterCombat();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("poro")).toMatchObject({ grantedKeywords: [], keywords: ["Deflect"], might: 2, mightModifier: 0 });
    expect(game.state("kato")).toMatchObject({ grantedKeywords: [], keywords: ["Deflect"], might: 3 });
    expect(game.trace().expiration.flatMap((p) => p.expired)).toEqual(expect.arrayContaining([expect.stringContaining("poro"), expect.stringContaining("kato")]));
  });

  test("…and on P1's next turn neither the (readied) Poro nor Kato may move battlefield → battlefield any more", async () => {
    const game = await afterCombat();
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.state("poro").isReady).toBe(true);
    expect(game.state("kato").isReady).toBe(true);
    expect(game.p1.can("gank", "poro")).toBe(false);
    expect(game.p1.can("gank", "kato")).toBe(false);
    expect(game.p1.legal().filter((o) => o.verb === "move").map((o) => o.key)).toEqual(["standardMove:to:base"]);
  });
});
