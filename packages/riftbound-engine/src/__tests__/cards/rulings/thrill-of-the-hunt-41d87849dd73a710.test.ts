/**
 * Ruling 41d87849dd73a710 — Thrill of the Hunt (unl-184-219) × Dazzling Aurora (ogn-160-298) × Brynhir Thundersong (ogn-026-298)
 *   Thrill of the Hunt: "[Reaction] Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost." (2 + [rainbow])
 *   Dazzling Aurora (gear): "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and
 *                            banish it. Play it, ignoring its cost, and recycle the rest."
 *   Brynhir Thundersong: "When you play me, opponents can't play cards this turn."
 *
 * Q: What happens if Thrill of the Hunt (choosing Brynhir) is played in reaction to the Dazzling Aurora trigger?
 * A: Aurora's end-of-turn trigger goes on the chain; Thrill resolves first (Brynhir banished and played to a battlefield),
 *    Brynhir's "when you play me" trigger lands above Aurora and resolves; then Aurora resolves but its controller can no
 *    longer play the revealed unit (playing via an effect is still playing a card), so it is not played.
 * Rules: 330–334 (LIFO chain), Brynhir FAQ (restriction covers plays via effects), 187.4.c (cleanup suspended while chain is non-empty).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL = "unl-184-219";
const DAZZLING_AURORA = "ogn-160-298";
const BRYNHIR = "ogn-026-298";

/** P2's turn about to end. P2: Aurora in base, deck = [Dud Spell, Big Reveal (unit), …]. P1: Brynhir in base, Thrill in hand (2 + 1 any). */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", BRYNHIR, "bryn")
    .gear(P2, DAZZLING_AURORA, "aurora")
    .unit(P2, "base", { might: 2, name: "Other" }, "other")
    .deck(
      P2,
      [
        { abilities: [], cardType: "spell", energyCost: 1, name: "Dud Spell" },
        { cardType: "unit", energyCost: 5, might: 4, name: "Big Reveal" },
      ],
      ["dud", "big"],
    )
    .hand(P1, THRILL, "thrill");
}

async function passChain(game: Game): Promise<string[][]> {
  const snaps: string[][] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
    snaps.push(game.chain().map((c) => c.cardId));
  }
  return snaps;
}

describe("Ruling 41d87849dd73a710 — Thrill of the Hunt → Brynhir in response to Dazzling Aurora shuts off Aurora's free unit", () => {
  test("P2 ends turn: Aurora's trigger is on the chain and P1 gets a Reaction window; Thrill (on Brynhir) resolves first, Brynhir's trigger stacks ABOVE Aurora and resolves, then Aurora reveals Big Reveal but P2 cannot play it", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P2, triggered: true })]);
    if (game.decision()?.seat === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "thrill")).toBe(true);
    await game.p1.cast("thrill", { targets: "bryn" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["aurora", "thrill"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });

    const snaps = await passChain(game);
    // After Thrill resolved: Brynhir was (banished and) played to the battlefield, her trigger sitting above Aurora's.
    expect(snaps).toContainEqual(["aurora", "bryn"]);
    const brynIdx = snaps.findIndex((s) => s.join() === "aurora,bryn");
    const auroraAloneAfter = snaps.findIndex((s, i) => i > brynIdx && s.join() === "aurora");
    expect(auroraAloneAfter).toBeGreaterThan(brynIdx); // Brynhir's trigger resolved BEFORE Aurora's
    await game.settle();

    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.locationOf("bryn")).toBe("bf1"); // played to a battlefield, cost ignored
    // Aurora did resolve: it dug past the Dud Spell to the unit and banished it — but P2 could not PLAY it.
    expect(game.zoneOf("big")).toBe("banishment");
    expect(game.p2.units()).not.toContain("big");
    expect(game.zoneOf("dud")).toBe("mainDeck"); // "recycle the rest"
    // P1 kept bf1 throughout (cleanup never stripped control mid-chain) and it is now P1's turn.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: with no reaction, Aurora reveals Big Reveal and P2 plays it for free to base", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.zoneOf("big")).toBe("base");
    expect(game.p2.units()).toContain("big");
    expect(game.zoneOf("bryn")).toBe("base");
    expect(game.zoneOf("thrill")).toBe("hand");
    expect(game.turnPlayer()).toBe(P1);
  });
});
