/**
 * Ruling 109bf9260e52d2f2 — Rebuke (OGN-172 → ogn-172-298) · Spell · Chaos · 2+[chaos][chaos] · Action
 *   "Return a unit at a battlefield to its owner's hand."
 *   × Here to Help (SFD-111 → sfd-111-221) · Spell · Body · 2 · Hidden/Action · "You may play a unit from hand to a
 *     battlefield you control, reducing its cost by [3]."
 *   × Brynhir Thundersong (OGN-026 → ogn-026-298) · Unit · Fury · 6 · 5 Might · "When you play me, opponents can't
 *     play cards this turn."
 *
 * Q: I Rebuke an enemy unit at a battlefield; they react by playing Here to Help from hidden there and dropping
 *    Brynhir onto that battlefield. Does my Rebuke still go off?
 * A: Yes. LIFO: Brynhir's trigger and Here to Help resolve first — from now on I can't PLAY new cards this turn —
 *    but that does not counter or affect a spell already on the chain. Rebuke resolves last and, its target still
 *    being at the battlefield, returns it to its owner's hand.
 * Rules: 811.1.c–d (a Hidden card is played from facedown with Reaction timing for [0]), 336–340 (LIFO),
 *        355.4 / 359.3 (targets locked at play; still legal if still there), 054/366 ("can't play" restricts
 *        playing, not resolving).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUKE = "ogn-172-298";
const HERE_TO_HELP = "sfd-111-221";
const BRYNHIR = "ogn-026-298";
/** Cheap cards for P1 so "can't play cards this turn" is observable afterwards. */
const GRUNT = { cardType: "unit", energyCost: 1, might: 1, name: "Grunt" } as const;
const ZAP = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Zap",
  timing: "action",
} as const;

/**
 * P1's turn. P2 holds bf1 with a 3-Might Target and has Here to Help facedown there (hidden on an earlier turn),
 * Brynhir in hand and exactly 3 energy (6 − 3). P1: Rebuke + Grunt + Zap in hand, 4 energy + chaos chaos.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Target" }, "target")
    .facedown(P2, "bf1", HERE_TO_HELP, "hth")
    .hand(P2, BRYNHIR, "bryn")
    .hand(P1, REBUKE, "rebuke")
    .hand(P1, GRUNT, "grunt")
    .hand(P1, ZAP, "zap");
}

/** P1 Rebukes the Target and passes; P2 reveals Here to Help from hidden in response. Chain = [rebuke, hth]. */
async function rebukeThenHereToHelp(game: Game): Promise<void> {
  await game.p1.cast("rebuke", { targets: "target" });
  expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rebuke", controller: P1, targets: ["target"] })]);
  await game.p1.passPriority();
  // Closed State, P2 has priority: the facedown Here to Help is playable (Reaction timing from Hidden, cost 0).
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
  expect(game.p2.can("reveal", "hth")).toBe(true);
  expect(game.p2.can("play", "bryn")).toBe(false); // Brynhir itself can't be played straight from hand here
  await game.p2.reveal("hth");
  expect(game.p2.energy()).toBe(3); // played for [0]
  expect(game.chain().map((c) => c.cardId)).toEqual(["rebuke", "hth"]);
}

/** Both pass → Here to Help resolves; P2 picks Brynhir from hand (→ bf1 for 3); its play trigger lands on the chain. */
async function resolveHereToHelpIntoBrynhir(game: Game): Promise<void> {
  await game.p2.passPriority();
  await game.p1.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2 });
  const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
  expect(offered).toContain("bryn");
  await game.p2.pick("bryn");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("battlefield-bf1"); // the only battlefield P2 controls (may be locked without asking)
  }
  expect(game.zoneOf("bryn")).toBe("battlefield-bf1");
  expect(game.p2.energy()).toBe(0); // 6 − 3
  expect(game.zoneOf("hth")).toBe("trash");
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "rebuke", controller: P1, targets: ["target"] }),
    expect.objectContaining({ cardId: "bryn", controller: P2, triggered: true }),
  ]);
}

describe("Ruling 109bf9260e52d2f2 — Rebuke still resolves under a hidden Here to Help → Brynhir response", () => {
  test("the response is legal: with Rebuke on the chain P2 plays Here to Help from facedown for [0]; it resolves first (LIFO) and plays Brynhir from hand to bf1 for 3, whose trigger goes on the chain above Rebuke", async () => {
    const game = await board().build();
    await rebukeThenHereToHelp(game);
    await resolveHereToHelpIntoBrynhir(game);
    expect(game.zoneOf("target")).toBe("battlefield-bf1"); // Rebuke has not resolved yet
    expect(game.zoneOf("rebuke")).toBe("chain");
  });

  test("Brynhir's trigger resolves BEFORE Rebuke: P1 can no longer play cards this turn — yet Rebuke, already on the chain, is neither countered nor removed", async () => {
    const game = await board().build();
    await rebukeThenHereToHelp(game);
    await resolveHereToHelpIntoBrynhir(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Brynhir's trigger resolves
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rebuke", controller: P1, countered: false, targets: ["target"] })]);
    // P1 holds priority with 2 energy and two 1-cost cards, but may not PLAY anything now.
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "zap")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("cast");
  });

  test("Rebuke resolves LAST: the Target — still at bf1 — returns to its owner's (P2's) hand; Brynhir stays; Rebuke → trash", async () => {
    const game = await board().build();
    await rebukeThenHereToHelp(game);
    await resolveHereToHelpIntoBrynhir(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("target")).toBe("hand");
    expect(game.p2.hand()).toContain("target");
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.zoneOf("bryn")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("…and for the remainder of the turn P1 (2 energy) cannot play the 1-cost Grunt or Zap in the open main phase; next turn of P1's they are playable again", async () => {
    const game = await board().build();
    await rebukeThenHereToHelp(game);
    await resolveHereToHelpIntoBrynhir(game);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "grunt")).toBe(false);
    expect(game.p1.can("cast", "zap")).toBe(false);
    expect((await game.p1.try((p) => p.play("grunt"))).ok).toBe(false);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 2 });
    expect(game.p1.can("play", "grunt")).toBe(true);
    expect(game.p1.can("cast", "zap")).toBe(true);
  });
});
