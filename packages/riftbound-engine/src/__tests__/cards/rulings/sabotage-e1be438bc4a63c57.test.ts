/**
 * Ruling e1be438bc4a63c57 — Sabotage (OGN-156 → ogn-156-298) · Action · [1][body] · "Choose an opponent. They reveal their hand.
 *     Choose a non-unit card from it, and recycle that card."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Wind Wall (OGN-064 → ogn-064-298) · Reaction · "Counter a spell."
 *
 * Q: If my opponent Defies / Wind Walls my Sabotage, must they wait until I pick the card to recycle? Do I see their hand?
 * A: No and no. The pick is made on RESOLUTION (it is not a target / not chosen at finalization), so the counter is played while
 *    Sabotage waits on the chain, resolves first, and Sabotage goes to trash unresolved — the hand is never revealed.
 * Rules: 355.10 (what is a target), 359 (choices on resolution), 425.1 (countered spell), 336.1 (LIFO), 127 (private info).
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game } from "../../../harness";
import { isHiddenView, P1, P2, scenario } from "../../../harness";

const SABOTAGE = "ogn-156-298";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const HEXTECH_RAY = "ogn-009-298"; // a non-unit in P2's hand (a legal Sabotage pick)
const GRUNT = { cardType: "unit", energyCost: 1, might: 2, name: "Grunt" } as const;

/** P1's turn with [1]+[body]. P2 holds Hextech Ray, a Grunt and the counter under test, with [3]+[calm][calm] to pay for either. */
function board(counter: typeof DEFY | typeof WIND_WALL) {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 1 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .hand(P1, SABOTAGE, "sab")
    .hand(P2, HEXTECH_RAY, "p2ray")
    .hand(P2, GRUNT, "p2grunt")
    .hand(P2, counter, "counter");
}

function p2HandAsSeenByP1(hand: readonly CardView[]): string[] {
  return hand.filter((c) => c.owner === P2).map((c) => (isHiddenView(c) ? "HIDDEN" : c.id));
}

/** P1 casts Sabotage; nothing is asked of P1 yet; P1 passes → P2 has priority with Sabotage alone on the chain. */
async function sabotageOnChain(counter: typeof DEFY | typeof WIND_WALL): Promise<Game> {
  const game = await board(counter).build();
  await game.p1.cast("sab");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sab", controller: P1 })]);
  // Not a target: no pick was demanded at finalization; the next thing is plain chain priority.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(p2HandAsSeenByP1(game.p1.view().zones.hand ?? [])).toEqual(["HIDDEN", "HIDDEN", "HIDDEN"]); // nothing revealed yet
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling e1be438bc4a63c57 — a counter answers Sabotage before any card is chosen; the hand is never revealed", () => {
  test("the recycle choice is made on resolution: with nobody countering, P1 is only asked to pick AFTER both pass (and sees the whole hand then)", async () => {
    const game = await sabotageOnChain(DEFY);
    await game.p2.passPriority(); // resolve
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(p2HandAsSeenByP1(game.p1.view().zones.hand ?? []).toSorted()).toEqual(["counter", "p2grunt", "p2ray"]);
  });

  for (const [name, counter] of [
    ["Defy", DEFY],
    ["Wind Wall", WIND_WALL],
  ] as const) {
    test(`${name}: P2 counters immediately (P2 has priority while Sabotage waits); the counter resolves first, Sabotage goes to trash unresolved — P1 never picks and never sees P2's hand`, async () => {
      const game = await sabotageOnChain(counter);
      expect(game.p2.can("cast", "counter")).toBe(true);
      await game.p2.cast("counter", { targets: "sab" });
      expect(game.chain().map((c) => c.cardId)).toEqual(["sab", "counter"]);
      // Drain by passing only — a from-revealed pick for P1 must never appear.
      for (let i = 0; i < 8 && game.chain().length > 0; i++) {
        const d = game.decision();
        expect(d?.kind).toBe("action");
        if (d?.kind !== "action" || d.context !== "chain") {
          break;
        }
        expect(p2HandAsSeenByP1(game.p1.view().zones.hand ?? []).every((x) => x === "HIDDEN")).toBe(true);
        await game.seat(d.seat).passPriority();
      }
      expect(game.chain()).toEqual([]);
      expect(game.zoneOf("counter")).toBe("trash");
      expect(game.zoneOf("sab")).toBe("trash");
      expect(game.p2.hand().toSorted()).toEqual(["p2grunt", "p2ray"]); // nothing recycled
      expect(game.p2.deck()).not.toContain("p2ray");
      expect(p2HandAsSeenByP1(game.p1.view().zones.hand ?? [])).toEqual(["HIDDEN", "HIDDEN"]);
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
      expect(game.violations()).toEqual([]);
    });
  }
});
