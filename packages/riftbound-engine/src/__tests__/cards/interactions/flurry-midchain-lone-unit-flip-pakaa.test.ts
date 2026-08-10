/**
 * Interaction: Flurry of Blades (ogn-133-298) · Spell · Body · 1
 *     "[Reaction] Deal 1 to all units at battlefields."
 *   × Pakaa Cub (ogn-135-298) · Unit · Body · 3 · 3 Might
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].)"
 *   × Find Your Center (ogn-047-298) · Spell · Calm · 3
 *     "[Action] If an opponent's score is within 3 points of the Victory Score, this costs [2] less.
 *      Draw 1 and channel 1 rune exhausted."
 *   (+ a vanilla Recruit token ogn-271-298, 1 Might, as P1's lone unit holding bfA.)
 *
 * Question: P1 controls bfA with a lone Recruit token and has Pakaa Cub facedown at bfA since a previous
 * turn.
 *   YES case — P1's turn: P1 plays Find Your Center; P2 responds with Flurry of Blades. Flurry resolves
 *   first and kills the Recruit while Find Your Center is still on the chain. In the Cleanup after Flurry
 *   leaves the chain, does P1 lose bfA (323.6) and is the facedown Pakaa Cub trashed (323.7)? May P1,
 *   before Find Your Center resolves, flip Pakaa Cub for [0] and play it TO bfA, keeping the battlefield?
 *   NO case — P2's turn, Neutral Open: P2 plays Flurry with nothing under it and P1 passes. After it
 *   resolves, is there any window between the Recruit dying, control being lost, and the Cub being trashed?
 *
 * Rules: 309.1 (a Chain exists → Closed State), 319.1 / 319.5 (Cleanup after a state transition / after a
 * chain item leaves), 320.1 (no priority inside a Cleanup), 323.5 (3b lethal damage kills), 323.6 (4.
 * control of an unoccupied battlefield is lost ONLY "if the turn is in an Open State"), 323.7 (5. hidden
 * cards at battlefields "not controlled by the same player" go to their owner's trash), 190.4.c, 107.3.d,
 * 811.1.d.1 (a hidden permanent is played TO its battlefield), 811.6 (Hidden grants Reaction), 355.2.a
 * (a battlefield you control is a valid location), 338.1.a.5.
 *
 * Expected: YES — while Find Your Center is still a chain item the turn is Closed, so the Cleanup after
 * Flurry kills the Recruit but SKIPS task 4: bfA stays P1's with zero units, and task 5 leaves the Cub
 * facedown. P1 (holding priority over Find Your Center) may flip the Cub for [0]; it must and can be played
 * to bfA (P1 still controls it); no Contested is applied. Find Your Center then resolves (draw 1, channel 1
 * exhausted); the Open-state Cleanup finds a P1 unit at bfA → control retained, never uncontrolled.
 * (Contrast: if P1 never flips, the first Open-state Cleanup strips bfA and trashes the Cub.)
 * NO — Flurry was the only item; when it leaves the state is Open, so ONE Cleanup kills the Recruit, strips
 * P1's control of bfA and puts the facedown Cub in P1's trash with no priority in between; P1's only chance
 * to flip was in response to Flurry BEFORE it resolved.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLURRY = "ogn-133-298";
const PAKAA_CUB = "ogn-135-298";
const FIND_YOUR_CENTER = "ogn-047-298";
const RECRUIT_TOKEN = "ogn-271-298";

/**
 * Turn 3 (the Cub was hidden on an earlier turn). P1 controls bfA with a lone Recruit token and a facedown
 * Pakaa Cub; P1 has exactly Find Your Center's [3]. P2 has Flurry of Blades and its [1]; P2's only unit
 * sits in base so Flurry hits nothing of P2's.
 */
function board(active: typeof P1 | typeof P2 = P1) {
  return scenario()
    .turn(3)
    .active(active)
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", RECRUIT_TOKEN, "recruit")
    .facedown(P1, "bfA", PAKAA_CUB, "cub")
    .unit(P2, "base", { might: 2, name: "Lurker" }, "lurker")
    .hand(P1, FIND_YOUR_CENTER, "fyc")
    .hand(P2, FLURRY, "flurry");
}

/** YES case up to the moment Flurry has resolved and Find Your Center is still the lone chain item. */
async function flurryResolvedUnderFindYourCenter(): Promise<Game> {
  const game = await board(P1).build();
  await game.p1.cast("fyc");
  expect(game.chain().map((i) => i.cardId)).toEqual(["fyc"]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "flurry")).toBe(true);
  await game.p2.cast("flurry");
  expect(game.chain().map((i) => i.cardId)).toEqual(["fyc", "flurry"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // both passed on Flurry → it resolves (LIFO); FYC stays
  return game;
}

describe("Flurry of Blades kills the lone holder mid-chain × facedown Pakaa Cub × Find Your Center", () => {
  // ── YES case: P1's turn, Flurry resolves while Find Your Center is still on the chain ───────────────

  test("YES: after Flurry resolves the Recruit token is dead and has ceased to exist, but Find Your Center is still a chain item → Closed State, P1 holds priority over it (309.1, 323.5)", async () => {
    const game = await flurryResolvedUnderFindYourCenter();
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.chain().map((i) => i.cardId)).toEqual(["fyc"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("YES: the Cleanup after Flurry SKIPS task 4 in a Closed State — bfA is still controlled by P1 with zero units, and the facedown Cub is NOT trashed (323.6 'if the turn is in an Open State', 323.7, 190.4.c)", async () => {
    const game = await flurryResolvedUnderFindYourCenter();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    expect(game.zoneOf("cub")).toBe("facedown-bfA");
    expect(game.state("cub").isHidden).toBe(true);
    expect(game.p1.facedown("bfA")).toEqual(["cub"]);
    expect(game.p1.trash()).not.toContain("cub");
  });

  test("YES: with priority over the pending Find Your Center, P1 is offered the flip of the facedown Cub (Reaction via 811.6, legal in a Closed State 309.1.a / 338.1.a.5)", async () => {
    const game = await flurryResolvedUnderFindYourCenter();
    expect(game.p1.can("reveal", "cub")).toBe(true);
    expect(game.p1.legal().map((o) => o.key)).toContain("revealHidden:cub");
  });

  test("YES: flipping the Cub costs [0] and plays it TO bfA — a legal location because P1 still controls bfA (811.1.d.1, 355.2.a); no Contested is applied to P1's own battlefield (190.3.a.1); Find Your Center is still waiting underneath", async () => {
    const game = await flurryResolvedUnderFindYourCenter();
    const before = game.p1.resources();
    await game.p1.reveal("cub");
    expect(game.p1.resources()).toEqual(before); // base cost ignored
    expect(game.zoneOf("cub")).toBe("battlefield-bfA");
    expect(game.state("cub")).toMatchObject({ controller: P1, isHidden: false, might: 3 });
    expect(game.p1.units("bfA")).toEqual(["cub"]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["fyc"]);
  });

  test("YES: Find Your Center then resolves (draw 1, channel 1 rune exhausted); chain empties → Open State Cleanup finds a P1 unit at bfA → P1 KEEPS bfA, the Cub stays, nothing is contested and P2 gets no showdown / no action on P1's turn (319.1, 323.6)", async () => {
    const game = await flurryResolvedUnderFindYourCenter();
    const hand = game.p1.hand().length; // FYC already left the hand
    const runeDeck = game.p1.runeDeck().length;
    await game.p1.reveal("cub");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 1);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.zoneOf("cub")).toBe("battlefield-bfA");
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("YES-contrast: if P1 does NOT flip and simply lets Find Your Center resolve, the first Open-state Cleanup strips bfA (no P1 unit) and trashes the facedown Cub to its owner's trash — task 4 was only deferred, not waived (323.6, 323.7, 107.3.d)", async () => {
    const game = await flurryResolvedUnderFindYourCenter();
    await game.p1.passPriority();
    await game.p2.passPriority(); // FYC resolves, chain empties → Open
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.p1.trash()).toContain("cub");
    expect(game.state("cub").isHidden).toBe(false);
    expect(game.p1.can("reveal", "cub")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── NO case: P2's turn, Flurry is the only chain item ────────────────────────────────────────────────

  test("NO: on P2's turn Flurry opens a chain by itself; P1's ONLY chance is to respond now — the flip is offered to P1 while Flurry is still pending (811.6)", async () => {
    const game = await board(P2).build();
    await game.p2.cast("flurry");
    expect(game.chain().map((i) => i.cardId)).toEqual(["flurry"]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "cub")).toBe(true);
  });

  test("NO: P1 passes → Flurry resolves and leaves an EMPTY chain → Open State: one Cleanup kills the Recruit, strips P1's control of bfA AND trashes the facedown Cub to P1's (owner's) trash — no priority window in between (320.1, 323.5–7, 190.4.c, 107.3.d)", async () => {
    const game = await board(P2).build();
    await game.p2.cast("flurry");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.p1.trash()).toContain("cub");
    expect(game.p2.trash()).not.toContain("cub");
    expect(game.state("cub").isHidden).toBe(false);
    expect(game.p1.facedown("bfA")).toEqual([]);
    // Straight back to P2's Neutral Open main phase; P1 has nothing — the flip is gone with the card.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("reveal", "cub")).toBe(false);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("NO-contrast: had P1 flipped the Cub IN RESPONSE to Flurry (before it resolved), the Cub (3 Might) is at bfA when Flurry deals 1 to everything there — Recruit dies, Cub survives on 1 damage, P1 keeps bfA", async () => {
    const game = await board(P2).build();
    await game.p2.cast("flurry");
    await game.p2.passPriority();
    await game.p1.reveal("cub");
    expect(game.zoneOf("cub")).toBe("battlefield-bfA");
    expect(game.chain().map((i) => i.cardId)).toEqual(["flurry"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.zoneOf("cub")).toBe("battlefield-bfA");
    expect(game.state("cub").damage).toBe(1);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
