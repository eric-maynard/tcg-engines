/**
 * Interaction: banishing / bouncing a POSSESSED unit — zones follow OWNERSHIP, "you banish" follows the
 * player performing the banish, and Master of Shadows needs BOTH.
 *   Possession (ogn-203-298) · Spell · Chaos · 8 + [chaos]×3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Wind and Ghosts (ven-106-166) · Spell · Chaos · 3 + [chaos] · Action
 *     "Choose a unit at a battlefield. If it has 3 [Might] or less, banish it. Otherwise, return it to its
 *      owner's hand."
 *   × Master of Shadows (ven-191-166) · Legend · "When you banish a card you own, empower me. …" — BOTH players
 *   (+ Stalwart Poro ogn-052-298 (2 Might) / Vanguard Sergeant ogn-219-298 (4 Might) as the possessed unit)
 *
 * Question. (A) P1 Possessed P2's Stalwart Poro and moved it to bf1; on P1's turn P1 casts Wind and Ghosts on
 * it. Whose banishment? Does P1's legend empower (P1 banished)? P2's (P2 owns)? (B) mirror: P2 had Possessed
 * P1's Poro and parked it at bf2; P1 casts Wind and Ghosts on it — whose banishment, does P1's legend empower
 * although P1 did not control it? (C) as (A) but the possessed unit is P2's 4-Might Sergeant.
 *
 * Rules: 056 / 056.1 / 056.2 (hand, banishment … are per-player zones a card enters only for its OWNER),
 * 108.6.a (banishment is a non-board zone), 127.1 (ownership never changes), 124 / 124.1 (zone change → new
 * object: control grant gone), 191.2 (the spell's controller performs its instructions → P1 "banishes"),
 * 427.1 / 427.2 (banish), 359.3.d (resolved spell → its owner's trash), 477.1.a (control layer).
 *
 * Expected: (A) before (owner P2, controller P1, bf1) → after: P2's banishment, control back to owner, no
 * control effect left; NEITHER legend empowers (P1 banished but doesn't own; P2 owns but didn't banish);
 * Wind and Ghosts → P1's trash. (B) → P1's banishment (never P2's); P1's legend DOES empower, P2's does not.
 * (C) 4 Might → returned to P2's HAND (owner), not banished; nobody empowers. No card ever ends in a P1
 * zone unless P1 owns it.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const WIND_AND_GHOSTS = "ven-106-166";
const MASTER_OF_SHADOWS = "ven-191-166";
const STALWART_PORO = "ogn-052-298";
const VANGUARD_SERGEANT = "ogn-219-298";

/**
 * (A)/(C): P1's turn with exactly Possession (8+[chaos]×3) + Wind and Ghosts (3+[chaos]). Both legends are
 * Master of Shadows. bf1 is P1's (a Holder keeps it), bf2 is P2's (a Guard keeps it) with P2's `victim` on it.
 */
function boardA(victim: string = STALWART_PORO) {
  return scenario()
    .victoryScore(15)
    .resources(P1, { energy: 11, power: { chaos: 4 } })
    .legend(P1, MASTER_OF_SHADOWS, "mos1")
    .legend(P2, MASTER_OF_SHADOWS, "mos2")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "P2 Guard" }, "guard")
    .unit(P2, "bf2", victim, "victim")
    .hand(P1, POSSESSION, "poss")
    .hand(P1, WIND_AND_GHOSTS, "wag");
}

/** (B): P2's turn first with exactly Possession's cost; P1's Stalwart Poro at bf1; Wind and Ghosts in P1's hand. */
function boardB() {
  return scenario()
    .victoryScore(15)
    .active(P2)
    .resources(P2, { energy: 8, power: { chaos: 3 } })
    .legend(P1, MASTER_OF_SHADOWS, "mos1")
    .legend(P2, MASTER_OF_SHADOWS, "mos2")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "P2 Guard" }, "guard")
    .unit(P1, "bf1", STALWART_PORO, "victim")
    .hand(P2, POSSESSION, "poss")
    .hand(P1, WIND_AND_GHOSTS, "wag");
}

/** (A)/(C) "earlier": P1 resolves Possession on the victim (→ P1's base) and Standard-Moves it to P1's bf1. */
async function p1PossessedAtBf1(victim?: string): Promise<Game> {
  const game = await boardA(victim).build();
  await game.p1.cast("poss", { targets: "victim" });
  await game.settle();
  expect(game.state("victim")).toMatchObject({ controller: P1, location: "base", owner: P2 });
  await game.p1.move("victim", "bf1");
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 1 } }); // exactly Wind and Ghosts left
  return game;
}

/** (B) "earlier": P2 resolves Possession on P1's Poro, parks it at P2's bf2, passes the turn; P1 refills for Wind and Ghosts. */
async function p2PossessedAtBf2P1Turn(): Promise<Game> {
  const game = await boardB().build();
  await game.p2.cast("poss", { targets: "victim" });
  await game.settle();
  expect(game.state("victim")).toMatchObject({ controller: P2, location: "base", owner: P1 });
  await game.p2.move("victim", "bf2");
  await game.settle();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 3, power: { chaos: 1 } }); // pools emptied at turn end
  return game;
}

async function castWindAndGhosts(game: Game): Promise<void> {
  await game.p1.cast("wag", { targets: "victim" });
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.chain()).toEqual([]);
}

describe("(A) no-side — P1 banishes the P2-OWNED Poro that P1 controls", () => {
  test("before: (owner P2, controller P1, zone bf1), 2 Might, still carrying Possession's control effect; Wind and Ghosts offers it as 'a unit at a battlefield'", async () => {
    const game = await p1PossessedAtBf1();
    expect(game.state("victim")).toMatchObject({ controller: P1, might: 2, owner: P2, zone: "battlefield-bf1" });
    expect(game.state("victim").meta.controlEffects).toEqual([{ controllerId: P1 }]);
    expect(game.p1.units("bf1").sort()).toEqual(["holder", "victim"]);
    const offered = (game.p1.option("cast", "wag")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("victim");
  });

  test("after: 2 ≤ 3 → banished into its OWNER's banishment — P2's, never P1's (056, 056.2, 108.6.a); it is a new object: control back with the owner, no control effect, not exhausted (124)", async () => {
    const game = await p1PossessedAtBf1();
    await castWindAndGhosts(game);
    expect(game.zoneOf("victim")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["victim"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.state("victim")).toMatchObject({ controller: P2, isExhausted: false, owner: P2, zone: "banishment" });
    expect(game.state("victim").meta.controlEffects).toBeUndefined();
    expect(game.p1.units("bf1")).toEqual(["holder"]);
  });

  test("P1's Master of Shadows does NOT empower (P1 banished it but does not own it) and P2's does NOT either (P2 owns it but did not banish it); nothing is left on the chain", async () => {
    const game = await p1PossessedAtBf1();
    expect(game.state("mos1").isEmpowered).toBe(false);
    expect(game.state("mos2").isEmpowered).toBe(false);
    await castWindAndGhosts(game);
    expect(game.state("mos1").isEmpowered).toBe(false);
    expect(game.state("mos2").isEmpowered).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("activate", "mos1")).toBe(false); // the Disempower-cost ability stays locked
  });

  test("Wind and Ghosts itself goes to P1's trash (359.3.d); P2's trash and hand are untouched; pool spent exactly", async () => {
    const game = await p1PossessedAtBf1();
    const p2Hand = game.p2.hand().length;
    await castWindAndGhosts(game);
    expect(game.zoneOf("wag")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["poss", "wag"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.violations()).toEqual([]);
  });
});

describe("(B) yes-side — P1 banishes the P1-OWNED Poro that P2 controls", () => {
  test("before: (owner P1, controller P2, zone bf2); it is an ENEMY unit to P1 now, yet a legal Wind and Ghosts target ('a unit at a battlefield')", async () => {
    const game = await p2PossessedAtBf2P1Turn();
    expect(game.state("victim")).toMatchObject({ controller: P2, might: 2, owner: P1, zone: "battlefield-bf2" });
    expect(game.p2.units("bf2").sort()).toEqual(["guard", "victim"]);
    expect(game.p1.units()).not.toContain("victim");
    const offered = (game.p1.option("cast", "wag")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("victim");
  });

  test("after: it lands in P1's banishment (owner P1) — never P2's — as a fresh object with no control effect (056.2, 127.1, 124)", async () => {
    const game = await p2PossessedAtBf2P1Turn();
    await castWindAndGhosts(game);
    expect(game.zoneOf("victim")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["victim"]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.state("victim")).toMatchObject({ controller: P1, owner: P1, zone: "banishment" });
    expect(game.state("victim").meta.controlEffects).toBeUndefined();
    expect(game.p2.units("bf2")).toEqual(["guard"]);
  });

  test("P1's Master of Shadows DOES empower — P1 banished a card P1 owns; who controlled the unit is irrelevant (127.1, 191.2) — and P2's does not", async () => {
    const game = await p2PossessedAtBf2P1Turn();
    expect(game.state("mos1").isEmpowered).toBe(false);
    await castWindAndGhosts(game);
    expect(game.state("mos1").isEmpowered).toBe(true);
    expect(game.state("mos1").isReady).toBe(true); // empowering never exhausts
    expect(game.state("mos2").isEmpowered).toBe(false);
    // …which unlocks P1's "[Action] Disempower me, [Exhaust]: Discard 1, then draw 1" right now, on P1's turn
    expect(game.p1.can("activate", "mos1")).toBe(true);
    expect(game.p2.can("activate", "mos2")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});

describe("(C) as (A) but the possessed unit is P2's 4-Might Vanguard Sergeant — bounced, not banished", () => {
  test("4 > 3 → 'return it to its OWNER's hand': it goes to P2's hand (056.1) although P1 cast the spell on a unit P1 controlled; (owner P2, control back with owner, zone hand); nothing in anyone's banishment", async () => {
    const game = await p1PossessedAtBf1(VANGUARD_SERGEANT);
    expect(game.state("victim")).toMatchObject({ controller: P1, might: 4, owner: P2, zone: "battlefield-bf1" });
    const p1Hand = game.p1.hand().filter((c) => c !== "wag");
    const p2Hand = game.p2.hand().length;
    await castWindAndGhosts(game);
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.p2.hand()).toContain("victim");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toEqual(p1Hand);
    expect(game.state("victim")).toMatchObject({ controller: P2, owner: P2, zone: "hand" });
    expect(game.state("victim").meta.controlEffects).toBeUndefined();
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
  });

  test("no banish event at all → neither Master of Shadows empowers; Wind and Ghosts → P1's trash", async () => {
    const game = await p1PossessedAtBf1(VANGUARD_SERGEANT);
    await castWindAndGhosts(game);
    expect(game.state("mos1").isEmpowered).toBe(false);
    expect(game.state("mos2").isEmpowered).toBe(false);
    expect(game.zoneOf("wag")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["poss", "wag"]);
    expect(game.violations()).toEqual([]);
  });

  test("summary across (A)/(B)/(C): ownership never changed (127.1) and the destination is always the OWNER's zone — (A) P2 banishment, (B) P1 banishment, (C) P2 hand; empower only in (B)", async () => {
    const a = await p1PossessedAtBf1();
    await castWindAndGhosts(a);
    const b = await p2PossessedAtBf2P1Turn();
    await castWindAndGhosts(b);
    const c = await p1PossessedAtBf1(VANGUARD_SERGEANT);
    await castWindAndGhosts(c);
    const row = (g: Game) => ({
      inP1: [...g.p1.hand(), ...g.p1.banishment()].includes("victim"),
      inP2: [...g.p2.hand(), ...g.p2.banishment()].includes("victim"),
      mos1: g.state("mos1").isEmpowered,
      mos2: g.state("mos2").isEmpowered,
      owner: g.state("victim").owner,
      zone: g.zoneOf("victim"),
    });
    expect(row(a)).toEqual({ inP1: false, inP2: true, mos1: false, mos2: false, owner: P2, zone: "banishment" });
    expect(row(b)).toEqual({ inP1: true, inP2: false, mos1: true, mos2: false, owner: P1, zone: "banishment" });
    expect(row(c)).toEqual({ inP1: false, inP2: true, mos1: false, mos2: false, owner: P2, zone: "hand" });
  });
});
