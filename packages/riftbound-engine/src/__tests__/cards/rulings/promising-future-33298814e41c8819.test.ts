/**
 * Ruling 33298814e41c8819 — Promising Future (OGN-115 → ogn-115-298) · Mind · [5][mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest.
 *      Starting with the next player, each player plays those cards, ignoring Energy costs."
 *   × Sneaky Deckhand (OGN-176 → ogn-176-298) · 2 Might · "You may play me to an open battlefield."
 *
 * Q: When Promising Future lets me put a character on an empty battlefield, do I score the conquest point
 *    right away, or must the spell finish resolving first?
 * A: Everything has to finish first. The arrival applies Contested during the resolution, but a showdown can
 *    only BEGIN from a Neutral Open State — i.e. once the chain is empty — and the point is scored only when
 *    that showdown closes with you alone there.
 * Rules: 190.3.a / 450 (Contested on arrival), 323.11–323.13 (staged showdowns open in cleanup),
 *        348.2 (a non-combat close conquers), 401.1 / 310.3 (Open vs Closed State), 471.2.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

type PickD = Extract<Decision, { kind: "pick" }>;

const PROMISING_FUTURE = "ogn-115-298";
const SNEAKY_DECKHAND = "ogn-176-298";
const FILLER = "ogn-046-298"; // En Garde — cheap chaff for the rest of the top 5

/** P1's main phase. bf1 is open (nobody controls it, nobody is on it). Deckhand sits on top of P1's deck. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .battlefield("bf1", { controller: null })
    .deck(P1, [SNEAKY_DECKHAND, FILLER, FILLER, FILLER, FILLER], ["deckhand", "a1", "a2", "a3", "a4"])
    .deck(P2, [FILLER, FILLER, FILLER, FILLER, FILLER], ["b1", "b2", "b3", "b4", "b5"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

/** Cast it, let it start resolving, and have each player banish one of their five. */
async function bothBanished(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pf");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("deckhand");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  await game.p2.pick("b1");
  return game;
}

describe("Ruling 33298814e41c8819 — Promising Future must finish resolving before the showdown (and the point)", () => {
  test("each player looks at five and banishes one; the rest are recycled", async () => {
    const game = await bothBanished();
    expect(game.zoneOf("deckhand")).not.toBe("mainDeck");
    for (const c of ["a1", "a2", "a3", "a4"]) {
      expect(game.zoneOf(c)).toBe("mainDeck");
    }
  });

  test("the banished card is then PLAYED, and its destination includes the open battlefield", async () => {
    const game = await bothBanished();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect((d as PickD).options.map((o) => o.key)).toEqual(["base", "battlefield-bf1"]);
  });

  test("ruling: sending it to the open battlefield does NOT score anything on arrival", async () => {
    const game = await bothBanished();
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("deckhand")).toBe("bf1");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("ruling: only once the chain is empty does the showdown open — and only its close scores the point", async () => {
    const game = await bothBanished();
    await game.p1.pick("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown" });
    expect(game.p1.points()).toBe(0);
    await game.p1.passFocus();
    await game.p2.passFocus(); // the non-combat showdown closes
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("control: keeping the Deckhand at home contests nothing and scores nothing", async () => {
    const game = await bothBanished();
    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("deckhand")).toBe("base");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});
