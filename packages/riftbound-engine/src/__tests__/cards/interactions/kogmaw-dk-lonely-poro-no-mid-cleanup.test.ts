/**
 * Interaction: Kog'Maw, Caustic (ogn-190-298) · Champion Unit · Chaos · 3 · 1 Might
 *     "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Lonely Poro (sfd-036-221) · Unit · Calm · 2 · 2 Might
 *     "[Deathknell] — If I died alone, draw 1. (I'm alone if there are no other friendly units here.)"
 *   × Flurry of Blades (ogn-133-298) · Spell · Body · 1 · [Reaction] "Deal 1 to all units at battlefields."
 *   (+ Shipyard Skulker ogn-175-298, vanilla 3 Might; contrast: a vanilla 1-Might "Recruit")
 *
 * Question: P1's turn, Neutral Open. P2 controls bf1 with Kog'Maw (1), Lonely Poro (2) and Skulker (3).
 * P1 plays Flurry of Blades. (a) What does the Cleanup after Flurry leaves the chain do with Kog'Maw
 * (lethal damage AND a Deathknell) — and is the Deathknell resolved inside that Cleanup? (b) Kog'Maw's
 * Deathknell later deals 4 to Poro and Skulker in ONE resolution — does a Cleanup interleave between the
 * two damage events so that one dies "first"? Does Lonely Poro die alone and draw? (c) When does P2 lose
 * bf1? (d) Contrast: Skulker replaced by a 1-Might Recruit that dies to Flurry together with Kog'Maw —
 * does Poro now draw when Kog'Maw's Deathknell kills it?
 *
 * Rules: 319.3/319.5/319.6 (Cleanup after an item leaves the chain / a pending item is added / objects
 * leave the board), 320 (no finalize/resolve during a Cleanup), 321/321.1 (no Cleanup while an item is
 * resolving — it becomes an Outstanding Task), 322/322.1 (cascading Cleanups run one after another, not
 * nested), 323.4 (3a: lethal + Deathknell → trigger queued as a Pending Item noting location, 808.1.d.2-3),
 * 323.5 (3b: lethal units go to the trash simultaneously), 323.6 (4: lose control of an unoccupied
 * battlefield only in an Open State with no showdown there), 309.1 (a chain exists → Closed State),
 * 340.4 (controller of the newest item gets priority).
 *
 * Expected: (a) Flurry resolves fully (Kog'Maw 1 = lethal, Poro 1, Skulker 1) and leaves the chain; the
 * Cleanup queues Kog'Maw's Deathknell for P2 (noting bf1) and puts Kog'Maw in P2's trash; the Deathknell is
 * NOT resolved inside the Cleanup (Poro/Skulker still carry exactly 1); afterwards it is finalized and P2
 * (its controller) holds priority in a Neutral Closed state; bf1 is still P2's. (b) One resolution deals 4
 * to both; no Cleanup in between, so Poro and Skulker die simultaneously in the next Cleanup — Skulker was
 * still on the board when Poro's death was evaluated → Poro was NOT alone → P2 draws nothing. (c) Not while
 * a Deathknell keeps the state Closed; once the chain empties and the turn is Open again, the Cleanup strips
 * P2's control: bf1 uncontrolled, nobody conquers, P1 (turn player) has priority. (d) Recruit dies in the
 * same Cleanup as Kog'Maw; Kog'Maw's Deathknell then kills a Poro that is the only friendly unit at bf1 →
 * "died alone" → its Deathknell goes on the chain and P2 draws 1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";
const LONELY_PORO = "sfd-036-221";
const FLURRY = "ogn-133-298";
const SKULKER = "ogn-175-298"; // vanilla 3 Might

/** rule 309/310: the turn state derived from the public interaction state. */
function turnState(game: Game): string {
  const i = game.gameState.interaction;
  const sd = i?.showdownStack?.[i.showdownStack.length - 1];
  const showdown = sd?.active === true;
  const chain = i?.chain?.active === true;
  return `${showdown ? "showdown" : "neutral"}-${chain ? "closed" : "open"}`;
}

/** P2 holds bf1 with Kog'Maw + Lonely Poro + a third unit (Skulker 3, or a 1-Might Recruit). */
function board(third: "skulker" | "recruit") {
  const s = scenario()
    .resources(P1, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P2, "bf1", LONELY_PORO, "poro")
    .hand(P1, FLURRY, "flurry");
  return third === "skulker"
    ? s.unit(P2, "bf1", SKULKER, "third")
    : s.unit(P2, "bf1", { might: 1, name: "Recruit" }, "third");
}

/** P1 casts Flurry; P1 and P2 pass so Flurry (only) resolves and leaves the chain. */
async function flurryResolves(third: "skulker" | "recruit"): Promise<Game> {
  const game = await board(third).build();
  expect(turnState(game)).toBe("neutral-open");
  await game.p1.cast("flurry");
  expect(turnState(game)).toBe("neutral-closed");
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Kog'Maw Deathknell × Lonely Poro × Flurry of Blades — cleanups never interleave a resolution", () => {
  test("(a) after Flurry leaves the chain the Cleanup trashes Kog'Maw and queues its Deathknell for P2; the trigger is NOT resolved inside the Cleanup (320) — Poro/Skulker carry exactly 1", async () => {
    const game = await flurryResolves("skulker");
    expect(game.zoneOf("flurry")).toBe("trash");
    // 3a/3b: Kog'Maw (1 Might, 1 damage) → owner's trash, its Deathknell is the only chain item.
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.p2.trash()).toContain("kog");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true, type: "ability" })]);
    // 320: nothing was resolved during the Cleanup — the survivors hold Flurry's 1 damage only.
    expect(game.state("poro")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("third")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    // 309.1: a chain exists → Closed; task 4 (323.6) does not apply and P2 still has units there anyway.
    expect(turnState(game)).toBe("neutral-closed");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    // After the Cleanup the pending item is finalized and its controller (P2) receives priority (340.4).
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) Kog'Maw's Deathknell deals 4 to Poro AND Skulker in one resolution — both die together in the following Cleanup (321, 323.5); neither is in the trash before the other", async () => {
    const game = await flurryResolves("skulker");
    await game.p2.passPriority();
    // Still nothing resolved: one more pass is outstanding.
    expect(game.state("poro").damage).toBe(1);
    expect(game.state("third").damage).toBe(1);
    await game.p1.passPriority(); // → the Deathknell resolves as a whole, THEN a Cleanup runs
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("third")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) Lonely Poro did NOT die alone — Skulker was still on the board (lethally damaged, not yet dead) when Poro's death was processed → P2 draws nothing", async () => {
    const game = await flurryResolves("skulker");
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p2.hand()).toHaveLength(p2Hand);
    await game.settle(); // drain whatever Poro's Deathknell may have queued
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck()).toHaveLength(p2Deck);
  });

  test("(c) P2 keeps bf1 while Kog'Maw's Deathknell keeps the state Closed; once the chain empties (Open) the Cleanup strips control: bf1 uncontrolled, nobody conquers, P1 back in an open main phase", async () => {
    const game = await flurryResolves("skulker");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.settle();
    expect(turnState(game)).toBe("neutral-open");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c, via the YES board) 323.6 is skipped in a Closed State: with ZERO P2 units left at bf1 but Poro's Deathknell still on the chain, bf1 is still P2's — it only becomes uncontrolled after that item resolves", async () => {
    const game = await flurryResolves("recruit");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Kog'Maw's Deathknell resolves → Poro dies alone → its Deathknell is queued
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P2, triggered: true })]);
    expect(turnState(game)).toBe("neutral-closed");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.settle();
    expect(turnState(game)).toBe("neutral-open");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("(d) YES contrast: the 1-Might Recruit dies in the SAME Cleanup as Kog'Maw (only Kog'Maw's Deathknell is queued); Poro survives with 1", async () => {
    const game = await flurryResolves("recruit");
    expect(game.zoneOf("kog")).toBe("trash");
    expect(["trash", "gone"]).toContain(game.zoneOf("third"));
    expect(game.state("poro")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toEqual(["poro"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
  });

  test("(d) YES contrast: Kog'Maw's Deathknell kills a Poro that is the only friendly unit at bf1 → 'died alone' → its Deathknell resolves and P2 draws exactly 1", async () => {
    const game = await flurryResolves("recruit");
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P2, triggered: true })]);
    expect(game.p2.hand()).toHaveLength(p2Hand); // still on the chain
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.violations()).toEqual([]);
  });
});
