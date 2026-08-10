/**
 * Ruling a84d20167aa557ec — Teemo, Strategist (OGN-121 → ogn-121-298) [Hidden] 2 Might "When I defend, choose an enemy unit here and
 *     reveal the top 5 cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle them."
 *   × Ember Monk (OGN-167 → ogn-167-298) 4 Might "When you play a card from [Hidden], give me +2 [Might] this turn."
 *   × Gust (OGN-169 → ogn-169-298) [Reaction] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Can I flip (play from face-down) Teemo just to buff Ember Monk when there is no enemy unit for Teemo's ability?
 * A: Yes. Playing a hidden card needs no target: Teemo flips, Ember Monk gets +2, and Teemo's ability simply doesn't trigger
 *    (he isn't defending anything). Nuance: if a target existed when the defend trigger was put on the chain but is removed
 *    before it resolves (e.g. Gust), the top 5 are still revealed/recycled but no damage is dealt.
 * Rules: 811 (playing from Hidden), 383.4.f (defend triggers), 359.3.e (illegal target → that part is skipped; the rest resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const EMBER_MONK = "ogn-167-298";
const GUST = "ogn-169-298";
const BACK_OFF = "unl-042-219"; // a [Hidden] spell
const SKULKER = "ogn-175-298"; // no [Hidden]
const TOP_SIX = ["h1", "n1", "h2", "n2", "n3", "n4"];

/**
 * Turn 3. P1 holds bf1 with Ember Monk (4) and hid Teemo there on an earlier turn. P1's deck top→: Back Off(H), Skulker, Back Off(H),
 * Skulker, Skulker, Skulker. P2: a 3-Might Raider in base, Gust in hand + [1].
 */
function board(active: typeof P1 | typeof P2) {
  return scenario()
    .turn(3)
    .active(active)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", EMBER_MONK, "monk")
    .facedown(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 })
    .deck(P1, [BACK_OFF, SKULKER, BACK_OFF, SKULKER, SKULKER, SKULKER], TOP_SIX);
}

async function drainChain(game: Game): Promise<void> {
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

describe("Ruling a84d20167aa557ec — flipping Teemo with no enemy present: Ember Monk +2, Teemo's ability never triggers", () => {
  test("P1's turn, no enemy at bf1: revealing Teemo is legal with no target; he enters bf1, Ember Monk's 'played from Hidden' gives it +2 (4 → 6), and NO Teemo trigger is created (deck untouched)", async () => {
    const game = await board(P1).build();
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").isHidden).toBe(false);
    expect(game.chain().some((c) => c.cardId === "teemo")).toBe(false); // "When I defend" — he is not defending
    expect(game.state("teemo").combatRole).toBeNull();
    await drainChain(game); // Ember Monk's own trigger, if it uses the chain
    await game.settle();
    expect(game.state("monk")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.p1.deck().slice(0, 6)).toEqual(TOP_SIX); // nothing revealed / recycled
    expect(game.state("raider").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: Raider (3) attacks, P1 flips Teemo into the combat → the defend trigger targets the Raider; P2 Gusts its Raider away first → Teemo still reveals & recycles the top 5 but deals no damage", async () => {
    const game = await board(P2).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("teemo");
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "teemo", controller: P1, targets: ["raider"], triggered: true }));
    await drainEmberIfFirst(game);
    expect(game.state("monk").mightModifier).toBe(2); // the flip counted as a play from Hidden here too
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "raider" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves (LIFO)
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo"]);
    // Teemo's trigger resolves with its target gone: no re-target prompt, no damage, but the reveal-and-recycle still happens.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind === "pick" && d.seat === P1).toBe(false);
      if (d?.kind !== "action") {
        break;
      }
      await game.acting().passPriority();
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("n4"); // the five revealed cards went to the bottom
    expect(deck.slice(-5).sort()).toEqual(["h1", "h2", "n1", "n2", "n3"]);
    expect(game.zoneOf("raider")).toBe("hand"); // undamaged, in hand
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});

/** Ember Monk's +2 may sit above Teemo's item on the chain; let it resolve so Teemo's item is on top when P2 responds. */
async function drainEmberIfFirst(game: Game): Promise<void> {
  for (let i = 0; i < 4 && game.chain().length > 1 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
}
