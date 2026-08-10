/**
 * Interaction: Kog'Maw, Caustic (ogn-190-298) · Champion Unit · Chaos · 3 · 1 Might
 *     "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Wind and Ghosts (ven-106-166) · Spell · Chaos · 3 + [chaos] · Action
 *     "Choose a unit at a battlefield. If it has 3 [Might] or less, banish it. Otherwise, return it to its
 *      owner's hand."
 *   × Portal Rescue (ogn-102-298) · Spell · Mind · 3 + [mind] · Action
 *     "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *   Control: Soul Harvest (unl-159-219) · Spell · Order · 2 + [order] — "Kill a unit at a battlefield with
 *     3 [Might] or less."  Witness: Viktor, Leader (ogn-246-298) — "When another non-Recruit unit you control
 *     dies, play a 1 [Might] Recruit unit token into your base."
 *
 * Rules: 427.2 / 427.2.a (banish goes straight to banishment; banish is NOT a kill), 808.1.c / 808.1.d
 * (Deathknell = "when I die"; the trigger is being killed AND sent to the trash), 808.1.d.3 / 428.1.a.1.b
 * (on a Kill instruction the Deathknell is pended first, noting the unit's location), 428.5.b (the spell is
 * credited with the kill), 323.4 / 323.5 (lethal damage → killed at the next Cleanup), 124.1 / 359.3.e.4 (a
 * card that went to a non-board zone and came back is a new object), 143.4 (units enter exhausted).
 *
 * Question: P2 controls bf1 with Kog'Maw (1) and a vanilla 4-Might Brute; Viktor, Leader in P2's base.
 *   (a) P1 resolves Wind and Ghosts on Kog'Maw (≤3 → banish): does the Deathknell deal 4 to the Brute? Where
 *       is Kog'Maw? Does Viktor see a death?
 *   (b) Control: P1 resolves Soul Harvest on Kog'Maw instead.
 *   (c) P2's turn: P2 Portal Rescues its OWN Kog'Maw at a battlefield holding enemy units, hoping for the
 *       sweep. Does it happen? Where/how does Kog'Maw come back?
 *
 * Expected: (a) No — banished directly (427.2), not a kill → no Deathknell, no chain item, Brute untouched at
 * 4, bf1 still P2's, no Recruit for Viktor. (b) Kill instruction → Deathknell pended (location = bf1) with
 * Viktor's trigger (both P2's, P2 orders them); it deals 4 to the Brute → killed at the next Cleanup → bf1
 * empty → P2 loses control; Kog'Maw and Brute in P2's trash; Viktor makes Recruits. (c) No sweep: Portal
 * Rescue banishes (not kills) → no Deathknell; owner P2 plays it to P2's BASE for free as a NEW object,
 * exhausted, undamaged; the enemy units take nothing.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";
const WIND_AND_GHOSTS = "ven-106-166";
const PORTAL_RESCUE = "ogn-102-298";
const SOUL_HARVEST = "unl-159-219";
const VIKTOR_LEADER = "ogn-246-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P2 controls bf1 with Kog'Maw + a 4-Might Brute and has Viktor, Leader in base as a "dies"
 * witness. P1 holds Wind and Ghosts and Soul Harvest with exactly enough to cast either one.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "base", VIKTOR_LEADER, "viktor")
    .hand(P1, WIND_AND_GHOSTS, "wg")
    .hand(P1, SOUL_HARVEST, "harvest");
}

/** P2's turn; P2's Kog'Maw + Brute hold bf1; P2 holds Portal Rescue with exactly its cost. */
function rescueBoard() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "base", VIKTOR_LEADER, "viktor")
    .hand(P2, PORTAL_RESCUE, "rescue");
}

/** P2's turn; P1 holds bf1 with two 2-Might Raiders; P2's Kog'Maw walks in (showdown) and P2 Portal Rescues it. */
function rescueMidShowdownBoard() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Raider A" }, "ra")
    .unit(P1, "bf1", { might: 2, name: "Raider B" }, "rb")
    .unit(P2, "base", KOGMAW, "kog")
    .hand(P2, PORTAL_RESCUE, "rescue");
}

/** Recruit tokens Viktor made in P2's base. */
function recruits(game: Game): string[] {
  return game.p2.units("base").filter((id) => game.state(id).name === "Recruit");
}

describe("Kog'Maw, Caustic — banished (Wind and Ghosts / Portal Rescue) vs killed (Soul Harvest)", () => {
  // ── (a) Wind and Ghosts: banish is not a kill ─────────────────────────────────────────────

  test("(a) Wind and Ghosts may choose either unit at bf1; on Kog'Maw (1 ≤ 3) it BANISHES: Kog'Maw is in P2's banishment, not the trash", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "wg")?.fields.find((f) => f.name === "targets")?.options;
    expect(offered).toEqual([["kog"], ["brute"]]);
    await game.p1.cast("wg", { targets: "kog" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 1 } });
    await game.settle();
    expect(game.zoneOf("kog")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["kog"]);
    expect(game.p2.trash()).not.toContain("kog");
    expect(game.zoneOf("wg")).toBe("trash");
  });

  test("(a) …no Deathknell: nothing is ever put on the chain after the spell, the Brute takes 0 and stays at bf1 (4 Might), bf1 remains P2's", async () => {
    const game = await board().build();
    await game.p1.cast("wg", { targets: "kog" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Wind and Ghosts resolves
    expect(game.chain()).toEqual([]); // no Kog'Maw item, no Viktor item
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toEqual(["brute"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("(a) …and a 'when a unit you control dies' witness (Viktor, Leader) sees nothing: no Recruit token appears", async () => {
    const game = await board().build();
    await game.p1.cast("wg", { targets: "kog" });
    await game.settle();
    expect(recruits(game)).toEqual([]);
    expect(game.p2.units("base")).toEqual(["viktor"]);
  });

  // ── (b) control: Soul Harvest is a Kill instruction ───────────────────────────────────────

  test("(b) Soul Harvest only offers Kog'Maw (the Brute is 4 > 3); on resolution Kog'Maw goes to P2's TRASH and its Deathknell is pended together with Viktor's trigger — both P2's, so P2 is asked to order them", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "harvest")?.fields.find((f) => f.name === "targets")?.options;
    expect(offered).toEqual([["kog"]]);
    await game.p1.cast("harvest", { targets: "kog" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1, order: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Soul Harvest resolves
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("harvest")).toBe("trash");
    const items = game.chain();
    expect(items.map((c) => c.cardId).sort()).toEqual(["kog", "viktor"]);
    expect(items.every((c) => c.triggered && c.controller === P2)).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "order", seat: P2 });
    expect(game.state("brute").damage).toBe(0); // nothing dealt yet — it is a chain item
  });

  test("(b) …the Deathknell resolves against its noted battlefield: the Brute takes 4 ≥ 4 → killed at the next Cleanup; bf1 has no units → P2 loses control; Kog'Maw and Brute both in P2's trash; Viktor made a Recruit for each death", async () => {
    const game = await board().build();
    await game.p1.cast("harvest", { targets: "kog" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["brute", "kog"]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(recruits(game)).toHaveLength(2); // Kog'Maw died, then the Brute died
    expect(game.p1.points()).toBe(0); // losing control is not a conquer for anyone
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Portal Rescue on your own Kog'Maw ────────────────────────────────────────────────

  test("(c) P2 Portal Rescues its own Kog'Maw off bf1: banished then re-played to P2's BASE for free — a new object, exhausted, 0 damage — and NO sweep: the Brute beside it takes nothing, no Deathknell item, no Recruit", async () => {
    const game = await rescueBoard().build();
    const offered = game.p2.option("cast", "rescue")?.fields.find((f) => f.name === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["kog"], ["brute"], ["viktor"]])); // friendly units only
    await game.p2.cast("rescue", { targets: "kog" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    await game.settle({ policy: "first" }); // "plays it to their base" — take the (only) destination if asked
    expect(game.zoneOf("kog")).toBe("base");
    expect(game.state("kog")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, might: 1, owner: P2, zone: "base" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // ignoring its 3 + [chaos]
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(recruits(game)).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("rescue")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(c) same trick mid-showdown against ENEMY units: Kog'Maw walks into P1's bf1 (two 2-Might Raiders), P2 has Focus and Portal Rescues it — Kog'Maw lands exhausted in P2's base, both Raiders undamaged and still at bf1, bf1 still P1's, P2 scores nothing", async () => {
    const game = await rescueMidShowdownBoard().build();
    await game.p2.move("kog", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rescue")).toBe(true); // [Action] is legal while holding Focus
    await game.p2.cast("rescue", { targets: "kog" });
    await game.settle();
    await game.settle({ policy: "first" });
    expect(game.state("kog")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("ra")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("rb")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.banishment()).toEqual([]); // it did not stay banished
    expect(game.p2.trash()).toEqual(["rescue"]); // and it never died
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 }); // the attackerless combat simply ended
  });
});
