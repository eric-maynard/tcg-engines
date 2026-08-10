/**
 * Ruling 0973029c90e1a403 — Not So Fast (SFD-045 → sfd-045-221) · Reaction spell · Calm · [2][calm]
 *   "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Brynhir Thundersong (OGN-026 → ogn-026-298) · Unit · Fury · [6] · 5 Might "When you play me, opponents
 *     can't play cards this turn."
 *   (+ Discipline ogn-058-298 as an ordinary Reaction in P1's hand; Zhonya's Hourglass ogn-077-298 hidden.)
 *
 * Q: Can Not So Fast counter Brynhir Thundersong's ability?
 * A: No — Brynhir's play trigger is a global effect that chooses no unit or gear, so it is not a legal object
 *    for Not So Fast. You may still respond to the trigger with OTHER reactions (e.g. a hidden Zhonya's) while
 *    it is on the chain; once it resolves you cannot play cards for the rest of the turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const BRYNHIR = "ogn-026-298";
const DISCIPLINE = "ogn-058-298";
const ZHONYAS = "ogn-077-298";

/**
 * P2's turn. P2: Brynhir + a Discipline in hand, [8]. P1: Not So Fast + Discipline in hand, [4] + [calm];
 * a Sentinel (3) at P1's bf1 with a facedown Zhonya's Hourglass there.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
    .facedown(P1, "bf1", ZHONYAS, "zhonyas")
    .hand(P1, NOT_SO_FAST, "nsf")
    .hand(P1, DISCIPLINE, "discP1")
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .hand(P2, BRYNHIR, "brynhir")
    .hand(P2, DISCIPLINE, "discP2")
    .resources(P2, { energy: 8 });
}

/** P2 plays Brynhir; her play trigger is on the chain and P1 holds priority. */
async function brynhirTriggerPendingWithP1(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("brynhir");
  expect(game.zoneOf("brynhir")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "brynhir", controller: P2, triggered: true })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 0973029c90e1a403 — Not So Fast cannot counter Brynhir's global 'can't play cards' trigger", () => {
  test("with Brynhir's trigger on the chain, Not So Fast has no legal object: it is not castable (the trigger chooses no unit/gear)", async () => {
    const game = await brynhirTriggerPendingWithP1();
    const opt = game.p1.option("cast", "nsf");
    const offered = (opt?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual([]); // Brynhir's trigger is never offered
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf"));
    expect(r.ok).toBe(false);
  });

  test("…but P1 CAN still respond with other reactions while the trigger waits: an ordinary Reaction spell and the hidden Zhonya's are both legal now", async () => {
    const game = await brynhirTriggerPendingWithP1();
    expect(game.p1.can("cast", "discP1")).toBe(true);
    expect(game.p1.can("reveal", "zhonyas")).toBe(true);
    await game.p1.reveal("zhonyas");
    expect(game.state("zhonyas").isHidden).toBe(false);
    expect(game.zoneOf("zhonyas")).not.toBe("facedown-bf1");
  });

  test("once the trigger resolves, P1 cannot play cards this turn: given priority on P2's next spell, P1's Discipline (affordable) is not legal", async () => {
    const game = await brynhirTriggerPendingWithP1();
    await game.p1.passPriority(); // both passed → Brynhir's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    await game.p2.cast("discP2", { targets: "brynhir" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(4); // could afford Discipline [2] …
    expect(game.p1.can("cast", "discP1")).toBe(false); // … but may not play cards this turn
    expect(game.p1.can("cast", "nsf")).toBe(false); // (Discipline does choose a unit — still no: can't play cards)
  });

  test("the lock lasts only this turn: on P1's own next turn Discipline is playable again", async () => {
    const game = await brynhirTriggerPendingWithP1();
    await game.p1.passPriority();
    await game.advanceTurn(); // → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(2); // pools emptied at end of turn; pay from the 2 freshly channeled runes
    expect(game.p1.can("cast", "discP1")).toBe(true);
  });
});
