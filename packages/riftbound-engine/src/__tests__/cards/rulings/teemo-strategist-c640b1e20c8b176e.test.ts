/**
 * Ruling c640b1e20c8b176e — Teemo, Strategist (OGN-121 → ogn-121-298) · [Hidden] · 2 Might
 *     "When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit
 *      for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *
 * Q: Does Teemo's "when I defend" trigger fire just because he is revealed from Hidden as a reaction, with no
 *    combat going on?
 * A: No. He only triggers when he is actually flagged as a DEFENDER in an active combat. Flipping him up outside
 *    a combat puts him on the board and nothing else — you may still play him, the trigger simply never happens
 *    (and there would be no "enemy unit here" to choose in the first place).
 * Rules: 464.2.c.3.a (defender designation is made in a combat, including for late arrivals), 383.1 (a trigger
 *        needs its event to occur), 811.1 (playing a card from Hidden), 402.4 (no legal choice → nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const HIDDEN_CARD = "ogn-135-298"; // Pakaa Cub — a [Hidden] card, so revealed copies count for Teemo's damage

/** P1 holds bf1 with a Holder and a face-down Teemo there; P2 keeps a Raider in base. `active` = whose turn. */
function board(active = P1) {
  return scenario()
    .turn(3)
    .active(active)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .facedown(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P2, "base", { might: 1, name: "Raider" }, "raider")
    .deck(P1, [HIDDEN_CARD, HIDDEN_CARD, HIDDEN_CARD, HIDDEN_CARD, HIDDEN_CARD], ["h1", "h2", "h3", "h4", "h5"]);
}

/** Drain the open CHAIN only (answering forced picks), stopping before any showdown/combat step. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || d.kind === "action") {
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
        continue;
      }
      break;
    }
    if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
}

describe("Ruling c640b1e20c8b176e — Teemo's 'when I defend' needs an actual combat: flipping him from Hidden outside one does nothing", () => {
  test("no combat anywhere: P1 may still play Teemo from Hidden — he enters the board and NO trigger reaches the chain", async () => {
    const game = await board().build();
    expect(game.p1.can("revealHidden", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("teemo").combatRole).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("…and nothing is damaged and no cards are revealed off the deck: the deck is untouched", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.reveal("teemo");
    await drainChain(game);
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.state("raider").damage).toBe(0);
  });

  test("control: with a real combat at bf1 he IS a defender when he flips up, and then the trigger does fire", async () => {
    const game = await board(P2).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.reveal("teemo");
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(game.chain().filter((c) => c.cardId === "teemo" && c.triggered)).toHaveLength(1);
    await drainChain(game);
    // the trigger really ran: the top 5 of P1's deck were revealed and recycled to the bottom
    expect(game.p1.deck().slice(0, 5)).not.toContain("h1");
    expect(game.p1.deck().toSorted()).toEqual(expect.arrayContaining(["h1", "h2", "h3", "h4", "h5"]));
  });
});
