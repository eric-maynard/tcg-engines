/**
 * Interaction: Poppy, Defender of the Meek (unl-178-219) · Champion Unit · Order · 6+[order] · 5 Might — P1's CHOSEN
 *     Champion, still in P1's Champion Zone:
 *     "You may spend 3 XP as an additional cost to play me. If you do, I cost [3] less. [Ambush] [Tank]"
 *   × Mageseeker Warden (ogn-070-298) · Unit · Calm · 6 · 5 Might — P2's:
 *     "While I'm at a battlefield, opponents can only play units to their base. …"
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury] · [Action] · "Deal 3 to a unit at a battlefield." — P2's
 *
 * Rules: 108.3.d / 419.1.a (the Chosen Champion is played from the CZ exactly like a hand card — same steps, same
 * permissions, same costs), 822.1.b / 822.3 (Ambush = may be played to a battlefield where you control units + has
 * [Reaction] only while being played there), 813.1.c.1 / 309.1.a (Reaction is what permits a play in a Closed state),
 * 813.3.a / 813.4 (to base she has NO Reaction), 813.4.b (a failed conditional-Reaction play is undone and the card
 * "returned to the zone it was played from"), 054.1 (the Warden's "can only … base" beats Ambush's permission),
 * 355.2.a, 356.2.b.1 (3 XP optional additional cost with a −[3] rider), 358.3 / 358.4 / 358.5 (Check Legality →
 * everything undone), 337.2 (a finalized unit resolves immediately), 340.4 (then the controller of the newest
 * remaining item — the Ray, P2 — holds priority), 359.2.c (units enter exhausted).
 *
 * Question: P1: 4 XP, 6 energy + [order], bf1 with a lone Squire (2), empty base. P2's turn; P2 plays Hextech Ray at
 * the Squire and passes → P1 holds priority in a Neutral CLOSED state.
 *   (a) No Warden: which destinations does the seat offer for CZ-Poppy? With and without the 3-XP option? Play her to
 *       bf1 spending 3 XP — full end state after the Ray resolves.
 *   (b) P2's Warden at bf2: is CZ-Poppy offered anywhere now? On P1's own Neutral Open turn with the Warden still out?
 *   (c) Rollback probe on board (b) in the Closed state: raw {play Poppy from CZ → bf1, spend XP} — state afterwards?
 *   (d) Same boards with Poppy in HAND: must the offered sets be identical to the CZ ones?
 *
 * Expected: (a) {bf1} only; both cost variants (6+[order] | 3 XP → 3+[order]). Playing bf1 with XP: XP 4→1, pool 6→3,
 * [order] spent, CZ empty, Poppy at bf1 exhausted at once (never a chain item), P2 (Ray's controller) holds priority
 * with only pass; Ray resolves: Squire dies; Poppy keeps bf1 for P1; chain empty. (b) Closed + Warden: offered
 * NOWHERE. P1's own Open turn + Warden: {base} only, both cost variants. (c) Refused / fully undone: Poppy still in
 * the CZ, XP 4, pool 6+[order], chain = the Ray with P1 still holding priority, no played-card bookkeeping. (d) Yes —
 * identical sets and costs; only the rollback's return zone differs (hand vs CZ).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POPPY = "unl-178-219";
const MAGESEEKER_WARDEN = "ogn-070-298";
const HEXTECH_RAY = "ogn-009-298";

interface BoardOpts {
  /** P2's Mageseeker Warden at bf2 (default false). */
  readonly warden?: boolean;
  /** Poppy in P1's HAND instead of the Champion Zone (default CZ). */
  readonly inHand?: boolean;
  /** P1's energy (default 6). */
  readonly energy?: number;
}

/**
 * P2's turn 3, main phase, nothing on the chain. P1: 4 XP, `energy` + [order], bf1 with a lone Squire (2), empty base,
 * Poppy in the CZ (or hand). P2: bf2 with a 3-Might Guard (+ the Warden there if asked), Hextech Ray in hand + 1+[fury].
 */
function board(o: BoardOpts = {}) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .xp(P1, 4)
    .resources(P1, { energy: o.energy ?? 6, power: { order: 1 } })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .hand(P2, HEXTECH_RAY, "ray");
  if (o.warden) {
    s.unit(P2, "bf2", MAGESEEKER_WARDEN, "warden");
  }
  if (o.inHand) {
    s.hand(P1, POPPY, "poppy");
  } else {
    s.champion(P1, POPPY, "poppy");
  }
  return s;
}

/** P2 casts the Ray at the Squire and passes → P1 holds priority in Neutral Closed. */
async function closedState(o: BoardOpts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p2.cast("ray", { targets: "squire" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["squire"] })]);
  return game;
}

/** P1's own turn 3, Neutral Open, same board. */
async function ownOpenTurn(o: BoardOpts = {}): Promise<Game> {
  const game = await board(o).active(P1).build();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** The Poppy play option for this board (CZ play or hand play). */
function poppyOption(game: Game, inHand: boolean) {
  return inHand ? game.p1.option("playUnit", "poppy") : game.p1.option("playFromChampionZone");
}

/** Destinations offered for Poppy (battlefield ids bare, sorted); [] when the play is not offered at all. */
function destinations(game: Game, inHand = false): string[] {
  const f = poppyOption(game, inHand)?.fields.find((x) => x.arg === "to");
  return ((f?.options ?? []) as string[]).map((z) => (z.startsWith("battlefield-") ? z.slice("battlefield-".length) : z)).sort();
}

/** Cost variants offered for Poppy: "full" (6+[order]) and/or "xp" (spend 3 XP → 3+[order]). */
function costVariants(game: Game, inHand = false): string[] {
  const kinds = new Set<string>();
  for (const v of poppyOption(game, inHand)?.variants ?? []) {
    const p = v.params as { paidAdditionalCost?: boolean };
    kinds.add(p.paidAdditionalCost === true ? "xp" : "full");
  }
  return [...kinds].sort();
}

/** Snapshot of everything the rollback probe must leave untouched. */
function probeSnapshot(game: Game) {
  return {
    chain: game.chain().map((c) => [c.cardId, c.targets]),
    champion: game.p1.champion(),
    decision: { kind: game.decision()?.kind, seat: game.decision()?.seat },
    hand: game.p1.hand(),
    played: game.gameState.cardsPlayedThisTurn?.[P1] ?? 0,
    pool: game.p1.resources(),
    poppyZone: game.zoneOf("poppy"),
    unitsBf1: game.cardsAt("bf1").sort(),
    xp: game.p1.xp(),
  };
}

describe("Poppy from the CHAMPION ZONE — Ambush's conditional Reaction × Mageseeker Warden × Check-Legality unwind", () => {
  // ── (a) no Warden, Neutral Closed ─────────────────────────────────────────────────────────────

  test("(a) no Warden, Closed: CZ-Poppy is offered to bf1 ONLY — base would need real Reaction (813.3.a/813.4), bf2 is neither hers nor friendly-occupied (822.1.b, 309.1.a)", async () => {
    const game = await closedState();
    expect(game.p1.can("playChampion")).toBe(true);
    expect(destinations(game)).toEqual(["bf1"]);
    await expect(game.p1.playChampion("base")).rejects.toThrow();
    await expect(game.p1.playChampion("bf2")).rejects.toThrow();
    expect(game.zoneOf("poppy")).toBe("championZone");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { order: 1 } });
  });

  // Expected (108.3.d / 419.1.a + 356.2.b.1): the CZ play offers the same two cost variants a hand play does — 6+[order],
  // or spend 3 XP → 3+[order]. Actual: playFromChampionZone only knows rune-paid optional costs (Accelerate / "pay"),
  // so the XP variant is never enumerated (and a raw request for it is refused).
  test("(a) no Warden, Closed: BOTH cost variants are offered for the CZ play — full 6+[order] and 'spend 3 XP → 3+[order]' (419.1.a, 356.2.b.1)", async () => {
    const game = await closedState();
    expect(costVariants(game)).toEqual(["full", "xp"]);
  });

  // Same gap, seen from the pool: with only 3 energy the XP line is the only affordable one, so Poppy must still be
  // offered (to bf1). Actual: not offered at all.
  test("(a) with only 3 energy (+4 XP) the XP variant alone keeps CZ-Poppy on the menu → bf1", async () => {
    const game = await closedState({ energy: 3 });
    expect(game.p1.can("playChampion")).toBe(true);
    expect(destinations(game)).toEqual(["bf1"]);
  });

  // Expected: XP 4→1, pool 6/1 → 3/0, CZ empty, Poppy at bf1 exhausted. Actual: the XP payment is refused on the CZ path.
  test("(a) playing CZ-Poppy to bf1 SPENDING 3 XP: XP 4→1, pool → 3 energy / 0 order, the CZ is empty and Poppy stands at bf1 exhausted (356.2.b.1, 359.2.c)", async () => {
    const game = await closedState();
    await game.p1.choose("playFromChampionZone", { payOptional: true, to: "bf1" });
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 0 } });
    expect(game.p1.champion()).toBeUndefined();
    expect(game.state("poppy")).toMatchObject({ controller: P1, isExhausted: true, zone: "battlefield-bf1" });
  });

  test("(a) full-cost line (6+[order]) from the CZ: pool → 0/0, XP untouched, the CZ is EMPTY, Poppy is at bf1 exhausted at once and never appears on the chain — the chain still holds exactly the Ray aimed at the Squire (337.2, 359.2.c, 355.15)", async () => {
    const game = await closedState();
    await game.p1.playChampion("bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.xp()).toBe(4);
    expect(game.p1.champion()).toBeUndefined();
    expect(game.zoneOf("poppy")).toBe("battlefield-bf1");
    expect(game.state("poppy")).toMatchObject({ controller: P1, isExhausted: true, might: 5 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", targets: ["squire"] })]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  // Expected (337.2 → 340.4): Poppy resolved immediately, so priority goes to the controller of the newest REMAINING
  // item — P2 (the Ray) — who has nothing but pass/concede. The hand play does exactly that. Actual: after the CZ play
  // P1 keeps priority.
  test("(a) P2 cannot respond to Poppy herself: right after the CZ play priority sits with P2 as controller of the Ray, with only pass/concede on the menu (337.2, 340.4)", async () => {
    const game = await closedState();
    await game.p1.playChampion("bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
  });

  test("(a) …then the Ray resolves: the Squire (2) takes 3 and dies, Poppy is untouched and still at bf1 → P1 KEEPS bf1; chain empty, back to P2's open main phase", async () => {
    const game = await closedState();
    await game.p1.playChampion("bf1");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.state("poppy")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Warden at bf2 ─────────────────────────────────────────────────────────────────────────

  // Expected (054.1): the Warden confines P1's unit plays to base; base carries no Reaction for Poppy (813.4) → in the
  // Closed state she is offered NOWHERE. Actual: the CZ play ignores the Warden's play-restriction and still offers bf1.
  test("(b) Warden at bf2, Closed: CZ-Poppy is offered NOWHERE — absent from P1's menu, bf1 refused (054.1 over 822.1.b; 813.4)", async () => {
    const game = await closedState({ warden: true });
    expect(game.p1.can("playChampion")).toBe(false);
    expect(destinations(game)).toEqual([]);
    const r = await game.p1.try((p) => p.playChampion("bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("poppy")).toBe("championZone");
  });

  // Expected: own Open turn + Warden → {base} only. Actual: the CZ play offers bf1 (Ambush) as well as base.
  test("(b) Warden at bf2, P1's OWN Neutral Open turn: CZ-Poppy is offered to BASE only — bf1 is suppressed by the Warden (054.1, 355.2.a)", async () => {
    const game = await ownOpenTurn({ warden: true });
    expect(game.p1.can("playChampion")).toBe(true);
    expect(destinations(game)).toEqual(["base"]);
    const r = await game.p1.try((p) => p.playChampion("bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("poppy")).toBe("championZone");
  });

  // Expected: both cost variants on that base play. Actual: no XP variant on the CZ path (see (a)).
  test("(b) …and that base play comes in BOTH cost variants (full | 3 XP)", async () => {
    const game = await ownOpenTurn({ warden: true });
    expect(costVariants(game)).toEqual(["full", "xp"]);
  });

  test("(b) control: on P1's own Open turn WITHOUT the Warden the CZ play offers base AND bf1; the base play costs 6+[order], empties the CZ and she enters exhausted", async () => {
    const game = await ownOpenTurn();
    expect(destinations(game)).toEqual(["base", "bf1"]);
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.champion()).toBeUndefined();
    expect(game.state("poppy")).toMatchObject({ isExhausted: true, zone: "base" });
  });

  // ── (c) rollback probe (Warden board, Closed) ─────────────────────────────────────────────────

  test("(c) Warden at bf2, Closed: a RAW playFromChampionZone {→ bf1, spend XP} is refused and NOTHING sticks — Poppy still IN THE CHAMPION ZONE (not hand/trash), XP 4, pool 6+[order], chain = the Ray with P1 still holding priority, no cards-played bump (358.5, 813.4.b)", async () => {
    // NB: today the refusal comes from the CZ path not knowing the XP cost at all (see (a)); the assertion is about the
    // observable unwind either way.
    const game = await closedState({ warden: true });
    const before = probeSnapshot(game);
    const hash = game.stateHash();
    const r = await game.p1.try((p) => p.do("playFromChampionZone", { location: "battlefield-bf1", paidAdditionalCost: true, playerId: P1 }));
    expect(r.ok).toBe(false);
    expect(probeSnapshot(game)).toEqual(before);
    expect(before).toMatchObject({ champion: "poppy", played: 0, pool: { energy: 6, power: { order: 1 } }, poppyZone: "championZone", xp: 4 });
    expect(game.stateHash()).toBe(hash);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("passPriority")).toBe(true); // P1 may still pass (or play a real Reaction)
    expect(game.violations()).toEqual([]);
  });

  // Expected: the full-cost request to bf1 is refused just the same (the Warden forbids the destination). Actual: the
  // CZ path accepts it — Poppy lands on bf1 for 6+[order] despite the Warden.
  test("(c) the same probe at FULL cost {→ bf1} is refused too and leaves the identical pristine state (054.1, 358.5)", async () => {
    const game = await closedState({ warden: true });
    const before = probeSnapshot(game);
    const r = await game.p1.try((p) => p.do("playFromChampionZone", { location: "battlefield-bf1", playerId: P1 }));
    expect(r.ok).toBe(false);
    expect(probeSnapshot(game)).toEqual(before);
  });

  // ── (d) the same boards with Poppy in HAND ────────────────────────────────────────────────────

  test("(d) hand, no Warden, Closed: destinations = {bf1} only — identical to the CZ set (a)", async () => {
    const game = await closedState({ inHand: true });
    expect(game.p1.can("play", "poppy")).toBe(true);
    expect(destinations(game, true)).toEqual(["bf1"]);
    await expect(game.p1.play("poppy", { to: "base" })).rejects.toThrow();
    expect(game.zoneOf("poppy")).toBe("hand");
  });

  test("(d) hand, no Warden, Closed: BOTH cost variants (full | 3 XP) are on the menu for the Ambush play to bf1", async () => {
    const game = await closedState({ inHand: true });
    expect(costVariants(game, true)).toEqual(["full", "xp"]);
  });

  test("(d) hand, no Warden, Closed: the XP line itself works — raw playUnit {→ bf1, paid} charges 3 energy + [order] + 3 XP and she lands at bf1 exhausted; P2 (Ray's controller) then holds priority with only pass/concede (340.4)", async () => {
    const game = await closedState({ inHand: true });
    await game.p1.do("playUnit", { cardId: "poppy", location: "battlefield-bf1", paidAdditionalCost: true, playerId: P1 });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 0 } });
    expect(game.p1.xp()).toBe(1);
    expect(game.state("poppy")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
  });

  test("(d) hand, Warden at bf2, Closed: Poppy is offered NOWHERE; a raw playUnit {→ bf1} is refused and she stays in HAND with pool/XP intact (054.1, 358.5 — return zone = hand)", async () => {
    const game = await closedState({ inHand: true, warden: true });
    expect(game.p1.can("play", "poppy")).toBe(false);
    expect(destinations(game, true)).toEqual([]);
    const before = probeSnapshot(game);
    const r = await game.p1.try((p) => p.do("playUnit", { cardId: "poppy", location: "battlefield-bf1", playerId: P1 }));
    expect(r.ok).toBe(false);
    expect(probeSnapshot(game)).toEqual(before);
    expect(before).toMatchObject({ hand: ["poppy"], poppyZone: "hand", xp: 4 });
  });

  test("(d) hand, Warden at bf2, P1's own Open turn: destinations = {base} only, in BOTH cost variants (full | 3 XP) — the set the CZ play must mirror", async () => {
    const game = await ownOpenTurn({ inHand: true, warden: true });
    expect(destinations(game, true)).toEqual(["base"]);
    expect(costVariants(game, true)).toEqual(["full", "xp"]);
    await expect(game.p1.play("poppy", { to: "bf1" })).rejects.toThrow();
    await game.p1.play("poppy", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 0 } });
    expect(game.p1.xp()).toBe(1);
    expect(game.state("poppy")).toMatchObject({ isExhausted: true, zone: "base" });
  });

  test("(d) hand, no Warden, own Open turn: {base, bf1} × {full, xp} — and the CZ play offers the same DESTINATIONS there", async () => {
    const hand = await ownOpenTurn({ inHand: true });
    expect(destinations(hand, true)).toEqual(["base", "bf1"]);
    expect(costVariants(hand, true)).toEqual(["full", "xp"]);
    const cz = await ownOpenTurn();
    expect(destinations(cz)).toEqual(destinations(hand, true));
  });
});
