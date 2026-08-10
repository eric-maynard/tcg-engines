/**
 * Ruling 7188f734355b6dc0 — Sabotage (OGN-156 → ogn-156-298) · Spell · Body · 1+[body]
 *   "Choose an opponent. They reveal their hand. Choose a non-unit card from it, and recycle that card."
 *   (Mindsplitter ogn-192-298 has the same "they reveal their hand" clause.)
 *
 * Q: May you take notes about the opponent's hand after seeing it via Sabotage / Mindsplitter?
 * A: Yes — you may write the information down, and you need not show those notes to your opponent.
 *
 * Note-taking is tournament policy, outside the engine. What the engine owes this ruling is the premise: while Sabotage
 * resolves the WHOLE opposing hand (units included) is genuinely revealed to the caster's seat view — real information
 * the player is entitled to keep — and once it has resolved the hand is private again (so notes are the only record).
 * Rules: 127 (private vs revealed information), 359 (spell resolution), 409 (reveal).
 */
import { describe, expect, test } from "bun:test";
import type { CardView } from "../../../harness";
import { isHiddenView, P1, P2, scenario } from "../../../harness";

const SABOTAGE = "ogn-156-298";
const HEXTECH_RAY = "ogn-009-298";
const GUST = "ogn-169-298";
const GRUNT = { cardType: "unit", energyCost: 1, might: 2, name: "Grunt" } as const;

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 1 } })
    .hand(P1, SABOTAGE, "sab")
    .hand(P2, HEXTECH_RAY, "p2ray")
    .hand(P2, GUST, "p2gust")
    .hand(P2, GRUNT, "p2grunt");
}

/** What P1's seat view shows of P2's hand: card ids where visible, "HIDDEN" where redacted. */
function p2HandAsSeenByP1(hand: readonly CardView[]): string[] {
  return hand.filter((c) => c.owner === P2).map((c) => (isHiddenView(c) ? "HIDDEN" : c.id));
}

describe("Ruling 7188f734355b6dc0 — Sabotage really reveals the opponent's whole hand to you (what you note down is yours to keep)", () => {
  test("before Sabotage, P2's hand is private: P1's view sees three redacted cards", async () => {
    const game = await board().build();
    expect(p2HandAsSeenByP1(game.p1.view().zones.hand ?? [])).toEqual(["HIDDEN", "HIDDEN", "HIDDEN"]);
  });

  test("while Sabotage resolves, P2's ENTIRE hand — the unit too, not just the legal picks — is visible in P1's view; P1 (the caster) is the one choosing, among non-units only", async () => {
    const game = await board().build();
    await game.p1.cast("sab");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual(["p2gust", "p2ray"]); // non-units only
    expect(p2HandAsSeenByP1(game.p1.view().zones.hand ?? []).toSorted()).toEqual(["p2grunt", "p2gust", "p2ray"]);
  });

  test("after it resolves (Gust recycled to the bottom of P2's deck) the remaining hand is private again — the reveal was a one-time look", async () => {
    const game = await board().build();
    await game.p1.cast("sab");
    await game.settle();
    await game.p1.pick("p2gust");
    await game.settle();
    expect(game.zoneOf("sab")).toBe("trash");
    expect(game.zoneOf("p2gust")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("p2gust");
    expect(game.p2.hand().toSorted()).toEqual(["p2grunt", "p2ray"]);
    expect(p2HandAsSeenByP1(game.p1.view().zones.hand ?? [])).toEqual(["HIDDEN", "HIDDEN"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
