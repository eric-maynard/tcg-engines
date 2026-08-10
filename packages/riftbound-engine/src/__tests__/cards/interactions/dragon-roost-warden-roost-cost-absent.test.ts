/**
 * Interaction: Dragon Roost (ven-157-166) · Battlefield
 *     "Any player may pay [rainbow][rainbow] as an additional cost to play a Dragon. If they do, they play it
 *      to this battlefield."
 *   × Mageseeker Warden (ogn-070-298) · Unit · Calm · 6+[calm] · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. …"
 *   × Dune Drake (ogn-131-298) · Unit · Body · 5 · 5 Might · DRAGON
 *     "When I attack, give me +2 [Might] this turn if there is a ready enemy unit here."
 *
 * Rules: 355.1.a / 356.2.b.1 (an optional additional cost is elected in step 2 "as I am played" and added on
 * top of the base cost), 355.2.a (Valid locations: your base or a battlefield you control), 355.2.b (an
 * effect — the Roost — can make another location Valid; control not required), 054.1 (can't beats can: the
 * Warden's prohibition overrides the Roost's permission), 355.16 / 357.3 (a player may not make a choice /
 * pay a cost that deterministically makes the play illegal → the option must be ABSENT), 358.3 / 358.5
 * (Check Legality; on failure everything is undone atomically), 359.2.c (a played unit enters exhausted),
 * 190.3.a.1 (played to a battlefield you don't control → you apply Contested), 464.2.c (combat begins at the
 * next Neutral Open cleanup with the contesting player attacking).
 *
 * Question: P2 holds the Roost with a lone READY 2-Might Keeper; P1's turn, Neutral Open, Dune Drake in hand,
 * 5 energy + 2 rainbow, P1 controls bf1.
 *   (a) Warden AT a battlefield (bf3, or the Roost itself): is "pay [A][A] → Roost" offered? Which locations?
 *   (b) rollback probe: a raw playUnit {location: Roost, paidAdditionalCost: true} — state afterwards?
 *   (c) Warden in P2's BASE: Roost offered though P1 doesn't control it? Cost, entry, Contested, combat, +2?
 *   (d) Warden in base, P1 declines the Roost cost: locations / cost?
 *
 * Expected: (a) NOT offered — locations = {base} only (bf1 suppressed too); base play = 5 energy, enters
 * exhausted, rainbow untouched. (b) refused atomically: 5 energy AND 2 rainbow intact, Drake in hand, chain
 * empty, Roost P2's / not Contested, no showdown, no card-played bookkeeping. (c) offered: {base, bf1, roost};
 * electing it = 5 + [A][A] → 0/0; Drake enters the Roost exhausted, P1 applies Contested; combat begins with
 * P1 attacking, "When I attack" sees the ready Keeper → 7 vs 2 → Keeper dies, P1 conquers the Roost (+1).
 * (d) {base, bf1} for 5, rainbow untouched.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAGON_ROOST = "ven-157-166";
const WARDEN = "ogn-070-298";
const DUNE_DRAKE = "ogn-131-298";

type WardenAt = "base" | "bf3" | "roost";

/**
 * P1's turn, Neutral Open. Roost: P2's (live text) with a READY 2-Might Keeper. bf1: P1's (Holder). bf3: P2's
 * (blank). P2's Mageseeker Warden sits at `wardenAt`. P1: Dune Drake in hand, exactly 5 energy + 2 rainbow.
 */
function board(wardenAt: WardenAt) {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow: 2 } })
    .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P2, "roost", { might: 2, name: "Roost Keeper" }, "keeper")
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf3", { might: 1, name: "bf3 Holder" }, "bf3holder")
    .unit(P2, wardenAt, WARDEN, "warden")
    .hand(P1, DUNE_DRAKE, "drake");
}

/** Play locations offered to P1 for the Drake, battlefield ids bare, sorted. */
const locations = (game: Game): string[] =>
  ((game.p1.option("play", "drake")?.fields.find((f) => f.arg === "to")?.options as string[] | undefined) ?? [])
    .map((z) => (z.startsWith("battlefield-") ? z.slice("battlefield-".length) : z))
    .sort();

/** Does any enumerated playUnit variant for the Drake carry the paid-additional-cost (Roost) election? */
const roostVariantOffered = (game: Game): boolean =>
  (game.p1.option("play", "drake")?.variants ?? []).some((v) => {
    const p = (v.params ?? {}) as { location?: string; paidAdditionalCost?: boolean };
    return p.location === "battlefield-roost" || p.paidAdditionalCost === true;
  });

const showdowns = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
const roost = (game: Game) => game.gameState.battlefields.roost;

describe("Dragon Roost × Mageseeker Warden × Dune Drake — the Roost election must be ABSENT while Warden confines plays to base", () => {
  // ── (a) Warden at a battlefield ──────────────────────────────────────────────────────────────

  for (const at of ["bf3", "roost"] as const) {
    test(`(a) Warden at ${at}: the Drake is playable, but ONLY to base — neither bf1 nor the paid Roost option is offered (054.1, 355.16, 357.3)`, async () => {
      const game = await board(at).build();
      expect(game.p1.can("play", "drake")).toBe(true);
      expect(locations(game)).toEqual(["base"]);
      expect(roostVariantOffered(game)).toBe(false);
      const r = await game.p1.try((p) => p.play("drake", { to: "roost" }));
      expect(r.ok).toBe(false);
      const r2 = await game.p1.try((p) => p.play("drake", { to: "bf1" }));
      expect(r2.ok).toBe(false);
      expect(game.zoneOf("drake")).toBe("hand");
      expect(game.p1.resources()).toEqual({ energy: 5, power: { rainbow: 2 } });
    });
  }

  test("(a) Warden at bf3: playing to base costs exactly 5 energy, the [A][A] stay, the Drake enters EXHAUSTED; Roost untouched (359.2.c)", async () => {
    const game = await board("bf3").build();
    await game.p1.play("drake", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true, might: 5 });
    expect(roost(game)).toMatchObject({ contested: false, controller: P2 });
    expect(showdowns(game)).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  // ── (b) rollback probe ───────────────────────────────────────────────────────────────────────

  test("(b) Warden at bf3: a RAW playUnit forcing {location: Roost, paidAdditionalCost: true} is refused and NOTHING sticks — 5 energy AND 2 rainbow intact, Drake in hand, chain empty, Roost P2's / not Contested, no showdown, no card-played count (358.5)", async () => {
    const game = await board("bf3").build();
    const played0 = game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;
    const r = await game.p1.try((p) => p.do("playUnit", { cardId: "drake", location: "battlefield-roost", paidAdditionalCost: true, playerId: P1 }));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 5, power: { rainbow: 2 } });
    expect(game.p1.runes({ ready: false })).toEqual([]); // no rune was tapped/recycled behind our back either
    expect(game.zoneOf("drake")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(roost(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.cardsAt("roost").sort()).toEqual(["keeper"]);
    expect(showdowns(game)).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(played0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) same probe with Warden ON the Roost: refused just the same, state pristine", async () => {
    const game = await board("roost").build();
    const r = await game.p1.try((p) => p.do("playUnit", { cardId: "drake", location: "battlefield-roost", paidAdditionalCost: true, playerId: P1 }));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 5, power: { rainbow: 2 } });
    expect(game.zoneOf("drake")).toBe("hand");
    expect(roost(game)).toMatchObject({ contested: false, controller: P2 });
    expect(showdowns(game)).toEqual([]);
  });

  // ── (c) Warden in base: the Roost is live ────────────────────────────────────────────────────

  test("(c) Warden in P2's BASE: the Roost IS offered although P1 does not control it — locations = {base, bf1, roost} (355.2.a, 355.2.b)", async () => {
    const game = await board("base").build();
    expect(roost(game)?.controller).toBe(P2);
    expect(locations(game)).toEqual(["base", "bf1", "roost"]);
    expect(locations(game)).not.toContain("bf3"); // an enemy battlefield without such text is never offered
  });

  test("(c) electing it: total = 5 energy + [A][A] → pool 0/0; the Drake enters the Roost EXHAUSTED under P1's control and P1 applies Contested to P2's Roost (356.2.b.1, 359.2.c, 190.3.a.1)", async () => {
    const game = await board("base").build();
    await game.p1.play("drake", { to: "roost" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("drake")).toBe("battlefield-roost");
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true });
    expect(roost(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test("(c) with P2's Keeper present a COMBAT begins at the next Neutral Open cleanup — on P1's turn P1 is the Attacker and holds Focus; the Drake gains Attacker and 'When I attack' goes on the chain as P1's item (464.2.c)", async () => {
    const game = await board("base").build();
    await game.p1.play("drake", { to: "roost" });
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ attackingPlayer: P1, battlefieldId: "roost", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("drake").combatRole).toBe("attacker");
    expect(game.state("keeper").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", controller: P1, triggered: true })]);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("(c) the Keeper is READY, so the attack trigger gives the Drake +2 this turn → 7 Might (an exhausted unit still fights)", async () => {
    const game = await board("base").build();
    expect(game.state("keeper").isReady).toBe(true);
    await game.p1.play("drake", { to: "roost" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.state("drake")).toMatchObject({ combatRole: "attacker", isExhausted: true, might: 7 });
    expect(game.state("keeper").might).toBe(2);
  });

  test("(c) contrast inside (c): were the Keeper EXHAUSTED, the trigger's condition fails and the Drake stays 5", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { rainbow: 2 } })
      .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "roost", { might: 2, name: "Roost Keeper" }, "keeper", { exhausted: true })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "base", WARDEN, "warden")
      .hand(P1, DUNE_DRAKE, "drake")
      .build();
    await game.p1.play("drake", { to: "roost" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("drake")).toMatchObject({ combatRole: "attacker", might: 5 });
  });

  test("(c) combat: 7 into 2 kills the Keeper; the Drake survives alone → P1 CONQUERS the Roost and scores 1; Contested cleared", async () => {
    const game = await board("base").build();
    await game.p1.play("drake", { to: "roost" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.locationOf("drake")).toBe("roost");
    expect(game.state("drake").damage).toBeLessThanOrEqual(2);
    expect(roost(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.conqueredThisTurn[P1]).toEqual(["roost"]);
    expect(showdowns(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) Warden in base, Roost cost declined ──────────────────────────────────────────────────

  test("(d) Warden in base, DECLINING the Roost cost: base or bf1 for exactly 5 energy — the [A][A] stay, nothing Contested, no combat (355.2.a)", async () => {
    const toBase = await board("base").build();
    await toBase.p1.play("drake", { to: "base" });
    expect(toBase.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    await toBase.settle();
    expect(toBase.zoneOf("drake")).toBe("base");
    expect(toBase.state("drake").isExhausted).toBe(true);
    expect(roost(toBase)).toMatchObject({ contested: false, controller: P2 });
    expect(showdowns(toBase)).toEqual([]);

    const toBf1 = await board("base").build();
    await toBf1.p1.play("drake", { to: "bf1" });
    expect(toBf1.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    await toBf1.settle();
    expect(toBf1.zoneOf("drake")).toBe("battlefield-bf1");
    expect(toBf1.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(roost(toBf1)).toMatchObject({ contested: false, controller: P2 });
    expect(showdowns(toBf1)).toEqual([]);
    expect(toBf1.p1.points()).toBe(0);
  });
});
