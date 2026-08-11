/**
 * Interaction: Jinx, Demolitionist (ogn-030-298) · Champion Unit (Jinx) · Fury · 3 + [fury] · 4 Might
 *     "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *      [Assault 2] (+2 [Might] while I'm an attacker.)
 *      When you play me, discard 2."                       — P1's Chosen Champion, in the Champion Zone
 *   × Rek'Sai, Breacher (sfd-029-221) · Champion Unit · Fury · 3 + [fury] · 3 Might
 *     "… Friendly units played from anywhere other than a player's hand have [Accelerate]."   — on board
 *   × Vaults of Helia (unl-219-219) · Battlefield
 *     "When you hold here, your non-token units cost [1] more to play this turn."             — held by P1
 *   probe for [Legion]: Noxus Hopeful (ogn-012-298) · Unit · Fury · 4 · "[Legion] — I cost [2] less."
 *   (legend: Loose Cannon ogn-251-298, the Jinx Champion Legend)
 *
 * Rules: 108.3.d (the Chosen Champion "can be played from here as normal, following the rules of Playing
 * a Card"), 108.3.e (the Champion Zone is public), 103.2.b.1 (the Chosen Champion is one of the Main Deck
 * cards), 355.1.a / 356.2.b.1 / 805.1.a.1 / 805.2 / 805.6 (Accelerate = an OPTIONAL additional [1][C] in
 * the unit's own Domain, elected while playing; paid ⇒ enters ready), 805.4 (multiple instances of
 * Accelerate are redundant), 356.3 (cost increases such as Vaults' +[1]), 143.4 (units otherwise enter
 * exhausted), 350.1 (a card is Played when it finishes the process) + 359.2.b (execute its rules text top
 * to bottom on finalization), 812.1.c / 419.4.b (Legion is Active once a DIFFERENT card has been Finalized
 * by you this turn), 358.5 (a failed check undoes everything and cancels the action).
 *
 * Question. P1 held the Vaults at the start of this turn and controls Rek'Sai; Jinx sits in the Champion Zone.
 *  (a) Does the Champion-Zone play run the identical pipeline as a hand play?
 *  (b) Printed Accelerate + Rek'Sai-granted Accelerate — one election or two, and how much is charged?
 *  (c) Does "When you play me, discard 2" fire exactly once, and on the Champion-Zone play at all?
 *  (d) Does finalizing the Champion-Zone copy switch a later card's [Legion] on — and can a card's own play
 *      satisfy its own Legion?
 *  (e) With 4 energy + one [fury] pooled and ready Fury runes untapped, is the Accelerate variant listed?
 *
 * Expected: (a) identical — same destinations, same surcharge, same election, same play trigger.
 *  (b) ONE election (805.4): elected 5 energy + [fury][fury] → READY; declined 4 energy + [fury] → exhausted.
 *  (c) once, and yes. (d) yes for a LATER card, no for the card itself. (e) no — see the DESIGN note below.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JINX = "ogn-030-298";
const REKSAI = "sfd-029-221";
const VAULTS_OF_HELIA = "unl-219-219";
const LOOSE_CANNON = "ogn-251-298";
const NOXUS_HOPEFUL = "ogn-012-298";
const FODDER_A = { cardType: "unit", energyCost: 9, might: 1, name: "Fodder A" } as const;
const FODDER_B = { cardType: "unit", energyCost: 9, might: 1, name: "Fodder B" } as const;

/** The Champion-Zone play option's key (it names no card — the CZ has exactly one occupant). */
const CZ = "playFromChampionZone:-";

/**
 * P2 is about to end turn 2. P1: legend Loose Cannon, Jinx in the CHAMPION ZONE, one unit standing on the
 * Vaults (Rek'Sai unless `withReksai` is false, so the board has exactly one friendly unit either way),
 * hand = 2 discard-fodder cards + Noxus Hopeful + a second Jinx (the hand-vs-CZ control), no rune deck.
 * `vaults=false` leaves the same battlefield inert — the printed surcharge never applies.
 */
function board(opts: { vaults?: boolean; withReksai?: boolean; readyRunes?: number } = {}) {
  const { readyRunes = 0, vaults = true, withReksai = true } = opts;
  let s = scenario()
    .turn(2)
    .active(P2)
    .legend(P1, LOOSE_CANNON, "cannon")
    .champion(P1, JINX, "jinx")
    .battlefield("vaults", { controller: P1, def: VAULTS_OF_HELIA, inert: !vaults })
    .battlefield("other", { controller: null })
    .unit(P1, "vaults", withReksai ? REKSAI : { might: 3, name: "Holder" }, "holder")
    .hand(P1, FODDER_A, "fodA")
    .hand(P1, FODDER_B, "fodB")
    .hand(P1, NOXUS_HOPEFUL, "hopeful")
    .hand(P1, JINX, "jinxHand")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .fillDecks({ main: 10, runes: 0 });
  for (let i = 0; i < readyRunes; i++) {
    s = s.rune(P1, "fury", { alias: `rune${i}` });
  }
  return s;
}

/** P2 ends → P1 HOLDS the Vaults in its Beginning Phase (+1 point, surcharge armed) → float `res`. */
async function holdThenFloat(game: Game, res: { energy: number; power?: Record<string, number> }): Promise<void> {
  await game.p2.endTurn();
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  expect(game.p1.points()).toBe(1); // the Hold happened
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  await game.p1.do("addResources", res);
}

interface Quote {
  readonly loc: string;
  readonly energy: number;
  readonly power: Record<string, number>;
  readonly paidIds: readonly string[];
  readonly entersReady: boolean;
}

/** Every (destination × cost election) the engine ENUMERATES for a play option, as flat quotes. */
function variants(game: Game, moveId: string, card?: string): Quote[] {
  const opt = game.p1.option(moveId, card);
  return (opt?.variants ?? []).map((v) => {
    const p = v.params as { location?: string; quote?: { energy: number; entersReady: boolean; paidIds: string[]; power: Record<string, number> } };
    return {
      energy: p.quote?.energy ?? -1,
      entersReady: p.quote?.entersReady ?? false,
      loc: p.location ?? "?",
      paidIds: p.quote?.paidIds ?? [],
      power: p.quote?.power ?? {},
    };
  });
}

/** Play Jinx from the Champion Zone ELECTING Accelerate (the harness `playChampion` verb only declines). */
async function playChampionAccelerated(game: Game, to = "base"): Promise<void> {
  await game.p1.choose(CZ, { payOptional: true, to });
}

/** Resolve "When you play me, discard 2" by discarding the two fodder cards. */
async function discardFodder(game: Game): Promise<void> {
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
  await game.p1.pick("fodA");
  await game.p1.pick("fodB");
  await game.settle();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// (a) the Champion-Zone play is the ORDINARY play pipeline, not a special case (108.3.d)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("(a) 108.3.d — the Chosen Champion is played from the Champion Zone 'as normal'", () => {
  test("it is a legal action on P1's turn once the pool covers it, and its destinations are P1's base plus the battlefields P1 CONTROLS (355.2.a) — the uncontrolled 'other' battlefield is absent", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 5, power: { fury: 2 } });
    expect(game.p1.champion()).toBe("jinx");
    expect(game.p1.can("playChampion")).toBe(true);
    expect(game.p1.option(CZ)?.fields.find((f) => f.arg === "to")?.options).toEqual(["base", "battlefield-vaults"]);
  });

  test("the enumerated (destination × cost election) set of the CZ play is IDENTICAL to the same card played from hand — same surcharge, same optional election, same quotes", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 9, power: { fury: 3 } });
    expect(variants(game, CZ)).toEqual(variants(game, "playUnit", "jinxHand"));
    // …and that shared set is the six-step pipeline's answer: base 3 + [fury], +[1] Vaults, ±Accelerate.
    expect(variants(game, CZ)).toEqual([
      { energy: 4, entersReady: false, loc: "base", paidIds: [], power: { fury: 1 } },
      { energy: 5, entersReady: true, loc: "base", paidIds: ["accelerate"], power: { fury: 2 } },
      { energy: 4, entersReady: false, loc: "battlefield-vaults", paidIds: [], power: { fury: 1 } },
      { energy: 5, entersReady: true, loc: "battlefield-vaults", paidIds: ["accelerate"], power: { fury: 2 } },
    ]);
  });

  test("356.3 — Vaults' +[1] is added to the CZ play exactly as to a hand play: every quote is one Energy above the inert-Vaults control (3 + [fury] / 4 + [fury][fury])", async () => {
    const noVaults = await board({ vaults: false }).build();
    await holdThenFloat(noVaults, { energy: 9, power: { fury: 3 } });
    expect(variants(noVaults, CZ)).toEqual([
      { energy: 3, entersReady: false, loc: "base", paidIds: [], power: { fury: 1 } },
      { energy: 4, entersReady: true, loc: "base", paidIds: ["accelerate"], power: { fury: 2 } },
      { energy: 3, entersReady: false, loc: "battlefield-vaults", paidIds: [], power: { fury: 1 } },
      { energy: 4, entersReady: true, loc: "battlefield-vaults", paidIds: ["accelerate"], power: { fury: 2 } },
    ]);
    expect(variants(noVaults, CZ)).toEqual(variants(noVaults, "playUnit", "jinxHand"));
  });

  test("legality is pool-gated like any other play: with 3 energy + [fury] (one short of 3+1 Vaults) the Champion-Zone play is not offered at all", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 3, power: { fury: 1 } });
    expect(game.p1.can("playChampion")).toBe(false);
    expect(game.p1.option(CZ)).toBeUndefined();
    expect(game.zoneOf("jinx")).toBe("championZone");
  });

  test("the CZ play can also be finalized AT the controlled battlefield (355.2.a): Jinx lands on the Vaults, not in base", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 4, power: { fury: 1 } });
    await game.p1.playChampion("battlefield-vaults");
    expect(game.zoneOf("jinx")).toBe("battlefield-vaults");
    expect(game.locationOf("jinx")).toBe("vaults");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.cardsAt("championZone", P1)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// (b) printed Accelerate + Rek'Sai's granted Accelerate = ONE election (805.4)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("(b) 805.4 — multiple instances of Accelerate are redundant: one election, one payment", () => {
  test("the option carries a single boolean election and four variants (2 destinations × 2 elections); each accelerated quote lists the cost id ONCE", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 9, power: { fury: 3 } });
    const opt = game.p1.option(CZ);
    expect(opt?.variantCount).toBe(4);
    expect(opt?.fields.map((f) => f.arg)).toEqual(["to", "payOptional"]);
    expect(opt?.fields.find((f) => f.arg === "payOptional")?.options).toEqual([false, true]);
    for (const v of variants(game, CZ).filter((q) => q.entersReady)) {
      expect(v.paidIds).toEqual(["accelerate"]); // not ["accelerate", "accelerate-granted"]
    }
  });

  test("Rek'Sai's grant changes nothing here — the enumerated set with Rek'Sai on the board is exactly the set without him (his licence is redundant with Jinx's printed [Accelerate])", async () => {
    const withReksai = await board().build();
    await holdThenFloat(withReksai, { energy: 9, power: { fury: 3 } });
    const without = await board({ withReksai: false }).build();
    await holdThenFloat(without, { energy: 9, power: { fury: 3 } });
    expect(variants(withReksai, CZ)).toEqual(variants(without, CZ));
  });

  test("Accelerate ELECTED: one payment of exactly 5 energy + [fury][fury] (3 base + [1] Vaults + [1][fury] Accelerate, the [fury] base pip) → pool 0/0, Jinx enters READY (805.6) at 4 Might", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 5, power: { fury: 2 } });
    await playChampionAccelerated(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("jinx")).toMatchObject({ baseMight: 4, controller: P1, isExhausted: false, isReady: true, might: 4, zone: "base" });
    expect(game.zoneOf("jinx")).toBe("base");
  });

  test("Accelerate DECLINED: exactly 4 energy + [fury] and Jinx enters EXHAUSTED (143.4) — the spare fury is not taken", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 5, power: { fury: 2 } });
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, isReady: false, might: 4, zone: "base" });
  });

  test("805.1.a.1 — the Accelerate pip must be paid in Jinx's own Domain: with 5 energy + [fury] + [calm] the accelerated variant is ABSENT and the calm survives the declined play", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 5, power: { calm: 1, fury: 1 } });
    expect(variants(game, CZ).some((q) => q.entersReady)).toBe(false);
    await expect(playChampionAccelerated(game)).rejects.toThrow();
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, fury: 0 } });
    expect(game.state("jinx").isExhausted).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// (c) "When you play me, discard 2" — origin-agnostic, exactly once
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("(c) 350.1 / 359.2.b — the play trigger fires on the Champion-Zone play, exactly once", () => {
  test("finalizing the accelerated CZ play puts EXACTLY ONE triggered 'Jinx, Demolitionist' ability on the chain", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 5, power: { fury: 2 } });
    await playChampionAccelerated(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", controller: P1, triggered: true, type: "ability" })]);
  });

  test("it resolves as a discard of exactly 2 (not 4): hand −2, both fodder cards in the trash, chain empty, back to P1's open main phase", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 5, power: { fury: 2 } });
    await playChampionAccelerated(game);
    const hand = game.p1.hand().length;
    await discardFodder(game);
    expect(game.p1.hand()).toHaveLength(hand - 2);
    expect(game.zoneOf("fodA")).toBe("trash");
    expect(game.zoneOf("fodB")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the DECLINED play triggers it too — the trigger keys off the card being played, not off the election or the origin", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 4, power: { fury: 1 } });
    await game.p1.playChampion("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", triggered: true })]);
    await discardFodder(game);
    expect(game.p1.trash().sort()).toEqual(["fodA", "fodB"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// (d) [Legion] — the Chosen Champion is a Main Deck card, and no card satisfies its own Legion
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("(d) 812.1.c / 419.4.b / 103.2.b.1 — the finalized Champion-Zone copy counts as 'another card played this turn'", () => {
  test("before anything is played nothing has been Finalized by P1, and Noxus Hopeful is quoted at its full 4 + [1] Vaults = 5", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 9, power: { fury: 3 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(variants(game, "playUnit", "hopeful").map((q) => q.energy)).toEqual([5, 5]);
  });

  test("Legion cannot be satisfied by the card itself: played as P1's FIRST card, Noxus Hopeful is charged the full 4 (no Vaults) — its own finalization does not retroactively discount it", async () => {
    const game = await board({ vaults: false }).build();
    await holdThenFloat(game, { energy: 9, power: { fury: 2 } });
    expect(variants(game, "playUnit", "hopeful").map((q) => q.energy)).toEqual([4, 4]);
    await game.p1.play("hopeful", { to: "base" });
    expect(game.p1.energy()).toBe(5); // 9 − 4
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await game.settle();
    expect(game.state("hopeful")).toMatchObject({ might: 4, zone: "base" });
  });

  test("after the Champion-Zone Jinx finalizes, cardsPlayedThisTurn is 1 and a LATER Legion card is Active: Noxus Hopeful drops 5 → 3 under Vaults", async () => {
    const game = await board().build();
    await holdThenFloat(game, { energy: 9, power: { fury: 3 } });
    await game.p1.playChampion("base");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await discardFodder(game);
    expect(variants(game, "playUnit", "hopeful").map((q) => q.energy)).toEqual([3, 3]);
    const before = game.p1.energy();
    await game.p1.play("hopeful", { to: "base" });
    expect(game.p1.energy()).toBe(before - 3);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
  });

  test("…and the same without the Vaults surcharge: 4 → 2 once the Champion-Zone copy has been Finalized", async () => {
    const game = await board({ vaults: false }).build();
    await holdThenFloat(game, { energy: 9, power: { fury: 2 } });
    expect(variants(game, "playUnit", "hopeful").map((q) => q.energy)).toEqual([4, 4]);
    await game.p1.playChampion("base");
    await discardFodder(game);
    expect(variants(game, "playUnit", "hopeful").map((q) => q.energy)).toEqual([2, 2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// (e) manual payment: ready runes are never credited (DESIGN deviation from 357.1.a / 429.3)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("(e) pool-only enumeration — a ready Fury rune does not make the Accelerate variant appear", () => {
  // DESIGN (`.claude/skills/riftbound-rules/DESIGN.md` § "Paying costs"): paying is MANUAL — the "Add
  // during payment" sub-step of rules 357.1.a / 429.3 / 204.4.b.1 is deliberately not implemented. The
  // engine only enumerates a play whose total the CURRENT pool covers in full; ready runes are never
  // credited and never auto-tapped. So with 4 energy + [fury] pooled only the declined variants exist,
  // even though two ready Fury runes are sitting right there.
  test("with 4 energy + [fury] pooled and two READY Fury runes, only the declined variants (exactly that cost) are listed — the accelerated one is absent", async () => {
    const game = await board({ readyRunes: 2 }).build();
    await holdThenFloat(game, { energy: 4, power: { fury: 1 } });
    expect(game.p1.runes({ ready: true })).toEqual(["rune0", "rune1"]);
    expect(variants(game, CZ)).toEqual([
      { energy: 4, entersReady: false, loc: "base", paidIds: [], power: { fury: 1 } },
      { energy: 4, entersReady: false, loc: "battlefield-vaults", paidIds: [], power: { fury: 1 } },
    ]);
    expect(game.p1.can("playChampion")).toBe(true); // the declined play IS legal
  });

  test("358.5 — a raw move electing Accelerate is refused atomically: Jinx stays in the Champion Zone, the pool and the runes are untouched, nothing goes on the chain", async () => {
    const game = await board({ readyRunes: 2 }).build();
    await holdThenFloat(game, { energy: 4, power: { fury: 1 } });
    const r = await game.p1.try((p) => p.choose(CZ, { payOptional: true, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("jinx")).toBe("championZone");
    expect(game.p1.champion()).toBe("jinx");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    expect(game.p1.runes({ ready: true })).toEqual(["rune0", "rune1"]);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toContain("fodA");
    expect(game.violations()).toEqual([]);
  });

  test("convert the runes first (tap one for energy, recycle the other for [fury]) and BOTH variants reappear; the accelerated play then drains 5 + [fury][fury] and Jinx enters ready", async () => {
    const game = await board({ readyRunes: 2 }).build();
    await holdThenFloat(game, { energy: 4, power: { fury: 1 } });
    await game.p1.tapRune("rune0");
    await game.p1.recycleRune("rune1", "fury");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 2 } });
    expect(variants(game, CZ)).toEqual([
      { energy: 4, entersReady: false, loc: "base", paidIds: [], power: { fury: 1 } },
      { energy: 5, entersReady: true, loc: "base", paidIds: ["accelerate"], power: { fury: 2 } },
      { energy: 4, entersReady: false, loc: "battlefield-vaults", paidIds: [], power: { fury: 1 } },
      { energy: 5, entersReady: true, loc: "battlefield-vaults", paidIds: ["accelerate"], power: { fury: 2 } },
    ]);
    await playChampionAccelerated(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("jinx")).toMatchObject({ isReady: true, zone: "base" });
    await discardFodder(game);
    expect(game.violations()).toEqual([]);
  });
});
