/**
 * Interaction: Kato the Arm (sfd-112-221) × Stupefy (ogn-095-298) × Gust (ogn-169-298)
 *
 *   Kato the Arm — Unit · Body · 4 + [body] · 3 Might
 *     "[Deflect] When I move to a battlefield, give another friendly unit my keywords and +[Might] equal to my
 *      Might this turn."                                                        — P1, ready in P1's base
 *   F — vanilla 2-Might friendly unit                                            — P1, in P1's base (NOT at bf1)
 *   Stupefy — Spell [Reaction] · Mind · 1 · "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   Gust    — Spell [Reaction] · Chaos · 1 · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *                                                                                — both in P2's hand
 *   Holder — vanilla 2-Might P2 unit holding bf1 for P2.
 *
 * Rules: 144 / 319.8 (a Standard Move is not a chain item; its Cleanup applies Contested and queues the move
 * trigger), 402.2 ("another friendly unit" is a target chosen at finalization — anywhere on the board), 809.1.c
 * (Deflect taxes only OPPONENTS choosing Kato: +1 power of any domain), 323.9 / 323.13 (the staged combat at
 * bf1 cannot open while the chain is non-empty), 355.9.c (an ability and its source are separate objects —
 * removing Kato does not counter his ability), 124 (Kato in hand is a new object), 359.3.e.12 (information
 * about a permanent that changed to a non-board zone reads NULL and calculations on it are ignored) vs.
 * 359.3.e.12.a (still on the board → current information is read), 808.1.d.3 / 359.3.e.13 (the only
 * snapshot / look-back licences — neither applies to a move trigger), 323.10 / 323.11 (no opposing units left
 * → the staged combat un-stages and Contested is removed).
 *
 * Question: Kato Standard-Moves alone base → P2's bf1; P1 names F for the trigger. Is Kato's Might/keyword
 * set snapshotted at trigger time or read at resolution? (a) no response; (b) P2 Stupefies Kato in response;
 * (c) P2 Gusts Kato in response. What does F get, does the ability still resolve in (c), and what becomes of
 * the staged combat?
 *
 * Expected: the effect reads Kato AT RESOLUTION. (a) F 2 → 5 + Deflect this turn; combat opens, Kato (3)
 * attacks alone. (b) Stupefy (1 + 1 any for Deflect, P2 draws 1) resolves first → Kato 2 → F 2 → 4 + Deflect;
 * combat opens with a 2-Might Kato. (c) Gust (1 + 1 any) resolves first → Kato to P1's hand; his ability still
 * resolves (not countered) but 'my Might' / 'my keywords' are NULL → F stays a vanilla 2 with no keywords;
 * no P1 unit at bf1 → combat un-staged, Contested removed, bf1 stays P2's, no showdown, P1 back in an open
 * main phase.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KATO = "sfd-112-221";
const GUST = "ogn-169-298";
const STUPEFY = "ogn-095-298";

/**
 * P1's turn 2, Neutral Open. P1: Kato + F (vanilla 2) ready in base. P2: Holder (2) at bf1 (P2 controls it),
 * Gust + Stupefy in hand, 1 energy + `spare` rainbow power (the Deflect surcharge purse).
 */
function board(spare = 1) {
  return scenario()
    .resources(P2, { energy: 1, power: { rainbow: spare } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", KATO, "kato")
    .unit(P1, "base", { might: 2, name: "Friend F" }, "eff")
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P2, GUST, "gust")
    .hand(P2, STUPEFY, "stupefy");
}

/** Kato moves base → bf1; the trigger names F (bound automatically as the only other friendly unit, or picked). */
async function moved(spare = 1): Promise<Game> {
  const game = await board(spare).build();
  await game.p1.move("kato", "bf1");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("eff");
  }
  return game;
}

/** …and P1 passes chain priority so P2 holds it with the trigger still unresolved. */
async function p2Window(spare = 1): Promise<Game> {
  const game = await moved(spare);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** P2 responds with `spell` on Kato; both pass so ONLY the response resolves (LIFO); stop with Kato's item still on the chain. */
async function respondAndResolveResponse(spell: "gust" | "stupefy"): Promise<Game> {
  const game = await p2Window();
  await game.p2.cast(spell, { targets: "kato" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["kato", spell]);
  // The caster (P2) holds priority first after its own play; P2 passes, then P1 passes → top item resolves.
  for (let i = 0; i < 4 && game.chain().length === 2; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  expect(game.zoneOf(spell)).toBe("trash");
  return game;
}

const cardsOf = (opts: readonly unknown[] | undefined) => [...new Set((opts ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];

describe("the move itself: Cleanup, trigger finalization, staged-but-unopened combat", () => {
  test("Kato's Standard Move completes at once (no chain item for the move): he is exhausted at bf1, bf1 is Contested by P1 but still controlled by P2 (319.8)", async () => {
    const game = await moved();
    expect(game.locationOf("kato")).toBe("bf1");
    expect(game.state("kato").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("the move trigger is finalized on the chain targeting F — a unit in P1's BASE is a legal 'another friendly unit' (402.2); it is the only chain item and it is a triggered ability of Kato", async () => {
    const game = await moved();
    expect(game.locationOf("eff")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kato", controller: P1, targets: ["eff"], triggered: true, type: "ability" })]);
  });

  test("no showdown/combat has begun: P1 (turn player) holds CHAIN priority first, then P2 (323.9 / 323.13); Kato is not yet an attacker", async () => {
    const game = await moved();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1, source: { cardId: "kato" } });
    expect(game.state("kato").combatRole).toBeNull();
    expect(game.state("holder").combatRole).toBeNull();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("nothing has been granted yet while the trigger waits: F is still a vanilla 2 with no keywords", async () => {
    const game = await p2Window();
    expect(game.state("eff")).toMatchObject({ grantedKeywords: [], keywords: [], might: 2 });
  });

  test("in P2's window both Reactions offer Kato (3 Might, at a battlefield → Gust-legal) and choosing him carries the Deflect surcharge: with 1 energy and NO spare power neither spell may pick Kato (809.1.c)", async () => {
    const rich = await p2Window(1);
    expect(cardsOf(rich.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options)).toEqual(expect.arrayContaining(["kato", "holder"]));
    expect(cardsOf(rich.p2.option("cast", "stupefy")?.fields.find((f) => f.name === "targets")?.options)).toEqual(expect.arrayContaining(["kato", "holder", "eff"]));

    const poor = await p2Window(0);
    expect(cardsOf(poor.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options)).not.toContain("kato");
    expect(cardsOf(poor.p2.option("cast", "stupefy")?.fields.find((f) => f.name === "targets")?.options)).not.toContain("kato");
    expect((await poor.p2.try((p) => p.cast("gust", { targets: "kato" }))).ok).toBe(false);
    // …but F (no Deflect, P1's base) is still a fine Stupefy target for the poor P2.
    expect(cardsOf(poor.p2.option("cast", "stupefy")?.fields.find((f) => f.name === "targets")?.options)).toContain("eff");
  });
});

describe("(a) no response — F receives Kato's CURRENT 3 and Deflect; then combat opens", () => {
  test("both pass → the trigger resolves: F 2 + 3 = 5 this turn and Deflect (this turn)", async () => {
    const game = await p2Window();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("eff").might).toBe(5);
    expect(game.state("eff").mightModifier).toBe(3);
    expect(game.state("eff").grantedKeywords).toEqual([{ duration: "turn", keyword: "Deflect", value: 1 }]);
    expect(game.state("eff").keywords).toEqual(["Deflect"]);
  });

  test("only once the chain is empty does the staged combat open at bf1: showdown context, P1 (attacker) has Focus, Kato attacker at 3 vs Holder defender 2; F (in base) is not in it", async () => {
    const game = await p2Window();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("kato")).toMatchObject({ combatRole: "attacker", might: 3 });
    expect(game.state("holder")).toMatchObject({ combatRole: "defender", might: 2 });
    expect(game.state("eff").combatRole).toBeNull();
    expect(game.p2.resources()).toEqual({ energy: 1, power: { rainbow: 1 } }); // P2 spent nothing
  });

  test("the grant is 'this turn': after the turn passes F is a vanilla 2 again", async () => {
    const game = await p2Window();
    const s = await game.settle(); // trigger, then the whole combat (3 kills the 2-Might Holder; Kato survives 2 < 3)
    expect(s.reason).toBe("open");
    expect(game.state("eff").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("eff")).toMatchObject({ grantedKeywords: [], keywords: [], might: 2, mightModifier: 0 });
  });
});

describe("(b) Stupefy on Kato in response — the trigger reads Kato's Might AT RESOLUTION (2), not at trigger time (3)", () => {
  test("Stupefy at Kato costs P2 1 energy + 1 power of any domain (Deflect) and sits on top of Kato's trigger", async () => {
    const game = await p2Window();
    await game.p2.cast("stupefy", { targets: "kato" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["kato", "stupefy"]);
    expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["kato"], triggered: false, type: "spell" });
  });

  test("Stupefy resolves FIRST (LIFO): Kato is 2 this turn, P2 drew 1; Kato's trigger is still on the chain and F is still untouched", async () => {
    const before = (await p2Window()).p2.hand().length; // gust + stupefy
    const game = await respondAndResolveResponse("stupefy");
    expect(game.state("kato")).toMatchObject({ might: 2, mightModifier: -1, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toHaveLength(before - 1 + 1); // cast Stupefy, drew 1
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kato", targets: ["eff"], triggered: true })]);
    expect(game.state("eff")).toMatchObject({ grantedKeywords: [], might: 2 });
  });

  test("then Kato's trigger resolves reading his CURRENT Might: F gets +2 (2 → 4), NOT +3, plus Deflect (359.3.e.12.a — Kato is still on the board, so live information is read)", async () => {
    const game = await respondAndResolveResponse("stupefy");
    for (let i = 0; i < 3 && game.chain().length > 0; i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("eff").might).toBe(4);
    expect(game.state("eff").might).not.toBe(5);
    expect(game.state("eff").mightModifier).toBe(2);
    expect(game.state("eff").grantedKeywords).toEqual([{ duration: "turn", keyword: "Deflect", value: 1 }]);
  });

  test("combat then opens at bf1 with a 2-Might attacking Kato (P1 Focus); settling it: 2 vs 2 — both die, nobody conquers, bf1 no longer P2-held by a unit", async () => {
    const game = await respondAndResolveResponse("stupefy");
    for (let i = 0; i < 3 && game.chain().length > 0; i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("kato")).toMatchObject({ combatRole: "attacker", might: 2 });
    expect(game.state("holder")).toMatchObject({ combatRole: "defender", might: 2 });
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("kato")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);
    // F keeps what it was granted (a 'this turn' modification on F, independent of Kato's later death).
    expect(game.state("eff")).toMatchObject({ might: 4, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) Gust on Kato in response — source gone → NULL Might / NULL keywords; ability still resolves; combat un-stages", () => {
  test("Gust at Kato costs P2 1 energy + 1 any-domain power (Deflect) and goes on top of the trigger", async () => {
    const game = await p2Window();
    await game.p2.cast("gust", { targets: "kato" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["kato", "gust"]);
  });

  test("Gust resolves FIRST: Kato returns to P1's HAND (owner's hand) as a new object — no damage/exhaust/modifiers tracked (124); Gust → P2's trash", async () => {
    const game = await respondAndResolveResponse("gust");
    expect(game.zoneOf("kato")).toBe("hand");
    expect(game.p1.hand()).toContain("kato");
    expect(game.p2.trash()).toContain("gust");
  });

  test("removing the source does NOT counter the ability (355.9.c): Kato's trigger is STILL a live, un-countered chain item targeting F after Gust resolved, and players get priority on it", async () => {
    const game = await respondAndResolveResponse("gust");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kato", countered: false, targets: ["eff"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.state("eff")).toMatchObject({ grantedKeywords: [], might: 2 }); // nothing applied early either
  });

  // BUG — expected (359.3.e.12): Kato is in a non-board zone when the effect resolves, so '+Might equal to my
  // Might' reads NULL and the calculation is ignored → F stays at 2. Actual: the engine still applies +3
  // (mightModifier 3, F = 5) — it either snapshotted Kato's Might or reads the printed Might of the card in hand.
  test("after the trigger resolves F gains NO Might — 'my Might' of a Kato that left the board is null (359.3.e.12), F stays 2", async () => {
    const game = await respondAndResolveResponse("gust");
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.state("eff").mightModifier).toBe(0);
    expect(game.state("eff").might).toBe(2);
  });

  // BUG — expected (359.3.e.12): 'my keywords' of a permanent no longer on the board is null → F is granted
  // nothing. Actual: F is granted Deflect 1 (this turn) — read off the Kato card now sitting in P1's hand.
  test("after the trigger resolves F gains NO keywords — 'my keywords' of a Kato that left the board is null (359.3.e.12); F has no Deflect", async () => {
    const game = await respondAndResolveResponse("gust");
    await game.settle();
    expect(game.state("eff").grantedKeywords).toEqual([]);
    expect(game.state("eff").keywords).not.toContain("Deflect");
    expect(game.state("eff").keywords).toEqual([]);
  });

  test("F in any case never gets MORE than a snapshot would give: not 6+, and F itself is untouched otherwise (still ready in base, undamaged)", async () => {
    const game = await respondAndResolveResponse("gust");
    await game.settle();
    expect(game.state("eff").might).toBeLessThanOrEqual(5);
    expect(game.state("eff")).toMatchObject({ damage: 0, isReady: true, zone: "base" });
  });

  test("with Kato gone no P1 unit remains at bf1: the staged combat ceases to be staged (323.10), Contested is removed (323.11), bf1 stays P2's with its Holder untouched — no showdown ever opens", async () => {
    const game = await respondAndResolveResponse("gust");
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.state("holder")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("P1 is back in a Neutral Open main phase (P1 to act, may still end the turn); Kato (4 + [body]) is in hand and, with an empty pool, not replayable this turn", async () => {
    const game = await respondAndResolveResponse("gust");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("endTurn")).toBe(true);
    expect(game.zoneOf("kato")).toBe("hand");
    expect(game.p1.can("play", "kato")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
