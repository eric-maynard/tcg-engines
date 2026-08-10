/**
 * Ruling 22ed336a9af8edc9 — Promising Future (OGN-115 → ogn-115-298, 5 + [mind]) "Each player looks at the top 5 cards of
 *   their Main Deck, banishes one of them, then recycles the rest. Starting with the next player, each player plays those
 *   cards, ignoring Energy costs."  (× Baited Hook ogn-242-298 — same "played during a resolution" idea)
 *   with Void Seeker (ogn-024-298, Action, 3 + [fury]) "Deal 4 to a unit at a battlefield. Draw 1." as the plain spell.
 *
 * Q: What does "pending" mean for the chain / spell resolution?
 * A: An item is pending from the moment it is played until its choices are made, costs paid and legality checked; only
 *    then is it finalized on the chain and reactions become possible. Cards played DURING another spell's resolution
 *    (Promising Future, Baited Hook) stay pending until that spell has fully resolved, and are finalized afterwards.
 * Rules: 346–351 (play sequence), 337.1 / 337.4 (pending items finalize before priority), 354.3 (plays during resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const VOID_SEEKER = "ogn-024-298";
const STUPEFY = "ogn-095-298";
const DUNE_DRAKE = "ogn-131-298"; // 5-cost, no Power cost → free under PF
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;

/** P1's turn. P2's 5-Might Target at P2's bf1; P1's Holder at P1's bf2 (each side has a base-or-battlefield choice). Both decks: Dune Drake on top of four fillers. P1: PF + Void Seeker (exact costs); P2: Stupefy + 1. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 1, mind: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "Target" }, "target")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .deck(
      P1,
      [DUNE_DRAKE, FILLER, FILLER, FILLER, FILLER, FILLER],
      ["drake1", "a2", "a3", "a4", "a5", "a6"],
    )
    .deck(
      P2,
      [DUNE_DRAKE, FILLER, FILLER, FILLER, FILLER, FILLER],
      ["drake2", "b2", "b3", "b4", "b5", "b6"],
    )
    .hand(P1, PROMISING_FUTURE, "pf")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P2, STUPEFY, "stupefy");
}

const isBanishPick = (seat: Seat) => (d: Decision | null) =>
  d?.kind === "pick" && d.seat === seat && /banish/i.test(d.prompt);
const isDestinationPick = (d: Decision | null) =>
  d?.kind === "pick" && /destination/i.test(d.prompt);

/** Step passes only (no picks) until `pred` holds. */
async function until(game: Game, pred: (d: Decision | null) => boolean): Promise<Decision> {
  for (let i = 0; i < 20 && !pred(game.decision()); i++) {
    const d = game.decision();
    expect(d?.kind).toBe("action"); // we only ever auto-step priority passes here
    await game.seat(d!.seat).pass();
  }
  const d = game.decision();
  expect(pred(d)).toBe(true);
  return d!;
}

describe("Ruling 22ed336a9af8edc9 — 'pending': choices + costs first, then finalized on the chain, then reactions", () => {
  test("a plain spell (Void Seeker): by the time it is a chain item its target is chosen and its cost paid; the caster holds priority and the opponent may react only after that", async () => {
    const game = await board().build();
    expect(game.p2.can("cast", "stupefy")).toBe(false); // nothing to react to yet
    await game.p1.cast("vs", { targets: "target" });
    // Finalized: choices made, costs paid, on the chain.
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 0, mind: 1 } });
    expect(game.chain()).toEqual([
      expect.objectContaining({
        cardId: "vs",
        controller: P1,
        targets: ["target"],
        triggered: false,
      }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]); // P2 has nothing until priority reaches them
    await game.p1.passPriority();
    expect(game.p2.can("cast", "stupefy")).toBe(true); // "now reactions can happen"
    await game.p2.passPriority();
    expect(game.state("target").damage).toBe(4);
  });
});

describe("Ruling 22ed336a9af8edc9 — cards played during Promising Future's resolution stay pending until PF has fully resolved", () => {
  test("while PF resolves, each player's banish pick is a resolution-time prompt with NO reaction window; P1's pick waits in banishment (not played) while P2 picks", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1, mind: 0 } });
    const d1 = await until(game, isBanishPick(P1));
    expect(d1.timing).toBe("RES");
    expect(game.zoneOf("pf")).toBe("chain"); // PF is mid-resolution
    expect(game.p2.legal()).toEqual([]); // nobody can react inside a resolution
    await game.p1.pick("drake1");
    const d2 = await until(game, isBanishPick(P2));
    expect(d2.timing).toBe("RES");
    expect(game.zoneOf("drake1")).toBe("banishment"); // chosen, banished — but its play is still pending
    expect(game.p1.units()).not.toContain("drake1");
    expect(game.zoneOf("pf")).toBe("chain");
    expect(game.p1.legal()).toEqual([]);
    await game.p2.pick("drake2");
    // PF has now finished ("recycle the rest" done for both) …
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.p1.deck().slice(-4).sort()).toEqual(["a2", "a3", "a4", "a5"]);
    expect(game.p2.deck().slice(-4).sort()).toEqual(["b2", "b3", "b4", "b5"]);
  });

  test("… and only THEN are the pending plays finalized, next player (P2) first: P2 places drake2, then P1 places drake1; both enter for 0 energy", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    await until(game, isBanishPick(P1));
    await game.p1.pick("drake1");
    await until(game, isBanishPick(P2));
    await game.p2.pick("drake2");
    expect(game.zoneOf("pf")).toBe("trash"); // fully resolved before either card is played
    expect(game.zoneOf("drake1")).toBe("banishment");
    expect(game.zoneOf("drake2")).toBe("banishment");
    const first = await until(game, isDestinationPick);
    expect(first.seat).toBe(P2); // "starting with the next player"
    await game.p2.pick("base");
    expect(game.zoneOf("drake2")).toBe("base");
    expect(game.zoneOf("drake1")).toBe("banishment"); // P1's is still pending
    const second = await until(game, isDestinationPick);
    expect(second.seat).toBe(P1);
    await game.p1.pick("base");
    expect(game.zoneOf("drake1")).toBe("base");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(3); // Energy costs ignored
    expect(game.p2.energy()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
