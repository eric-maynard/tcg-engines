/**
 * Ruling 426909af07bb920c — Brynhir Thundersong (OGN-026 → ogn-026-298) · Unit · Fury · [6] · 5 Might
 *     "When you play me, opponents can't play cards this turn."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) · Champion Unit · Order · 4 Might
 *     "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *   (+ Hextech Ray ogn-009-298 as P1's kill spell; Gust ogn-169-298 as the card P2 is locked out of.)
 *
 * Q: If Brynhir was played this turn, can Viktor, Leader still "play" a Recruit token?
 * A: Yes. Brynhir's restriction stops opponents from PLAYING CARDS (hand / facedown). Putting a token into
 *    play through an ability is an effect, not the act of playing a card, so Viktor's trigger still makes
 *    its Recruit.
 * Rules: 186 (tokens are created by effects), 340 ff. (playing a card), FAQ #10133.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRYNHIR = "ogn-026-298";
const VIKTOR_LEADER = "ogn-246-298";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] Action — Deal 3 to a unit at a battlefield
const GUST = "ogn-169-298"; // [1] Reaction — Return a unit at a battlefield with 3 or less Might to hand

/**
 * P1's turn. P1: Brynhir + Hextech Ray in hand, [7] + [fury]. P2: Viktor, Leader in base, a 2-Might Pawn at
 * P2's bf1, Gust in hand with [1] (a card P2 would love to play in response, but may not).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "base", VIKTOR_LEADER, "viktor")
    .unit(P2, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .hand(P1, BRYNHIR, "brynhir")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, GUST, "gust");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P2, zone: "base" });

/** P1 plays Brynhir and lets her trigger resolve. */
async function brynhirResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("brynhir");
  expect(game.zoneOf("brynhir")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "brynhir", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 426909af07bb920c — Brynhir's lock does not stop Viktor, Leader's Recruit token", () => {
  test("premise: after Brynhir's trigger resolves P2 cannot play cards this turn — with Hextech Ray on the chain aimed at the Pawn, P2's affordable Gust is NOT legal", async () => {
    const game = await brynhirResolved();
    await game.p1.cast("ray", { targets: "pawn" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.energy()).toBe(1); // could afford Gust …
    expect(game.p2.can("cast", "gust")).toBe(false); // … but opponents can't play cards this turn
    const r = await game.p2.try((p) => p.cast("gust", { targets: "pawn" }));
    expect(r.ok).toBe(false);
  });

  test("the Pawn dies to Hextech Ray → Viktor's trigger still puts a 1-Might Recruit token into P2's base the same turn", async () => {
    const game = await brynhirResolved();
    expect(recruits(game)).toEqual([]);
    await game.p1.cast("ray", { targets: "pawn" });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.turnPlayer()).toBe(P1); // still the Brynhir turn
    expect(recruits(game)).toHaveLength(1);
    expect(game.state(recruits(game)[0]!)).toMatchObject({ controller: P2, isToken: true, location: "base", might: 1 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: without Brynhir the same kill also yields exactly one Recruit (the lock changes nothing about the token)", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "pawn" });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(recruits(game)).toHaveLength(1);
  });
});
