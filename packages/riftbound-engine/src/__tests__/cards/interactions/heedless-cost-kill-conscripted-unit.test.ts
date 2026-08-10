/**
 * Interaction: Heedless Resurrection (unl-142-219) · Spell · Chaos · 2 + [chaos] · Reaction
 *     "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that costs no more
 *      Energy and no more Power than the killed unit, ignoring its cost."
 *   × Conscription (unl-140-219) · Spell · Chaos · 5 + [chaos]×2 — "…Choose an enemy unit at a battlefield with
 *     3 [Might] or less. … Take control of it, exhaust it, and recall it."
 *   × Morbid Return (ogn-170-298) · Spell · Chaos · 2 · Action — "Return a unit from your trash to your hand."
 *   (+ Legion Rearguard ogn-010-298 · 2 · 2 Might · [Accelerate] — P2's, the conscript; Stalwart Poro ogn-052-298 ·
 *    2 · 2 Might · [Shield] — in P1's trash)
 *
 * Rules: 740.1.a / 740.1.b (friendly / enemy are CONTROLLER-relative), 357.2 (additional costs paid in step 4),
 * 428.1.a.1 (a cost-kill is a Kill Instruction), 428.2 / 323.5 / 056 / 056.2 (a killed permanent goes to its
 * OWNER's trash — never another player's non-board zone), 355.5 / 355.9.a / 355.15 ("a unit from your trash" names
 * a card in YOUR trash), 124 / 124.1 (leaving the board makes a new object — control change, exhaustion, damage,
 * buff all gone), 191.3 (whoever plays it next is its controller), 143.4 / 805 (enters exhausted / Accelerate).
 *
 * Question: P1 resolved Conscription (no XP) on P2's Legion Rearguard (here: carrying 1 damage and a buff, 3 Might)
 * → it sits exhausted in P1's base, owner P2 / controller P1. P1's trash: Stalwart Poro (2/–). P2's trash: empty.
 * P1 plays Heedless Resurrection killing the conscript to pay the cost, resurrecting the Poro.
 *   (a) Is the borrowed Rearguard a legal "friendly unit" for P1 to kill as a COST?
 *   (b) P1 paid the cost — does the Rearguard go to P1's trash or P2's? Could it ever be Heedless's own target?
 *   (c) Does the Poro come back (ceiling 2/0)? Final trashes.
 *   (d) Later: can P1's Morbid Return fetch the Rearguard? P2's? While P1 controlled it, could P2 have killed it
 *       for P2's own Heedless?
 *   (e) When P2 Morbid-Returns and replays it, does it remember being conscripted / exhausted / damaged / buffed?
 *
 * Expected: (a) yes — offered and accepted. (b) P2's trash (owner), immediately at cost payment; owner P2, no
 * controller memory; never a Heedless candidate (not in P1's trash). (c) yes: Poro played free to P1's base,
 * exhausted; P1's trash = {Conscription, Heedless}, P2's = {Rearguard}. (d) P1's Morbid Return can't (nothing of
 * P1's to return); P2's offers exactly the Rearguard → P2's hand; while P1 controlled it, it was ENEMY to P2 → not
 * a legal sacrifice for P2's Heedless. (e) no memory: replayed by P2 (with Accelerate → ready) it is P2's, 2 Might,
 * 0 damage, unbuffed, in P2's base.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEEDLESS = "unl-142-219";
const CONSCRIPTION = "unl-140-219";
const MORBID_RETURN = "ogn-170-298";
const LEGION_REARGUARD = "ogn-010-298";
const STALWART_PORO = "ogn-052-298";

/** A cheap unit for P2's trash in the (d) "P2's own Heedless" branch only (so that spell is castable at all, 357.3). */
const P2_TRASH_ONE = { energyCost: 1, might: 1, name: "P2 One-Drop" } as const;

/**
 * P1's turn 2. P2 holds bf1 with Legion Rearguard (1 damage, buffed → 3 Might) and a 4-cost/4-Might Anchor (keeps
 * bf1 P2's after the conscript leaves). P1: 9 energy + 3 chaos (Conscription 5+[chaos]×2, Heedless 2+[chaos],
 * Morbid Return 2); trash = Stalwart Poro; hand = Conscription, Heedless, Morbid Return. P2 hand: Morbid Return,
 * Heedless (P2's pool is filled on P2's turn).
 */
function board(opts: { p2TrashUnit?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 9, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", LEGION_REARGUARD, "rear", { buffed: true, damage: 1 })
    .unit(P2, "bf1", { energyCost: 4, might: 4, name: "P2 Anchor" }, "anchor")
    .trash(P1, STALWART_PORO, "poro")
    .hand(P1, CONSCRIPTION, "con")
    .hand(P1, HEEDLESS, "hr")
    .hand(P1, MORBID_RETURN, "p1mr")
    .hand(P2, MORBID_RETURN, "p2mr")
    .hand(P2, HEEDLESS, "p2hr");
  return opts.p2TrashUnit ? s.trash(P2, P2_TRASH_ONE, "p2one") : s;
}

/** "Earlier": P1 resolves Conscription (unpaid) on the Rearguard. Back in P1's open main phase with 4 energy + 1 chaos. */
async function conscripted(opts: { p2TrashUnit?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("con", { targets: "rear" });
  const settled = await game.settle();
  expect(settled.reason).toBe("open");
  expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 1 } });
  return game;
}

function castField(game: Game, seat: Seat, alias: string, name: string) {
  return game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === name || f.arg === name);
}

function offered(game: Game, seat: Seat, alias: string, name: string): string[] {
  return [...new Set((castField(game, seat, alias, name)?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/**
 * P1 plays Heedless killing the conscript and resurrects the Poro. The rules take "a unit from your trash" at play
 * time (355.5); the engine currently asks for it as the spell resolves (pinned as a BUG in
 * heedless-target-locked-disposal-recycle) — either way the Poro is named. Returns every set of resurrect
 * candidates the engine offered along the way.
 */
async function heedlessKillRearForPoro(game: Game): Promise<string[][]> {
  const offers: string[][] = [];
  if (castField(game, P1, "hr", "targets")) {
    offers.push(offered(game, P1, "hr", "targets"));
    await game.p1.cast("hr", { sacrifice: "rear", targets: "poro" });
  } else {
    await game.p1.cast("hr", { sacrifice: "rear" });
  }
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "hr") {
    offers.push(d.options.map((o) => o.card ?? o.key).sort());
    await game.p1.pick("poro");
    await game.settle();
  }
  return offers;
}

describe("Heedless Resurrection paid with a Conscripted unit — friendly to kill, but the OWNER's trash gets it", () => {
  test("premise: after Conscription the Rearguard is in P1's base — controller P1, owner P2, exhausted, still carrying its 1 damage and buff (3 Might, 458.1); Conscription → P1's trash", async () => {
    const game = await conscripted();
    expect(game.state("rear")).toMatchObject({ controller: P1, damage: 1, isBuffed: true, isExhausted: true, location: "base", might: 3, owner: P2 });
    expect(game.p1.units("base")).toEqual(["rear"]);
    expect(game.p2.units()).toEqual(["anchor"]);
    expect(game.p1.trash().sort()).toEqual(["con", "poro"]);
    expect(game.p2.trash()).toEqual([]);
  });

  // ── (a) friendly is controller-relative ───────────────────────────────────────────────────────

  test("(a) the borrowed Rearguard IS a legal 'friendly unit' for P1 to kill as Heedless's additional cost (740.1.a, 357.2) — it is the (only, required) sacrifice offered and the cast is accepted for 2 + [chaos]", async () => {
    const game = await conscripted();
    expect(game.p1.can("cast", "hr")).toBe(true);
    const sac = castField(game, P1, "hr", "sacrifice");
    expect(sac?.required).toBe(true);
    expect(sac?.options).toEqual(["rear"]);
    await game.p1.cast("hr", castField(game, P1, "hr", "targets") ? { sacrifice: "rear", targets: "poro" } : { sacrifice: "rear" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hr", controller: P1, triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
  });

  // ── (b) routing: owner's trash, at once ───────────────────────────────────────────────────────

  test("(b) the cost is paid immediately and the killed conscript goes to its OWNER's trash — P2's, not P1's — before anyone gets priority (428.2 / 323.5 / 056.2); there it is P2's card with no controller memory, 0 damage, unbuffed, 2 Might (124.1)", async () => {
    const game = await conscripted();
    await game.p1.cast("hr", castField(game, P1, "hr", "targets") ? { sacrifice: "rear", targets: "poro" } : { sacrifice: "rear" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 still holds priority
    expect(game.zoneOf("rear")).toBe("trash");
    expect(game.p2.trash()).toEqual(["rear"]);
    expect(game.p1.trash()).not.toContain("rear");
    expect(game.state("rear")).toMatchObject({ controller: P2, damage: 0, isBuffed: false, isExhausted: false, might: 2, owner: P2, zone: "trash" });
    expect(game.p1.units()).toEqual([]);
  });

  test("(b) it can never be Heedless's own resurrect object: 'a unit from YOUR trash' (355.9.a) — every candidate set the engine offers is exactly {Stalwart Poro}; naming the Rearguard is rejected", async () => {
    const game = await conscripted();
    if (castField(game, P1, "hr", "targets")) {
      expect(offered(game, P1, "hr", "targets")).toEqual(["poro"]);
      await expect(game.p1.cast("hr", { sacrifice: "rear", targets: "rear" })).rejects.toThrow();
      expect(game.zoneOf("hr")).toBe("hand");
      await game.p1.cast("hr", { sacrifice: "rear", targets: "poro" });
      await game.settle();
    } else {
      await game.p1.cast("hr", { sacrifice: "rear" });
      await game.settle();
      const d = game.decision();
      expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "hr" } });
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["poro"]);
      await expect(game.p1.pick("rear")).rejects.toThrow();
      await game.p1.pick("poro");
      await game.settle();
    }
    expect(game.zoneOf("rear")).toBe("trash");
    expect(game.p2.trash()).toEqual(["rear"]);
  });

  // ── (c) the Poro comes back ───────────────────────────────────────────────────────────────────

  test("(c) ceiling = the killed unit's 2 Energy / 0 Power → Stalwart Poro (2/–) qualifies and is played free to P1's base, exhausted (143.4); end state: P1's trash = {Conscription, Heedless}, P2's trash = {Rearguard}; P1 kept its last 2 energy", async () => {
    const game = await conscripted();
    const offers = await heedlessKillRearForPoro(game);
    for (const o of offers) {
      expect(o).toEqual(["poro"]);
    }
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ controller: P1, isExhausted: true, might: 2, owner: P1 });
    expect(game.p1.units("base")).toEqual(["poro"]);
    expect(game.p1.trash().sort()).toEqual(["con", "hr"]);
    expect(game.p2.trash()).toEqual(["rear"]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) who can reach it afterwards / who could have paid with it ─────────────────────────────

  test("(d) P1's Morbid Return ('a unit from your trash') can never reach the Rearguard: with only spells left in P1's trash it is not even castable, and naming the Rearguard is rejected", async () => {
    const game = await conscripted();
    await heedlessKillRearForPoro(game);
    expect(game.p1.energy()).toBe(2); // Morbid Return's cost is covered — that is not the obstacle
    expect(offered(game, P1, "p1mr", "targets")).not.toContain("rear");
    expect(game.p1.can("cast", "p1mr")).toBe(false);
    const r = await game.p1.try((p) => p.cast("p1mr", { targets: "rear" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rear")).toBe("trash");
    expect(game.zoneOf("p1mr")).toBe("hand");
  });

  test("(d) P2's Morbid Return CAN: on P2's turn it offers exactly the Rearguard and returns it to P2's hand", async () => {
    const game = await conscripted();
    await heedlessKillRearForPoro(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 2 });
    expect(offered(game, P2, "p2mr", "targets")).toEqual(["rear"]);
    await game.p2.cast("p2mr", { targets: "rear" });
    await game.settle();
    expect(game.zoneOf("rear")).toBe("hand");
    expect(game.p2.hand()).toContain("rear");
    expect(game.p1.hand()).not.toContain("rear");
    expect(game.p2.trash()).toEqual(["p2mr"]);
  });

  test("(d) while P1 still CONTROLS it, the Rearguard is an ENEMY unit to P2 (740.1.b): on P2's turn P2's own Heedless offers only P2's Anchor as the sacrifice — never the conscript sitting in P1's base — and naming it is rejected", async () => {
    // Branch: P1 does NOT play Heedless; P2's trash holds a 1-cost unit so P2's Heedless is castable at all (357.3).
    const game = await conscripted({ p2TrashUnit: true });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 2, power: { chaos: 1 } });
    expect(game.state("rear")).toMatchObject({ controller: P1, location: "base", owner: P2 });
    expect(game.p2.can("cast", "p2hr")).toBe(true);
    expect(castField(game, P2, "p2hr", "sacrifice")?.options).toEqual(["anchor"]);
    const r = await game.p2.try((p) => p.cast("p2hr", { sacrifice: "rear" }));
    expect(r.ok).toBe(false);
    expect(game.state("rear")).toMatchObject({ controller: P1, location: "base" });
    expect(game.zoneOf("p2hr")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
  });

  // ── (e) no memory ─────────────────────────────────────────────────────────────────────────────

  test("(e) replayed by P2 from hand (paying Accelerate → enters READY) it is a fresh object under P2's control (124.1, 191.3): P2's base, owner+controller P2, 2 Might, 0 damage, no buff — nothing of the conscription, exhaustion, damage or buff survives", async () => {
    const game = await conscripted();
    await heedlessKillRearForPoro(game);
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 5, power: { fury: 1 } }); // Morbid Return 2 + Rearguard 2 + Accelerate 1+[fury]
    await game.p2.cast("p2mr", { targets: "rear" });
    await game.settle();
    expect(game.zoneOf("rear")).toBe("hand");
    await game.p2.play("rear", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.state("rear")).toMatchObject({
      controller: P2,
      damage: 0,
      isBuffed: false,
      isExhausted: false,
      isReady: true,
      location: "base",
      might: 2,
      owner: P2,
      zone: "base",
    });
    expect(game.p2.units("base")).toEqual(["rear"]);
    expect(game.p1.units()).toEqual(["poro"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
