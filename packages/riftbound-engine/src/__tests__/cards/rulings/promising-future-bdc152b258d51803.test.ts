/**
 * Ruling bdc152b258d51803 — Promising Future (OGN-115 → ogn-115-298) × Riptide Rex (OGN-092 → ogn-092-298)
 *   × Carnivorous Snapvine (ogn-149-298)
 *   Promising Future ([5][mind]): "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles
 *   the rest. Starting with the next player, each player plays those cards, ignoring Energy costs. (They must still pay Power costs.)"
 *   Rex (6): "When you play me, deal 6 to an enemy unit at a battlefield."
 *   Snapvine (6): "When you play me, choose an enemy unit at a battlefield. We deal damage equal to our Mights to each other."
 *
 * Q: Off Promising Future one player takes Snapvine and the other Riptide Rex — can Snapvine's play effect trade with Rex, and
 *    can Rex kill Snapvine before Snapvine's effect resolves?
 * A: The caster's opponent chooses after the caster; the next player's card (Snapvine) is played first, then the caster's (Rex);
 *    both play triggers then go on the chain — Snapvine's first, Rex's on top — so Rex's resolves FIRST. If Rex targets Snapvine,
 *    Snapvine dies but its trigger still resolves and can kill Rex; if Rex targets something else, both resolve and the units trade.
 * Rules: 337.1.b / 354.2 (pending items finalized in order), 383.5 (a trigger resolves even if its source died), 336–340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const RIPTIDE_REX = "ogn-092-298"; // [6][mind][mind], 6 Might
const SNAPVINE = "ogn-149-298"; // [5][body][body], 6 Might
const JUNK = { cardType: "spell", energyCost: 1, name: "Junk" } as const;

/**
 * P1's turn: P1 casts Promising Future ([5][mind]) and keeps [mind][mind] for Rex's Power; P2 has [body][body] for Snapvine's.
 * Each side holds one battlefield with a 7-Might Holder (survives a 6). Rex is in P1's top 5, Snapvine in P2's.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 5, power: { mind: 3 } })
    .resources(P2, { power: { body: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 7, name: "P1 Holder" }, "holder1")
    .unit(P2, "bf2", { might: 7, name: "P2 Holder" }, "holder2")
    .deck(P1, [JUNK, RIPTIDE_REX, JUNK, JUNK, JUNK, JUNK], ["a1", "rex", "a3", "a4", "a5", "a6"])
    .deck(P2, [JUNK, JUNK, SNAPVINE, JUNK, JUNK, JUNK], ["b1", "b2", "snapvine", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

const pickOf = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.key) : []);

/**
 * Cast Promising Future and let it resolve; both players banish their unit, place it on their battlefield, and name targets:
 * Snapvine → Rex, Rex → `rexTarget`. Returns with both triggers on the chain and priority open.
 */
async function bothPlayed(rexTarget: "snapvine" | "holder2"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 2 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  // The caster (P1) chooses first, then the opponent — each from their own top 5.
  let d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
  expect(pickOf(d).sort()).toEqual(["a1", "a3", "a4", "a5", "rex"]);
  await game.p1.pick("rex");
  expect(game.zoneOf("rex")).toBe("banishment");
  d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "from-revealed" });
  expect(pickOf(d).sort()).toEqual(["b1", "b2", "b4", "b5", "snapvine"]);
  await game.p2.pick("snapvine");
  // "Starting with the next player": P2's Snapvine is played first (P2 places it), then P1's Rex.
  d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "snapvine" } });
  expect(game.zoneOf("rex")).toBe("banishment"); // Rex not played yet
  await game.p2.pick("battlefield-bf2");
  expect(game.zoneOf("snapvine")).toBe("battlefield-bf2");
  expect(game.p2.power("body")).toBe(0); // Power still paid, Energy ignored
  d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "rex" } });
  await game.p1.pick("battlefield-bf1");
  expect(game.zoneOf("rex")).toBe("battlefield-bf1");
  expect(game.p1.power("mind")).toBe(0);
  // Both play triggers are now put on the chain in that order and their targets chosen: Snapvine's first, then Rex's.
  d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "snapvine" } });
  expect(pickOf(d).sort()).toEqual(["holder1", "rex"]);
  await game.p2.pick("rex");
  d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "rex" } });
  expect(pickOf(d).sort()).toEqual(["holder2", "snapvine"]);
  await game.p1.pick(rexTarget);
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "snapvine", controller: P2, targets: ["rex"], triggered: true }),
    expect.objectContaining({ cardId: "rex", controller: P1, targets: [rexTarget], triggered: true }),
  ]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  return game;
}

describe("Ruling bdc152b258d51803 — Snapvine vs Riptide Rex off Promising Future: Rex's trigger resolves first, Snapvine's still resolves even if it died", () => {
  test("Rex targets Snapvine: Rex's trigger (top) resolves first and kills Snapvine (6 dmg on 6 Might) while Snapvine's trigger is still on the chain", async () => {
    const game = await bothPlayed("snapvine");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("snapvine")).toBe("trash");
    expect(game.zoneOf("rex")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snapvine", targets: ["rex"], triggered: true })]);
  });

  test("…then dead Snapvine's trigger STILL resolves and kills Rex (6 to a 6-Might Rex): both end in the trash, the Holders untouched", async () => {
    const game = await bothPlayed("snapvine");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("snapvine")).toBe("trash");
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.state("holder1").damage).toBe(0);
    expect(game.state("holder2").damage).toBe(0);
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Rex targets something else (P2's Holder takes 6): both triggers resolve and Snapvine's mutual damage trades the two 6-Might units", async () => {
    const game = await bothPlayed("holder2");
    await game.acting().passPriority();
    await game.acting().passPriority(); // Rex → Holder 2
    expect(game.state("holder2").damage).toBe(6);
    expect(game.zoneOf("holder2")).toBe("battlefield-bf2");
    expect(game.zoneOf("snapvine")).toBe("battlefield-bf2");
    await game.settle(); // Snapvine ↔ Rex
    expect(game.zoneOf("snapvine")).toBe("trash");
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
