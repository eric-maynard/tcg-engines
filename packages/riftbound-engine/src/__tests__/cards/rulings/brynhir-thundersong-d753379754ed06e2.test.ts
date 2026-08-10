/**
 * Ruling d753379754ed06e2 — Brynhir Thundersong (OGN-026 → ogn-026-298) · Unit · Fury · 6 · 5 Might
 *     "When you play me, opponents can't play cards this turn."
 *   × Promising Future (OGN-115 → ogn-115-298) · Spell · Mind · [5][mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest. Starting with the
 *      next player, each player plays those cards, ignoring Energy costs."
 *
 * Q: My opponent plays Brynhir off MY Promising Future. What happens to the card I chose — can I still play it?
 * A: Yes, it resolves normally. All chosen cards are played (put on the chain as pending items) starting with the next player,
 *    before Brynhir's play trigger can resolve: Brynhir finalizes/resolves first (her trigger goes pending), your card finalizes
 *    next, then her trigger resolves (locking FURTHER plays), then your already-played card resolves. Nuance: because her unit
 *    is on the board before your spell finalizes, your damage spell may target Brynhir herself.
 * Rules: 337.1.b (pending items finalize in order), 354 (play = put on the chain), 383.4.a.2, 419.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRYNHIR = "ogn-026-298";
const PROMISING_FUTURE = "ogn-115-298";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Future Unit ${n}` }) as const;
/** P1's chosen card: a plain 3-cost damage spell, "Deal 5 to a unit." (no power cost, standard timing). */
const SMITE = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 3,
  name: "Smite",
  timing: "standard",
} as const;
const LATECOMER = { cardType: "unit", energyCost: 1, might: 1, name: "Latecomer" } as const;

/**
 * P1's turn with [6][mind] (5 for Promising Future, 1 spare) and a 1-cost Latecomer in hand. P1's deck top: Smite…; P2's deck
 * top: Brynhir…. P2 also has a 1-Might Weakling in base (an alternative Smite target).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 1 } })
    .deck(P1, [SMITE, U(2), U(3), U(4), U(5), U(6)], ["smite", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [BRYNHIR, U(2), U(3), U(4), U(5), U(6)], ["bryn", "b2", "b3", "b4", "b5", "b6"])
    .unit(P2, "base", { might: 1, name: "Weakling" }, "weak")
    .hand(P1, PROMISING_FUTURE, "pf")
    .hand(P1, LATECOMER, "late");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** Cast PF, let it resolve; P1 banishes Smite, P2 banishes Brynhir; answer any Brynhir location prompt with base. Stops at Smite's target prompt. */
async function pfIntoBrynhirAndSmite(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "pick") {
      break;
    }
    const cards = (d as PickDecision).options.map((o) => o.card ?? o.key);
    if (d.seat === P1 && cards.includes("smite") && cards.length === 5) {
      await game.p1.pick("smite");
    } else if (d.seat === P2 && cards.includes("bryn") && cards.length === 5) {
      await game.p2.pick("bryn");
    } else if (d.seat === P2 && cards.includes("base")) {
      await game.p2.pick("base");
    } else {
      break; // Smite's target prompt (P1)
    }
  }
  return game;
}

describe("Ruling d753379754ed06e2 — a card chosen with Promising Future still resolves when the opponent's choice is Brynhir", () => {
  test("'starting with the next player': P2's Brynhir is played and on the board BEFORE P1's Smite finalizes — so Smite's target prompt already offers Brynhir", async () => {
    const game = await pfIntoBrynhirAndSmite();
    expect(game.zoneOf("bryn")).toBe("base");
    expect(game.p2.units()).toContain("bryn");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "smite" } });
    expect((d as PickDecision).options.map((o) => o.card ?? o.key).sort()).toEqual(["bryn", "weak"]);
    // Brynhir's play trigger is pending/on the chain but has NOT resolved: nothing is locked yet while P1 chooses.
    expect(game.chain().some((c) => c.cardId === "bryn" && c.triggered)).toBe(true);
  });

  test("P1 targets Brynhir: chain = Smite (P1's played card) with Brynhir's trigger on top; the trigger resolves FIRST and locks P1 out of further plays — Smite stays on the chain", async () => {
    const game = await pfIntoBrynhirAndSmite();
    await game.p1.pick("bryn");
    expect(chainIds(game)).toEqual(["smite", "bryn"]);
    expect(game.chain()[0]).toMatchObject({ cardId: "smite", controller: P1, targets: ["bryn"], triggered: false });
    expect(game.chain()[1]).toMatchObject({ cardId: "bryn", controller: P2, triggered: true });
    await game.acting().passPriority();
    await game.acting().passPriority(); // Brynhir's "opponents can't play cards this turn" resolves
    expect(chainIds(game)).toEqual(["smite"]); // already played — still there
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("play", "late")).toBe(false); // the lock is live for NEW plays
  });

  test("…and Smite then resolves normally: 5 damage kills the 5-Might Brynhir; Smite and PF in P1's trash; P1 remains unable to play cards for the rest of the turn", async () => {
    const game = await pfIntoBrynhirAndSmite();
    await game.p1.pick("bryn");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("smite")).toBe("trash");
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.zoneOf("bryn")).toBe("trash"); // Smite resolved in full
    expect(game.zoneOf("weak")).toBe("base");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("play", "late")).toBe(false);
    // The rest of each top-5 was recycled: card 6 is now on top.
    expect(game.p1.deck()[0]).toBe("a6");
    expect(game.p2.deck()[0]).toBe("b6");
    expect(game.violations()).toEqual([]);
  });

  test("the lock is 'this turn' only: on P1's next turn the Latecomer is playable again", async () => {
    const game = await pfIntoBrynhirAndSmite();
    await game.p1.pick("weak");
    await game.settle();
    expect(game.p1.can("play", "late")).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 1 });
    expect(game.p1.can("play", "late")).toBe(true);
  });
});
