/**
 * Interaction: Temporal Breach (ven-066-166) · Spell · Mind · 2+[mind] · [Hidden]
 *     "Banish a unit, then its owner plays it to the same location, ignoring its cost."            — P1 casts it from HAND
 *   × Mageseeker Warden (ogn-070-298) · Unit · Calm · 6+[calm] · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. …"                 — P2's
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla)                        — the breached unit
 *
 * Rules: 355.5 (Breach's target = a unit on the board, chosen at play), 356.1.b.1 (replay "ignoring its cost" = free),
 * 358.3.a (an effect that PREVENTS a game action does not stop the card instructing it from being played; the
 * instruction is skipped on resolution as impossible), 419.3 / 419.3.b (effect-play = Limited play by the OWNER, all
 * play steps as normal — so the Warden's location restriction applies), 419.3.c (nothing eligible → nothing happens,
 * resolution continues — no prompt), 054.1 (can't beats can: the Warden overrides the location Breach names), 108.6
 * (banished → owner's banishment, a new public object), 323.6 / 323.7 (a battlefield with no unit of its controller is
 * lost at the next Open-state Cleanup, and that player's facedown card there is trashed), 359.2.c (a played unit
 * enters exhausted). Rulings 445563aa… / 608d69cb… (Rockfall/Brynhir: forbidden sole destination → the card stays
 * where instruction 1 put it), 648dae7b… (a replayed unit means the battlefield is never empty at an Open cleanup).
 *
 * Question — P1's turn, Neutral Open; P1 casts Breach from hand (2+[mind]) each time:
 *   (a) P2's Warden at bf2; P1 Breaches P1's OWN Sergeant at bf1 (P1's only unit there; P1 also has a facedown card
 *       there). Sergeant? any prompt for P1? bf1? the facedown card?
 *   (b) same Warden at bf2, Sergeant in P1's BASE.      (c) Warden in P2's BASE, Sergeant at bf1.
 *   (d) P1 Breaches the WARDEN itself at bf2.           (e) Warden at bf2, P1 Breaches a P2-OWNED Sergeant at bf1.
 *   Always: energy paid, where Breach ends, no half-done replay (unit on chain / phantom pending item).
 *
 * Expected: cost exactly 2+[mind]; P2 gets a Reaction window; Breach → P1's trash; chain empty, no pending item.
 *   (a) the replay to bf1 is forbidden for P1 (an opponent of the Warden's controller) → skipped: Sergeant STAYS in
 *       P1's banishment (not redirected to base), NO prompt of any kind, no extra energy touched; bf1 (now empty of P1
 *       units) is lost at the Cleanup and P1's facedown card there is trashed.
 *   (b) "same location" = base, which the Warden allows → replayed free, enters base exhausted as a NEW object.
 *   (c) Warden in base restricts nothing → replayed to bf1 exhausted, free; P1 keeps bf1 and its facedown card.
 *   (d) legal target, no surcharge; Warden banished then replayed by P2 to bf2 exhausted; its lock is live again after.
 *   (e) the replaying owner is P2 — not the Warden's opponent → P2's Sergeant returns to bf1 exhausted under P2.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166";
const MAGESEEKER_WARDEN = "ogn-070-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const PAKAA_CUB = "ogn-135-298"; // a real [Hidden] unit — P1's facedown card at bf1

interface Cfg {
  readonly wardenAt: "bf2" | "base";
  readonly sargeAt: "bf1" | "base";
  /** who owns/controls the Sergeant (default P1) */
  readonly sargeOwner?: Seat;
}

/**
 * Turn 3, P1 active, Neutral Open. bf1: controlled by the Sergeant's owner, the Sergeant standing there (or in its
 * owner's base) carrying 2 damage and a buff (to show the replay makes a NEW object); when P1 owns bf1 P1 also has a
 * Pakaa Cub facedown there. bf2: P2's — a 1-Might Sentry plus (by default) the Warden. P1: Temporal Breach + a 2-cost
 * vanilla Recruit in hand; pool 5 energy + [mind] (Breach leaves 3 — enough to show where the Recruit may be played).
 */
function board(c: Cfg) {
  const owner = c.sargeOwner ?? P1;
  let s = scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .battlefield("bf1", { controller: owner })
    .battlefield("bf2", { controller: P2 })
    .unit(owner, c.sargeAt, VANGUARD_SERGEANT, "sarge", { buffed: true, damage: 2 })
    .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, c.wardenAt, MAGESEEKER_WARDEN, "warden")
    .hand(P1, TEMPORAL_BREACH, "breach")
    .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Recruit" }, "recruit");
  if (owner === P1 && c.sargeAt === "bf1") {
    s = s.facedown(P1, "bf1", PAKAA_CUB, "cub");
  }
  return s;
}

function targetsOffered(game: Game): string[] {
  const field = game.p1.option("cast", "breach")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].toSorted();
}

/** Normalised play locations offered to P1 for the hand Recruit ("base" | battlefield id). */
function recruitLocations(game: Game): string[] {
  const raw = game.p1.option("play", "recruit")?.fields.find((f) => f.arg === "to")?.options ?? [];
  return raw.map((v) => String(v).replace(/^battlefield-/, "")).toSorted();
}

/** P1 casts Breach at `target`; P1 then P2 pass → Breach resolves (banish + replay happen inside its resolution). */
async function breachResolvedOn(c: Cfg, target: string): Promise<{ game: Game; afterP2Pass: Awaited<ReturnType<Game["p2"]["passPriority"]>> }> {
  const game = await board(c).build();
  expect(targetsOffered(game)).toContain(target);
  await game.p1.cast("breach", { targets: target });
  expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 0 } }); // exactly 2 + [mind]
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "breach", controller: P1, targets: [target], triggered: false })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's Reaction window
  const afterP2Pass = await game.p2.passPriority();
  expect(game.zoneOf("breach")).toBe("trash");
  return { afterP2Pass, game };
}

/** Common tail: Breach in P1's trash, chain empty, no prompt/pending item, exactly Breach's cost paid, Neutral Open. */
function expectCleanEnd(game: Game): void {
  expect(game.p1.trash()).toContain("breach");
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("sarge")).not.toBe("chain");
  expect(game.gameState.pendingChoice).toBeUndefined();
  expect(game.gameState.suspendedPlay).toBeUndefined();
  expect(game.gameState.deferredSequenceRest).toBeUndefined();
  expect(game.gameState.interaction?.chain?.items ?? []).toEqual([]);
  expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 0 } });
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  expect(game.violations()).toEqual([]);
}

describe("setup — Breach targets any unit on the board; the Warden's lock is visible on an ordinary hand play", () => {
  test("Breach (355.5) offers every unit on the board — own Sergeant, the Sentry and the Warden itself (no Deflect anywhere, so no surcharge question)", async () => {
    const game = await board({ sargeAt: "bf1", wardenAt: "bf2" }).build();
    expect(game.p1.can("cast", "breach")).toBe(true);
    expect(targetsOffered(game)).toEqual(["sarge", "sentry", "warden"]);
  });

  test("with the Warden at bf2 P1's hand Recruit may only go to base although P1 controls bf1; with the Warden in P2's base it may go to base OR bf1", async () => {
    const locked = await board({ sargeAt: "bf1", wardenAt: "bf2" }).build();
    expect(recruitLocations(locked)).toEqual(["base"]);
    const free = await board({ sargeAt: "bf1", wardenAt: "base" }).build();
    expect(recruitLocations(free)).toEqual(["base", "bf1"]);
  });
});

describe("(a) Warden at bf2, P1 Breaches its OWN Sergeant at bf1 — the replay is impossible: the Sergeant stays banished", () => {
  test("on resolution the Sergeant is banished and NOT replayed anywhere: it sits in P1's banishment (108.6), not at bf1, not redirected to base (358.3.a, 054.1)", async () => {
    const { game } = await breachResolvedOn({ sargeAt: "bf1", wardenAt: "bf2" }, "sarge");
    expect(game.zoneOf("sarge")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["sarge"]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.base()).not.toContain("sarge");
    expect(game.state("sarge")).toMatchObject({ controller: P1, owner: P1, zone: "banishment" });
  });

  test("P1 receives NO prompt of any kind (no location pick, no optional-cost question, 419.3.c): the first decision after P2's pass is P1's ordinary main-phase action menu, and only the pass itself was executed", async () => {
    const { game, afterP2Pass } = await breachResolvedOn({ sargeAt: "bf1", wardenAt: "bf2" }, "sarge");
    expect(afterP2Pass.executed.filter((m) => m.auto !== true).map((m) => m.moveId)).toEqual(["passChainPriority"]);
    expect(afterP2Pass.decision).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.decision()?.kind).toBe("action");
    expectCleanEnd(game);
  });

  test("bf1 now holds no P1 unit → P1 loses it at the Cleanup after Breach resolves (323.6) and P1's facedown Pakaa Cub there is trashed (323.7); the Warden never moved", async () => {
    const { game } = await breachResolvedOn({ sargeAt: "bf1", wardenAt: "bf2" }, "sarge");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.p1.trash().toSorted()).toEqual(["breach", "cub"]);
    expect(game.state("warden")).toMatchObject({ isExhausted: false, zone: "battlefield-bf2" });
  });

  test("no partial replay state leaks: chain empty, nothing pending, exactly 2+[mind] spent, and P1 can simply carry on (e.g. the hand Recruit is playable — to base only, the Warden still locks battlefields)", async () => {
    const { game } = await breachResolvedOn({ sargeAt: "bf1", wardenAt: "bf2" }, "sarge");
    expectCleanEnd(game);
    expect(recruitLocations(game)).toEqual(["base"]);
    await game.p1.play("recruit", { to: "base" });
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.zoneOf("sarge")).toBe("banishment"); // still there afterwards
  });
});

describe("(b) Warden at bf2, Sergeant in P1's BASE — 'same location' = base is permitted: replayed free", () => {
  test("the Sergeant comes straight back to P1's base: exhausted (359.2.c), for free (356.1.b.1 — pool still shows only Breach's cost), banishment empty", async () => {
    const { game } = await breachResolvedOn({ sargeAt: "base", wardenAt: "bf2" }, "sarge");
    expect(game.state("sarge")).toMatchObject({ controller: P1, isExhausted: true, owner: P1, zone: "base" });
    expect(game.p1.banishment()).toEqual([]);
    expectCleanEnd(game);
  });

  test("it is a NEW object: the 2 damage and the buff it carried are gone (4 Might, undamaged, unbuffed)", async () => {
    const game = await board({ sargeAt: "base", wardenAt: "bf2" }).build();
    expect(game.state("sarge")).toMatchObject({ damage: 2, isBuffed: true, might: 5 });
    await game.p1.cast("breach", { targets: "sarge" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("sarge")).toMatchObject({ baseMight: 4, damage: 0, isBuffed: false, might: 4, zone: "base" });
  });
});

describe("(c) Warden in P2's BASE, Sergeant at bf1 — no restriction: replayed to bf1, P1 keeps bf1 throughout", () => {
  test("the Sergeant is replayed to bf1 exhausted and free, as a new object (damage/buff gone); P1 still controls bf1 and its facedown Cub is untouched (648dae7b…)", async () => {
    const { game } = await breachResolvedOn({ sargeAt: "bf1", wardenAt: "base" }, "sarge");
    expect(game.state("sarge")).toMatchObject({ controller: P1, damage: 0, isBuffed: false, isExhausted: true, might: 4, zone: "battlefield-bf1" });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.zoneOf("cub")).toBe("facedown-bf1");
    expectCleanEnd(game);
    expect(recruitLocations(game)).toEqual(["base", "bf1"]); // Warden in base locks nothing
  });
});

describe("(d) P1 Breaches the WARDEN itself at bf2 — P2 replays it to bf2; the lock is live again afterwards", () => {
  test("legal target at no extra cost; on resolution the Warden is banished and replayed by its owner P2 to bf2, EXHAUSTED, P2's banishment empty; the Sergeant at bf1 is untouched and P1 keeps bf1", async () => {
    const { game } = await breachResolvedOn({ sargeAt: "bf1", wardenAt: "bf2" }, "warden");
    expect(game.state("warden")).toMatchObject({ controller: P2, isExhausted: true, might: 5, owner: P2, zone: "battlefield-bf2" });
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.state("sarge")).toMatchObject({ damage: 2, isBuffed: true, isExhausted: false, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.zoneOf("cub")).toBe("facedown-bf1");
    expectCleanEnd(game);
  });

  test("once it has landed its static is back on: P1's hand Recruit is again offered to base only", async () => {
    const { game } = await breachResolvedOn({ sargeAt: "bf1", wardenAt: "bf2" }, "warden");
    expect(recruitLocations(game)).toEqual(["base"]);
    await expect(game.p1.play("recruit", { to: "bf1" })).rejects.toThrow();
    expect(game.zoneOf("recruit")).toBe("hand");
  });
});

describe("(e) Warden at bf2, P1 Breaches a P2-OWNED Sergeant at bf1 — P2 is not the Warden's opponent: replayed normally", () => {
  test("the Sergeant returns to bf1 under P2, exhausted, as a new object; P2 keeps bf1; both banishments empty; clean end state for P1", async () => {
    const { game } = await breachResolvedOn({ sargeAt: "bf1", sargeOwner: P2, wardenAt: "bf2" }, "sarge");
    expect(game.state("sarge")).toMatchObject({ controller: P2, damage: 0, isBuffed: false, isExhausted: true, might: 4, owner: P2, zone: "battlefield-bf1" });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expectCleanEnd(game);
  });
});
