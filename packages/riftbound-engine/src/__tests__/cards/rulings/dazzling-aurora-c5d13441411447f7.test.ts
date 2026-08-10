/**
 * Ruling c5d13441411447f7 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · [9][body][body]
 *     "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it. Play it,
 *      ignoring its cost, and recycle the rest."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · 8 Might · [Deflect] "You may play me to an occupied enemy battlefield."
 *
 * Q: How does Dazzling Aurora work with Deadbloom Predator's showdown?
 * A: Aurora triggers at end of turn and reveals until ANY unit (it doesn't search for Deadbloom); if that unit is the Predator
 *    you may play it to an occupied enemy battlefield, which sets up a showdown. The showdown does NOT begin at once: every
 *    pending chain item (e.g. a second Aurora trigger, play triggers) resolves first; once the chain is empty the showdown is
 *    fought during your ending step, and after it resolves the turn passes to the opponent.
 * Rules: 317 (Ending Phase triggers), 322/323.8 (Cleanup stages the showdown), 460/461 (a staged combat begins only from a
 *        neutral state with an empty chain), 340 (chain resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const CLEAVE = "ogn-004-298"; // a spell: revealed, then recycled
const SKULKER = "ogn-175-298"; // the NEXT unit down — only a second Aurora should reach it

/** P1's turn about to end. P1: Aurora(s) in base, Sitter (2) holding bf2; deck: Cleave, Predator, Skulker, Cleave. P2 holds bf1 with a 3-Might Holder. */
function board(auroras: 1 | 2) {
  const s = scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf2", { might: 2, name: "Sitter" }, "sitter")
    .deck(P1, [CLEAVE, DEADBLOOM_PREDATOR, SKULKER, CLEAVE], ["s1", "pred", "later", "s2"]);
  return auroras === 2 ? s.gear(P1, DAZZLING_AURORA, "aurora2") : s;
}

/** Pass chain priority for whoever holds it until a non-priority decision appears; return it. */
async function passChain(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
      continue;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    return d;
  }
  return game.decision();
}

describe("Ruling c5d13441411447f7 — Aurora into Deadbloom Predator: the showdown waits for an empty chain, is fought in the ending step, then the turn passes", () => {
  test("end of P1's turn: Aurora triggers; it reveals Cleave (not a unit) then the Predator — banished mid-play, Cleave recycled to the bottom, Skulker never revealed — and asks where to play it for free", async () => {
    const game = await board(1).build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
    const d = await passChain(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "pred" } });
    expect(game.zoneOf("pred")).toBe("banishment");
    expect(game.p1.deck()[0]).toBe("later"); // "until you reveal a unit" — stops at the first unit, whatever it is
    expect(game.p1.deck().at(-1)).toBe("s1");
    expect(game.p1.energy()).toBe(0);
  });

  test("the Predator's own permission applies to Aurora's play: the OCCUPIED ENEMY bf1 is offered alongside base and P1's bf2", async () => {
    const game = await board(1).build();
    await game.p1.endTurn();
    const d = await passChain(game);
    const dests = d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key).toSorted() : [];
    expect(dests).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
  });

  test("one Aurora: choosing bf1 puts the Predator there; with the chain empty the showdown opens STILL IN P1's ENDING PHASE (Predator attacking); it resolves (Holder dies, P1 conquers) and only then does the turn pass to P2 — no second end step, Skulker still on top", async () => {
    const game = await board(1).build();
    await game.p1.endTurn();
    await passChain(game);
    await game.p1.pick("battlefield-bf1");
    const d = await passChain(game);
    expect(game.chain()).toEqual([]);
    expect(d).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("pred")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.locationOf("pred")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.deck()[0]).toBe("later");
    expect(game.violations()).toEqual([]);
  });

  test("TWO Auroras: both trigger at the one end of turn; after the first plays the Predator to bf1 the showdown does NOT start — the second Aurora trigger is still on the chain and resolves first (digging to the Skulker and playing it)…", async () => {
    const game = await board(2).build();
    await game.p1.endTurn();
    if (game.decision()?.kind === "order") {
      expect(game.decision()?.seat).toBe(P1);
      await game.acceptTriggerOrder();
    }
    expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["aurora", "aurora2"]);
    let d = await passChain(game); // top Aurora resolves → Predator
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "pred" } });
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("pred")).toBe("battlefield-bf1");
    // Not a showdown yet: the other Aurora trigger is pending and gets priority windows first.
    expect(game.chain().some((c) => c.cardId === "aurora" || c.cardId === "aurora2")).toBe(true);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.state("pred").combatRole).not.toBe("attacker");
    d = await passChain(game); // second Aurora resolves → reveals the Skulker and plays it
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "later" } });
    expect(game.zoneOf("later")).toBe("banishment");
    await game.p1.pick("base");
  });

  test("…and only once the chain is completely empty does the bf1 showdown begin (ending phase, P1's turn); after it resolves the turn passes to P2", async () => {
    const game = await board(2).build();
    await game.p1.endTurn();
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    await passChain(game);
    await game.p1.pick("battlefield-bf1");
    await passChain(game);
    await game.p1.pick("base"); // Skulker to base
    const d = await passChain(game);
    expect(game.chain()).toEqual([]);
    expect(d).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("pred").combatRole).toBe("attacker");
    expect(game.zoneOf("later")).toBe("base");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});
