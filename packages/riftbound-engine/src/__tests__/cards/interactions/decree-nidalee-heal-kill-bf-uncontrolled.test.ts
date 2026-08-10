/**
 * Interaction: Imperial Decree (ogn-221-298) · Spell · Order · 5+[order][order] · Action
 *     "When any unit takes damage this turn, kill it."
 *   × Nidalee, Cat Form (unl-114-219) · Champion Unit · Body · 3+[body] · 4 Might
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *      When I win a combat, draw 1. (I win if I remain after combat.)"
 *   × Recruit token (ogn-271-298) · 1 Might
 *
 * Question: P1's turn. P1 resolves Imperial Decree, then sends a lone Recruit token into P2's bf1,
 * defended by a lone Nidalee, Cat Form. Nobody plays anything in the showdown.
 *   (a) Step 2 numbers, then Step 3 in order: what does the Combat Cleanup do, when do the Decree
 *       triggers go on the chain / resolve, is the already-healed Nidalee still killed, is the result
 *       determined before or after that, does Nidalee "win" and draw, who controls bf1 at the end?
 *   (b) Contrast without Imperial Decree.
 *   (c) With Decree and a second Nidalee in P2's hand: in the 466.2 window may P2 Ambush-play
 *       Nidalee #2 to bf1? Result, draw, control?
 *
 * Rules: 465.2.c.4 / 465.2.d (1 → Nidalee, 4 → Recruit, dealt simultaneously), 465.3 (skip FEPR, go to
 * Step 3), 466.1 / 466.1.a.1 / 466.1.a.2 (Combat Cleanup: kill lethal, heal ALL units, recall attackers only
 * if defenders remain), 466.2 (chain items from combat damage + cleanup resolve — with priority passes —
 * BEFORE the result), 417.1.a + Decree (the trigger fired when damage was taken; healing does not undo it,
 * "kill" ignores current damage), 323.6 (no loss of control while a combat is ongoing there), 466.3.a /
 * 466.3.c / 466.3.d (won / inherit / No Result), 466.4 (win triggers resolve before control), 466.5 /
 * 466.5.b (nobody remains → Uncontrolled, no conquer), 466.7, 383.2.c, 323.2.a (a unit arriving mid-combat
 * takes its controller's designation at the next Cleanup).
 *
 * Expected:
 *   (a) 1 vs 4. Recruit takes lethal, Nidalee takes 1. Decree triggers twice (both P1's). Cleanup kills the
 *       Recruit (token → ceases to exist), heals Nidalee to 0, recalls nothing. 466.2: P1 then P2 get
 *       priority; top item (Recruit's) does nothing, Nidalee's kills her anyway. 466.3.d No Result → no
 *       draw. 466.5.b bf1 becomes Uncontrolled, Contested cleared; nobody scores.
 *   (b) Recruit dies, Nidalee heals; 466.3.a P2 won → Nidalee's trigger → P2 draws 1; bf1 stays P2's.
 *   (c) Yes — once P1 passes, P2 holds priority in a Closed state and Ambush lets Nidalee #2 be played to
 *       bf1 (Nidalee #1 still there, P2 still controls it). She enters exhausted, becomes a Defender at the
 *       next Cleanup. Decree kills #1; P2 (Defender, only player with units) WON → #2 inherits → draws 1;
 *       P2 keeps bf1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const NIDALEE_CAT_FORM = "unl-114-219";
const RECRUIT_TOKEN = "ogn-271-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla, marks P2's deck top

/**
 * P1's turn. P2 controls bf1 with a lone Nidalee #1; P1 has a Recruit token in base and (optionally)
 * Imperial Decree with exactly its cost. P2's deck top is D1, D2; with `second`, P2 holds Nidalee #2 and
 * exactly her cost (3 + [body]).
 */
function board(opts: { decree?: boolean; second?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 5, power: { order: 2 } })
    .resources(P2, { energy: 3, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", NIDALEE_CAT_FORM, "nid1")
    .unit(P1, "base", RECRUIT_TOKEN, "recruit")
    .deck(P2, [FILLER, FILLER], ["D1", "D2"]);
  if (opts.decree !== false) {
    s.hand(P1, IMPERIAL_DECREE, "decree");
  }
  if (opts.second) {
    s.hand(P2, NIDALEE_CAT_FORM, "nid2");
  }
  return s;
}

/** P1 resolves Decree (if held), attacks bf1 with the Recruit, both pass Focus → damage + Combat Cleanup done. */
async function attackAndCloseShowdown(game: Game): Promise<void> {
  if (game.has("decree") && game.zoneOf("decree") === "hand") {
    await game.p1.cast("decree");
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");
  }
  await game.p1.move("recruit", "bf1");
  expect(game.state("recruit").combatRole).toBe("attacker");
  expect(game.state("nid1").combatRole).toBe("defender");
  await game.p1.passFocus();
  await game.p2.passFocus();
}

/** Nidalee #2 destinations offered to P2 right now ([] when she is not playable). */
function nid2Destinations(game: Game): string[] {
  const f = game.p2.option("play", "nid2")?.fields.find((x) => x.arg === "to");
  return ((f?.options ?? []) as string[]).slice().sort();
}

describe("(a) Imperial Decree up: lone Recruit (1) into lone Nidalee (4)", () => {
  test("Step 2: 1 vs 4, dealt simultaneously — the Recruit takes lethal and (as a token) ceases to exist in the Combat Cleanup; Nidalee took 1 and is HEALED back to 0 by step 3c; nothing to recall (465.2.d, 466.1.a.1, 466.1.a.2)", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.move("recruit", "bf1");
    expect(game.state("recruit").might).toBe(1);
    expect(game.state("nid1").might).toBe(4);
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.state("nid1")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.base()).not.toContain("recruit");
  });

  test("Decree triggered TWICE (Recruit + Nidalee both took damage): two P1-controlled triggered items are on the chain after the Cleanup, before any result is determined (466.2)", async () => {
    const game = await board().build();
    await attackAndCloseShowdown(game);
    await game.acceptTriggerOrder(); // 383.3.d soft offer, if any — order is immaterial here
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "decree", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "decree", controller: P1, triggered: true }),
    ]);
    // Result not determined yet: still contested, still P2's, nobody scored, nobody drew.
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.hand()).toEqual([]);
  });

  test("466.2 is a real priority window: P1 (controller of the items) holds priority first, then P2 gets priority in response before anything resolves", async () => {
    const game = await board().build();
    await attackAndCloseShowdown(game);
    await game.acceptTriggerOrder();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(2);
    expect(game.zoneOf("nid1")).toBe("battlefield-bf1");
  });

  test("the top item (the Recruit's — its subject is gone) resolves doing nothing; the next one KILLS Nidalee even though she is at 0 damage — healing does not un-trigger Decree (417.1.a)", async () => {
    const game = await board().build();
    await attackAndCloseShowdown(game);
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toHaveLength(1);
    expect(game.state("nid1")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    // P2 still controls bf1 while the combat is ongoing (323.6 does not apply mid-combat).
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nid1")).toBe("trash");
    expect(game.p2.trash()).toContain("nid1");
  });

  test("466.3.d No Result: Nidalee neither remained nor won → her 'When I win a combat' never triggers, P2 draws nothing", async () => {
    const game = await board().build();
    await attackAndCloseShowdown(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck().slice(0, 2)).toEqual(["D1", "D2"]);
  });

  test("466.5.b: no units remain → bf1 becomes UNCONTROLLED (not P1's), Contested cleared; P1 does not conquer or score, P2 simply loses the battlefield; combat ends, back to P1's open main phase", async () => {
    const game = await board().build();
    await attackAndCloseShowdown(game);
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) contrast — no Imperial Decree", () => {
  test("Recruit dies, Nidalee heals to 0 and REMAINS: P2 (sole player with units, Defender) won → Nidalee's win trigger goes on the chain as P2's item in the 466.4 window", async () => {
    const game = await board({ decree: false }).build();
    await attackAndCloseShowdown(game);
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.state("nid1")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nid1", controller: P2, triggered: true })]);
    expect(game.p2.hand()).toEqual([]); // not drawn until it resolves
  });

  test("it resolves: P2 draws exactly 1 (D1); bf1 stays P2's (already controlled → no conquer, no points), Contested cleared", async () => {
    const game = await board({ decree: false }).build();
    await attackAndCloseShowdown(game);
    await game.settle();
    expect(game.p2.hand()).toEqual(["D1"]);
    expect(game.p2.deck()[0]).toBe("D2");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("nid1")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) Imperial Decree up, P2 holds Nidalee #2 (3 + [body])", () => {
  test("while P1 still holds priority in the 466.2 window P2 cannot act; once P1 passes, P2 may Ambush-play Nidalee #2 — offered ONLY to bf1 (where Nidalee #1 still stands), never to base", async () => {
    const game = await board({ second: true }).build();
    await attackAndCloseShowdown(game);
    await game.acceptTriggerOrder();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.can("play", "nid2")).toBe(false);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("nid1")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.can("play", "nid2")).toBe(true);
    expect(nid2Destinations(game)).toEqual(["battlefield-bf1"]);
    await expect(game.p2.play("nid2", { to: "base" })).rejects.toThrow();
    expect(game.zoneOf("nid2")).toBe("hand");
  });

  test("Nidalee #2 is paid for (3 + [body]) and enters bf1 EXHAUSTED; both Decree items are still on the chain beneath her and Nidalee #1 is still there", async () => {
    const game = await board({ second: true }).build();
    await attackAndCloseShowdown(game);
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    await game.p2.play("nid2", { to: "bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("nid2")).toMatchObject({ damage: 0, isExhausted: true, zone: "battlefield-bf1" });
    expect(game.zoneOf("nid1")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "decree", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "decree", controller: P1, triggered: true }),
    ]);
    expect(game.p2.units("bf1").slice().sort()).toEqual(["nid1", "nid2"]);
  });

  // Expected (323.2.a): a unit present at the combat's battlefield without a designation gains its
  // controller's (Defender) at the next Cleanup — here the one after the top Decree item resolves.
  // Actual: Nidalee #2's combatRole stays null for the rest of the combat.
  test("Nidalee #2 gains the DEFENDER designation at the next Cleanup while the combat is still ongoing (323.2.a)", async () => {
    const game = await board({ second: true }).build();
    await attackAndCloseShowdown(game);
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    await game.p2.play("nid2", { to: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // top Decree item resolves → Cleanup
    expect(game.chain()).toHaveLength(1);
    expect(game.state("nid2").combatRole).toBe("defender");
  });

  test("the Decree items then resolve: Nidalee #1 is killed, Nidalee #2 (never damaged) remains — P2 WON (466.3.a/.c) → Nidalee #2's 'When I win a combat' goes on the chain as P2's item", async () => {
    const game = await board({ second: true }).build();
    await attackAndCloseShowdown(game);
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    await game.p2.play("nid2", { to: "bf1" });
    for (let i = 0; i < 4; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("nid1")).toBe("trash");
    expect(game.zoneOf("nid2")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nid2", controller: P2, triggered: true })]);
    expect(game.p2.hand()).toEqual([]);
  });

  test("…and resolves: P2 draws 1 (D1); 466.5 P2 KEEPS bf1 (contested cleared, no conquer, no points for anyone); Nidalee #2 stays at bf1 undamaged", async () => {
    const game = await board({ second: true }).build();
    await attackAndCloseShowdown(game);
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    await game.p2.play("nid2", { to: "bf1" });
    await game.settle();
    expect(game.p2.hand()).toEqual(["D1"]);
    expect(game.p2.deck()[0]).toBe("D2");
    expect(game.zoneOf("nid1")).toBe("trash");
    expect(game.state("nid2")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
