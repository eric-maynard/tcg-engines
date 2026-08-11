/**
 * Ruling 177b33d6e6fad890 — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · Champion Unit · Body · [5][body] · 6 Might
 *   "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *    I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *   × Inferna (UNL-002 → unl-002-219) · Unit · [2] · 1 Might · "[Ambush] [Assault 2]" — a plain Ambush unit for contrast.
 *
 * Q: Can I play Rengar on a reaction chain to a battlefield where I have no units but my opponent does?
 * A: Yes. His text expands the Ambush permission to battlefields holding enemy units, and the Reaction timing
 *    rides along with it, so he can be played during a Closed State (a "reaction chain") to such a battlefield.
 *    The limit: enemy units must actually be there — an open (unoccupied, uncontrolled) battlefield is not a
 *    legal destination for him.
 * Rules: 822.1.b (Ambush = permission + Reaction while being played to a legal battlefield), 822.1.d (a card may
 *        expand Ambush's permissions — the CR names this very card), 309.1/309.1.a (Closed State ⇒ Reaction only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";
const INFERNA = "unl-002-219";
/** P2's no-target spell, used purely to put an item on the chain and close the state. */
const TRICK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Trick",
  timing: "reaction",
} as const;

/**
 * P2's turn. bf1 = P2's, holding a 3-Might Prey and NO unit of P1's. bf2 = open: no controller, no units.
 * bf3 = P1's, holding a 2-Might Ally (the only legal Ambush destination for a plain Ambush unit).
 * P1 holds Rengar and Inferna with [7][body].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 7, power: { body: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .battlefield("bf3", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Prey" }, "prey")
    .unit(P1, "bf3", { might: 2, name: "Ally" }, "ally")
    .hand(P1, RENGAR, "rengar")
    .hand(P1, INFERNA, "inferna")
    .hand(P2, TRICK, "trick");
}

/** P2 casts Trick on their own turn and passes priority: the chain is live and P1 is in a Closed State. */
async function reactionChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("trick");
  expect(game.chain().map((c) => c.cardId)).toEqual(["trick"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** Battlefield destinations the engine offers for playing `card` right now. */
function destinations(game: Game, card: string): string[] {
  const field = game.p1.option("playUnit", card)?.fields.find((f) => f.name === "location");
  return (field?.options ?? []).flat().map(String);
}

describe("Ruling 177b33d6e6fad890 — Rengar Ambushes into a battlefield held only by enemy units", () => {
  test("premise: P1 controls no units at bf1 while P2's Prey is there; bf2 is genuinely open", async () => {
    const game = await board().build();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual(["prey"]);
    expect(game.cardsAt("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
  });

  test("ruling 177b33d6e6fad890 — during a reaction chain on the opponent's turn Rengar is playable, and the enemy-held bf1 is among his destinations", async () => {
    const game = await reactionChain();
    expect(game.p1.can("play", "rengar")).toBe(true);
    expect(destinations(game, "rengar")).toContain("battlefield-bf1");
  });

  test("…and playing him there works: he goes on the chain as a Reaction above P2's spell, resolves first, and enters bf1 — contesting it", async () => {
    const game = await reactionChain();
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toEqual(["rengar"]);
    expect(game.state("rengar").might).toBe(6);
    expect(game.zoneOf("trick")).toBe("trash");
  });

  test("the limit — an OPEN battlefield with no enemy units is NOT a legal destination for him", async () => {
    const game = await reactionChain();
    expect(destinations(game, "rengar")).not.toContain("battlefield-bf2");
    const r = await game.p1.try((p) => p.play("rengar", { to: "bf2" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rengar")).toBe("hand");
  });

  test("nor is P1's base: Ambush only ever grants the Reaction timing for a battlefield play, so in a Closed State that is the only shape available", async () => {
    const game = await reactionChain();
    expect(destinations(game, "rengar")).not.toContain("base");
    expect((await game.p1.try((p) => p.play("rengar", { to: "base" }))).ok).toBe(false);
  });

  test("contrast — plain [Ambush] Inferna in the very same window may only go where P1 already has units (bf3), never to the enemy-held bf1", async () => {
    const game = await reactionChain();
    expect(game.p1.can("play", "inferna")).toBe(true);
    const dests = destinations(game, "inferna");
    expect(dests).toContain("battlefield-bf3");
    expect(dests).not.toContain("battlefield-bf1");
    expect(dests).not.toContain("battlefield-bf2");
    expect((await game.p1.try((p) => p.play("inferna", { to: "bf1" }))).ok).toBe(false);
    await game.p1.play("inferna", { to: "bf3" });
    await game.settle();
    expect(game.zoneOf("inferna")).toBe("battlefield-bf3");
    expect(game.violations()).toEqual([]);
  });
});
