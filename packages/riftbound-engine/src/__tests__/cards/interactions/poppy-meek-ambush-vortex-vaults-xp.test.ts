/**
 * Interaction: Poppy, Defender of the Meek (unl-178-219) · Champion Unit · Order · 6 + [order] · 5 Might
 *     "You may spend 3 XP as an additional cost to play me. If you do, I cost [3] less.
 *      [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.) [Tank]"
 *   × Mystic Vortex (ven-160-166) · Battlefield
 *     "During showdowns here, cards with [Reaction] cost [rainbow] more to play. (Hidden cards have [Reaction].)"
 *   × Vaults of Helia (unl-219-219) · Battlefield
 *     "When you hold here, your non-token units cost [1] more to play this turn."
 *
 * Rules: 356.1 (base 6 + [order]) · 356.2.b.1 (optional non-standard additional cost "spend 3 XP", elected in
 * step 2) · 356.3 (increases: Vaults +[1] — a turn-long surcharge on the PLAYER's unit plays, wherever they
 * go; Mystic Vortex +[rainbow] on cards WITH [Reaction] during a showdown THERE) · 356.4 (her own −[3]) ·
 * 357.2 (the XP is paid in step 4) · 357.3 / 358 (unpayable → not a legal play) · 822.1.b + 813.4 (Ambush =
 * "may be played to a battlefield where you control units" AND "has [Reaction] as long as being played
 * there" — a conditional Reaction that IS the characteristic while the condition holds, so the Vortex sees
 * it) · 813.4.b (to base / an empty battlefield she has no Reaction → illegal mid-showdown, 343.1.a) ·
 * 355.2.b (Ambush makes the enemy-held Vortex a valid location) · 337.2 (unit resolves at once) · 464.2.c
 * (arrives as an attacker, exhausted).
 *
 * Board: end of P2's turn 2. P1's lone Raider (4, [Ganking]) sits on the live Vaults; P2's Defender (2) sits
 * on the live Mystic Vortex. P1 holds Poppy with 5 XP. P2 ends → P1 HOLDS the Vaults (1 point, +[1] to unit
 * plays this turn) and reaches the open main phase; P1 then floats an exact pool.
 *   (a) Raider ganks Vaults → Vortex (combat showdown, P1 has Focus). Poppy → Vortex electing XP:
 *       6 + 1 (Vaults) − 3 (XP) = 4 energy + [order] + [rainbow] (Vortex: she has Reaction while Ambushing
 *       into the showdown there); XP 5 → 2; only the Vortex is a legal destination (Vaults is now empty);
 *       she enters exhausted as an attacker.
 *   (b) 2 XP: the spend-XP variant is absent; offered = 7 + [order] + [rainbow] → Vortex only.
 *   (c) Control 1 — open main phase, before the gank, Poppy → Vaults (Raider there) with XP: 4 + [order],
 *       NO [rainbow] (the Vortex taxes only showdowns at the Vortex).
 *   (d) Control 2 — open main phase, Poppy → base with XP: 4 + [order]; without XP 7 + [order].
 *   (e) The Vaults +[1] applies to the mid-showdown play at the Vortex (a different battlefield): without
 *       XP it is 7 + [order] + [rainbow]; with the Vaults inert it is 6 + [order] + [rainbow].
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POPPY = "unl-178-219";
const MYSTIC_VORTEX = "ven-160-166";
const VAULTS_OF_HELIA = "unl-219-219";

/** The engine's own encoding of "spend 3 XP as an additional cost → I cost [3] less" (raw playUnit params). */
const XP_PAID = {
  additionalCostSpec: { energy: -3, power: [], xp: 3 },
  costs: { paid: { pay: { spec: { energy: -3, power: [], xp: 3 } } } },
  paidAdditionalCost: true,
} as const;

function board(o: { xp?: number; vaultsLive?: boolean } = {}) {
  return scenario()
    .turn(2)
    .active(P2)
    .xp(P1, o.xp ?? 5)
    .battlefield("vaults", { controller: P1, def: VAULTS_OF_HELIA, inert: o.vaultsLive === false })
    .battlefield("mv", { controller: P2, def: MYSTIC_VORTEX, inert: false, owner: P2 })
    .unit(P1, "vaults", { keywords: ["Ganking"], might: 4, name: "Raider" }, "raider")
    .unit(P2, "mv", { might: 2, name: "Defender" }, "def")
    .hand(P1, POPPY, "poppy")
    .fillDecks({ main: 10, runes: 0 });
}

/** P2 ends → P1's turn 3 (Hold at Vaults settles) → open main phase; then float exactly `pool`. */
async function p1Main(pool: { energy: number; power: Record<string, number> }, o: Parameters<typeof board>[0] = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p2.endTurn();
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  expect(game.p1.points()).toBe(1); // the Hold happened (Vaults live or not, holding scores)
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  await game.p1.do("addResources", pool);
  return game;
}

/** …then the Raider ganks into the Vortex: combat showdown, P1 (attacker) holds Focus, empty chain. */
async function p1FocusAtVortex(pool: { energy: number; power: Record<string, number> }, o: Parameters<typeof board>[0] = {}): Promise<Game> {
  const game = await p1Main(pool, o);
  await game.p1.gank("raider", "mv");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([]);
  expect(game.p1.units("vaults")).toEqual([]); // Vaults is now empty of P1 units
  return game;
}

/** [location, xpPaid] pairs the seat menu offers for Poppy right now. */
function variants(game: Game): [string, boolean][] {
  const opt = game.p1.option("play", "poppy");
  return (opt?.variants ?? [])
    .map((v) => [String(v.params.location), v.params.paidAdditionalCost === true] as [string, boolean])
    .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`));
}

function destinations(game: Game): string[] {
  const f = game.p1.option("play", "poppy")?.fields.find((x) => x.arg === "to");
  return ((f?.options ?? []) as string[]).slice().sort();
}

describe("Poppy [Ambush] into a Mystic Vortex showdown on the turn P1 held Vaults of Helia — XP cost, surcharges, destinations", () => {
  // ── (a) showdown at the Vortex, 5 XP ───────────────────────────────────────────────────────────

  test("(a) with Focus in the Vortex showdown Poppy is playable and the ONLY destination offered is the Vortex — base and the (now empty) Vaults are rejected (822.1.b, 813.4.b, 343.1.a)", async () => {
    const game = await p1FocusAtVortex({ energy: 8, power: { order: 1, rainbow: 1 } });
    expect(game.p1.can("play", "poppy")).toBe(true);
    expect(destinations(game)).toEqual(["battlefield-mv"]);
    expect((await game.p1.try((p) => p.do("playUnit", { cardId: "poppy", location: "base", ...XP_PAID }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.do("playUnit", { cardId: "poppy", location: "battlefield-vaults", ...XP_PAID }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.do("playUnit", { cardId: "poppy", location: "base" }))).ok).toBe(false);
    expect(game.zoneOf("poppy")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 8, power: { order: 1, rainbow: 1 } });
    expect(game.p1.xp()).toBe(5);
  });

  test("(a) the spend-3-XP variant → Vortex must be OFFERED in the showdown menu and playable via the bundle for exactly 4 energy + [order] + [rainbow], XP 5 → 2 (356.2.b.1, 356.3, 356.4, 357.2)", async () => {
    const game = await p1FocusAtVortex({ energy: 4, power: { order: 1, rainbow: 1 } });
    expect(variants(game)).toContainEqual(["battlefield-mv", true]);
    await game.p1.play("poppy", { payOptional: true, to: "mv" });
    expect(game.zoneOf("poppy")).toBe("battlefield-mv");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(game.p1.xp()).toBe(2);
  });

  test("(a) engine pricing of that play (raw playUnit with the XP cost elected): exactly 4 energy + [order] + [rainbow] leave the pool and XP goes 5 → 2 — 6 + 1 (Vaults) − 3 (XP) and the Vortex's [rainbow] on her Ambush-granted Reaction", async () => {
    const game = await p1FocusAtVortex({ energy: 4, power: { order: 1, rainbow: 1 } });
    await game.p1.do("playUnit", { cardId: "poppy", location: "battlefield-mv", ...XP_PAID });
    expect(game.zoneOf("poppy")).toBe("battlefield-mv");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(game.p1.xp()).toBe(2);
  });

  test("(a) with surplus in the pool the same play still takes exactly 4 energy, 1 order, 1 rainbow, 3 XP (nothing over-charged)", async () => {
    const game = await p1FocusAtVortex({ energy: 9, power: { order: 2, rainbow: 2 } });
    await game.p1.do("playUnit", { cardId: "poppy", location: "battlefield-mv", ...XP_PAID });
    expect(game.p1.resources()).toEqual({ energy: 5, power: { order: 1, rainbow: 1 } });
    expect(game.p1.xp()).toBe(2);
  });

  test("(a) she resolves immediately (337.2): at the Vortex, exhausted, an ATTACKER beside the Raider, 5 Might with Tank; nothing on the chain and the showdown continues with Focus passing to P2", async () => {
    const game = await p1FocusAtVortex({ energy: 4, power: { order: 1, rainbow: 1 } });
    await game.p1.do("playUnit", { cardId: "poppy", location: "battlefield-mv", ...XP_PAID });
    expect(game.state("poppy")).toMatchObject({ combatRole: "attacker", controller: P1, isExhausted: true, location: "mv", might: 5 });
    expect(game.state("poppy").keywords).toEqual(expect.arrayContaining(["Ambush", "Tank"]));
    expect(game.p1.units("mv").sort()).toEqual(["poppy", "raider"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("(a) combat then resolves 4 + 5 into the 2-Might Defender: it dies, P1 conquers the Vortex (2 points: hold + conquer), Poppy and the Raider stay", async () => {
    const game = await p1FocusAtVortex({ energy: 4, power: { order: 1, rainbow: 1 } });
    await game.p1.do("playUnit", { cardId: "poppy", location: "battlefield-mv", ...XP_PAID });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p1.units("mv").sort()).toEqual(["poppy", "raider"]);
    expect(game.gameState.battlefields.mv).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(2);
    // (the harness `costPaid` invariant does not model the XP-for-[3] discount and flags 4 < 6; ignore it)
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  // ── (b) only 2 XP ──────────────────────────────────────────────────────────────────────────────

  test("(b) with 2 XP the spend-XP variant is ABSENT (357.3): the only offer is the plain play → Vortex, and it costs 7 energy + [order] + [rainbow]; XP untouched", async () => {
    const game = await p1FocusAtVortex({ energy: 8, power: { order: 1, rainbow: 1 } }, { xp: 2 });
    expect(variants(game)).toEqual([["battlefield-mv", false]]);
    expect((await game.p1.try((p) => p.do("playUnit", { cardId: "poppy", location: "battlefield-mv", ...XP_PAID }))).ok).toBe(false);
    expect(game.zoneOf("poppy")).toBe("hand");
    await game.p1.play("poppy", { to: "mv" });
    expect(game.zoneOf("poppy")).toBe("battlefield-mv");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0, rainbow: 0 } });
    expect(game.p1.xp()).toBe(2);
  });

  test("(b) 2 XP and no [rainbow] in the pool (7 energy + [order] only): the Vortex surcharge is unpayable → Poppy is not offered at all during the showdown (356.3, 358)", async () => {
    const game = await p1FocusAtVortex({ energy: 7, power: { order: 1 } }, { xp: 2 });
    expect(game.p1.can("play", "poppy")).toBe(false);
    expect(variants(game)).toEqual([]);
    expect((await game.p1.try((p) => p.do("playUnit", { cardId: "poppy", location: "battlefield-mv" }))).ok).toBe(false);
    expect(game.zoneOf("poppy")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 7, power: { order: 1 } });
  });

  // ── (c) control 1: open main phase → her own occupied Vaults ───────────────────────────────────

  test("(c) open main phase, no showdown anywhere: Poppy → Vaults (Raider there) electing XP costs 4 energy + [order] and NO [rainbow] — the Vortex taxes only 'during showdowns here'; XP 5 → 2; she enters exhausted", async () => {
    const game = await p1Main({ energy: 8, power: { order: 1, rainbow: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(variants(game)).toContainEqual(["battlefield-vaults", true]);
    await game.p1.play("poppy", { payOptional: true, to: "vaults" });
    expect(game.zoneOf("poppy")).toBe("battlefield-vaults");
    expect(game.state("poppy")).toMatchObject({ isExhausted: true, location: "vaults" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 0, rainbow: 1 } });
    expect(game.p1.xp()).toBe(2);
  });

  // Expected: the XP-discounted play → Vaults totals 4 + [order], so with EXACTLY 4 energy + 1 order it must be
  // on the menu (it is for → base at the same price, and the raw move to Vaults is accepted and charges 4).
  // Actual: the enumerator offers the XP variant to a battlefield destination only once the pool covers the
  // UNdiscounted 7 — at 4..6 energy only [base, xp] is listed.
  test("(c) with exactly 4 energy + [order] the spend-XP play → Vaults must be offered alongside → base (same 4 + [order] total; 356.4, 358)", async () => {
    const game = await p1Main({ energy: 4, power: { order: 1 } });
    expect(variants(game)).toEqual([
      ["base", true],
      ["battlefield-vaults", true],
    ]);
  });

  test("(c) …the raw move confirms the price at exactly 4 + [order]: Poppy → Vaults with XP empties the pool, XP 5 → 2", async () => {
    const game = await p1Main({ energy: 4, power: { order: 1 } });
    await game.p1.do("playUnit", { cardId: "poppy", location: "battlefield-vaults", ...XP_PAID });
    expect(game.zoneOf("poppy")).toBe("battlefield-vaults");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.xp()).toBe(2);
  });

  test("(c) in the open main phase the enemy-held Vortex is NOT a destination (no P1 unit there → no Ambush permission; 355.2.a, 822.1.b): offered locations are exactly {base, Vaults}", async () => {
    const game = await p1Main({ energy: 8, power: { order: 1, rainbow: 1 } });
    expect(destinations(game)).toEqual(["base", "battlefield-vaults"]);
    expect((await game.p1.try((p) => p.do("playUnit", { cardId: "poppy", location: "battlefield-mv" }))).ok).toBe(false);
    expect(game.zoneOf("poppy")).toBe("hand");
  });

  // ── (d) control 2: open main phase → base ──────────────────────────────────────────────────────

  test("(d) open main phase, Poppy → base electing XP: 4 energy + [order] (6 + 1 − 3), XP 5 → 2, rainbow untouched", async () => {
    const game = await p1Main({ energy: 4, power: { order: 1, rainbow: 1 } });
    expect(variants(game)).toContainEqual(["base", true]);
    await game.p1.play("poppy", { payOptional: true, to: "base" });
    expect(game.zoneOf("poppy")).toBe("base");
    expect(game.state("poppy").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 1 } });
    expect(game.p1.xp()).toBe(2);
  });

  test("(d) open main phase, Poppy → base WITHOUT the XP option: 7 energy + [order] (6 + Vaults 1), XP stays 5", async () => {
    const game = await p1Main({ energy: 8, power: { order: 1 } });
    await game.p1.play("poppy", { payOptional: false, to: "base" });
    expect(game.zoneOf("poppy")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });
    expect(game.p1.xp()).toBe(5);
  });

  test("(d) with 3 energy + [order] and 5 XP nothing is offered — under Vaults even the discounted play needs 4 (356.1.b.3-style: the surcharge stacks on the discounted total)", async () => {
    const game = await p1Main({ energy: 3, power: { order: 1 } });
    expect(game.p1.can("play", "poppy")).toBe(false);
    expect((await game.p1.try((p) => p.do("playUnit", { cardId: "poppy", location: "base", ...XP_PAID }))).ok).toBe(false);
    expect(game.zoneOf("poppy")).toBe("hand");
  });

  // ── (e) Vaults' +1 is on the player, not on a location ─────────────────────────────────────────

  test("(e) the Vaults surcharge follows P1 to the Vortex: the plain mid-showdown Ambush play there costs 7 energy + [order] + [rainbow] (6 + Vaults 1 + Vortex rainbow)", async () => {
    const game = await p1FocusAtVortex({ energy: 8, power: { order: 1, rainbow: 1 } });
    await game.p1.play("poppy", { to: "mv" });
    expect(game.zoneOf("poppy")).toBe("battlefield-mv");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0, rainbow: 0 } });
    expect(game.p1.xp()).toBe(5);
  });

  test("(e) contrast — same line with the Vaults text inert (held, but no surcharge): the Ambush play at the Vortex costs 6 energy + [order] + [rainbow]; with XP (raw) 3 + [order] + [rainbow]", async () => {
    const game = await p1FocusAtVortex({ energy: 8, power: { order: 1, rainbow: 1 } }, { vaultsLive: false });
    await game.p1.play("poppy", { to: "mv" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0, rainbow: 0 } });

    const g2 = await p1FocusAtVortex({ energy: 3, power: { order: 1, rainbow: 1 } }, { vaultsLive: false });
    await g2.p1.do("playUnit", { cardId: "poppy", location: "battlefield-mv", ...XP_PAID });
    expect(g2.zoneOf("poppy")).toBe("battlefield-mv");
    expect(g2.p1.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(g2.p1.xp()).toBe(2);
  });
});
