/**
 * Dragonsoul Sage — unl-093-219 · Unit · Body · 2 energy · 1 Might
 *
 *   [Reaction][>] [Exhaust]: [Add] [1]. (Abilities that add resources can't be reacted to.)
 *
 * Rules: 429.1/429.2/429.2.a (Add = put resources in the Rune Pool; Add abilities finalize and resolve
 * IMMEDIATELY — no chain item, Priority/Focus do not move), 813.1.c.2 (Reaction ability: may be
 * activated in Closed States and showdowns on any player's turn), 316.5.b (…but never in the
 * opponent's Neutral Open State — only the turn player acts there), 143.4 (units enter exhausted, so
 * the [Exhaust] cost is unpayable the turn it is played), 317.2.d (unspent Energy is lost at end of
 * turn), Awaken readies it only at ITS CONTROLLER's turn start.
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. Summoning-sickness by construction: played from hand it arrives exhausted → no mana that turn.
 *  2. It is a mana ROCK on a 1-Might body: the energy is real (funds a 2-drop off 1 floating energy),
 *     but it evaporates in the Expiration Step — banking it across turns is impossible.
 *  3. Reaction timing matrix: my open main ✓, inside P2's chain when I hold priority ✓ (chain
 *     unchanged, I KEEP priority), P2's showdown when I hold Focus ✓, P2's neutral open state ✗.
 *  4. "Can't be reacted to": after activation there is no chain item and P2 is never asked anything.
 *  5. Self-funding combat trick (partner: Punch First, 1 + [body][body] [Action] +5 Might): defending
 *     with 0 energy, the Sage taps for the 1 in the showdown, pays for Punch First on itself and walls a 5.
 *  6. Exhausted ≠ harmless: an exhausted Sage at a battlefield still defends/deals its 1.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-093-219";
const PUNCH_FIRST = "sfd-097-221"; // 1 energy + [body][body] [Action]: Give a unit +5 [Might] this turn.
const CLEAVE = "ogn-004-298"; // 1 fury [Action]: P2's chain opener
const TWO_DROP = { energyCost: 2, might: 2, name: "Two Drop" } as const; // inline vanilla 2-cost unit

describe("Dragonsoul Sage (unl-093-219)", () => {
  test("registry payload: 2-cost body 1-Might unit with ONE activated Reaction ability — cost {exhaust} → add-resource {energy: 1}", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 2, might: 1, name: "Dragonsoul Sage" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ cost: { exhaust: true }, effect: { energy: 1, type: "add-resource" }, timing: "reaction", type: "activated" }]);
  });

  test("cost: 2 energy; enters the base EXHAUSTED, so its [Exhaust] ability is NOT available the turn it is played; 1 energy → unplayable", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "sage").build();
    await game.p1.play("sage");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("sage")).toBe("base");
    expect(game.state("sage")).toMatchObject({ isExhausted: true, might: 1 });
    expect(game.p1.can("activate", "sage")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { body: 2 } }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
  });

  test("[Exhaust]: [Add] [1] on my turn — exhausts, +1 energy at once, NO chain item, still my open main phase, not repeatable while exhausted (429.2)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "sage").build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.activate("sage");
    expect(game.state("sage").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "sage")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the energy is real: 1 floating + Sage = a 2-drop I could not otherwise afford", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "sage").hand(P1, TWO_DROP, "drop").build();
    expect(game.p1.can("play", "drop")).toBe(false);
    await game.p1.activate("sage");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "drop")).toBe(true);
    await game.p1.play("drop");
    await game.settle();
    expect(game.zoneOf("drop")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  test("…but it cannot be banked: unspent energy is lost in the Expiration Step (317.2.d); the Sage stays exhausted through P2's turn and readies at MY Awaken", async () => {
    const game = await scenario().unit(P1, "base", CARD, "sage").build();
    await game.p1.activate("sage");
    expect(game.p1.energy()).toBe(1);
    await game.advanceTurn(); // → P2
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sage").isExhausted).toBe(true);
    expect(game.p2.can("activate", "sage")).toBe(false); // not theirs to tap
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("sage").isReady).toBe(true);
    expect(game.p1.can("activate", "sage")).toBe(true);
  });

  test("[Reaction] on the opponent's turn: NOT in their neutral open state; YES inside their chain when I hold priority — resolves at once, chain unchanged, I keep priority, P2 is never asked", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
      .hand(P2, CLEAVE, "cleave")
      .unit(P1, "base", CARD, "sage")
      .build();
    expect(game.p1.can("activate", "sage")).toBe(false); // 316.5.b
    await game.p2.cast("cleave", { targets: "grunt" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("activate", "sage")).toBe(true);
    await game.p1.activate("sage");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("sage").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]); // nothing added (429.2)
    expect(game.actingSeat()).toBe(P1); // priority did not move (429.2.a)
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.p1.energy()).toBe(1); // still there until P2's turn ends
    await game.advanceTurn(); // P2 ends → my turn: pool emptied, Sage readied at Awaken
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sage").isReady).toBe(true);
  });

  test("self-funding combat trick: defending with 0 energy (2 body power banked), tap the Sage in P2's showdown (Focus stays with me), cast Punch First on it → 6-Might defender kills the 5-Might attacker and holds the field", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 0, power: { body: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sage")
      .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
      .hand(P1, PUNCH_FIRST, "punch")
      .build();
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "punch")).toBe(false); // 0 energy
    expect(game.p1.can("activate", "sage")).toBe(true);
    await game.p1.activate("sage");
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1); // Focus did not pass (429.2.a)
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("cast", "punch")).toBe(true);
    await game.p1.cast("punch", { targets: "sage" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("punch")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash"); // took 6 ≥ 5
    expect(game.zoneOf("sage")).toBe("battlefield-bf1"); // took 5 < 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("negative space: the same attack WITHOUT the trick — the exhausted 1-Might Sage still fights (deals its 1) but dies, and P2 conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sage", { exhausted: true })
      .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
      .build();
    expect(game.p1.can("activate", "sage")).toBe(false); // exhausted → cost unpayable even when a window opens
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("activate", "sage")).toBe(false);
    await game.settle();
    expect(game.zoneOf("sage")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("usable with Focus in MY OWN showdown as the attacker; the Add does not pass Focus and adds nothing to the chain", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .unit(P2, "bf1", { might: 2, name: "Blocker" }, "blocker")
      .unit(P1, "base", CARD, "sage")
      .build();
    await game.p1.move("runner", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("activate", "sage")).toBe(true);
    await game.p1.activate("sage");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toHaveLength(0);
    expect(game.actingSeat()).toBe(P1);
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("two Sages tap independently: +1 each, both exhausted, still no chain", async () => {
    const game = await scenario().unit(P1, "base", CARD, "s1").unit(P1, "base", CARD, "s2").build();
    await game.p1.activate("s1");
    await game.p1.activate("s2");
    expect(game.p1.energy()).toBe(2);
    expect(game.state("s1").isExhausted && game.state("s2").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
  });
});
