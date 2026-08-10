/**
 * Ruling a20037dd27778a68 — Machine Evangel (OGN-239 → ogn-239-298) · 4 Might · "[Deathknell] — Play three 1 [Might] Recruit unit
 *     tokens into your base."
 *   × Brynhir Thundersong (OGN-026 → ogn-026-298) · [6] · 5 Might · "When you play me, opponents can't play cards this turn."
 *   (kill spell used: Falling Star ogn-029-298, both instances on the Evangel; Gust ogn-169-298 shows the lock.)
 *
 * Q: I played Brynhir, then killed my opponent's Machine Evangel. Do they still get its Deathknell?
 * A: Yes. Brynhir only stops opponents from PLAYING CARDS; a Deathknell is a triggered ability, and tokens are not cards — the
 *    three Recruits are created normally.
 * Rules: 186 (tokens are not cards), 340 ff. (playing a card), 808 (Deathknell), 383.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MACHINE_EVANGEL = "ogn-239-298";
const BRYNHIR = "ogn-026-298";
const FALLING_STAR = "ogn-029-298";
const GUST = "ogn-169-298";

/** P1's turn with [8] + fury×2. P2: Machine Evangel at P2's bf1, Gust in hand with [1], empty base. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", MACHINE_EVANGEL, "evangel")
    .hand(P1, BRYNHIR, "bryn")
    .hand(P1, FALLING_STAR, "star")
    .hand(P2, GUST, "gust");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P2, zone: "base" });

async function brynhirResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("bryn");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bryn", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.zoneOf("bryn")).toBe("base");
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling a20037dd27778a68 — Brynhir's lock does not stop Machine Evangel's Deathknell tokens", () => {
  test("premise: after Brynhir, P2 cannot play cards — with Falling Star aimed at the Evangel, P2's affordable Gust is not legal in response", async () => {
    const game = await brynhirResolved();
    await game.p1.cast("star", { targets: ["evangel", "evangel"] });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.energy()).toBe(1);
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect((await game.p2.try((p) => p.cast("gust", { targets: "evangel" }))).ok).toBe(false);
  });

  test("the Evangel dies (3 + 3 ≥ 4) → its Deathknell triggers and resolves the same turn: three 1-Might Recruit tokens in P2's base", async () => {
    const game = await brynhirResolved();
    expect(recruits(game)).toEqual([]);
    await game.p1.cast("star", { targets: ["evangel", "evangel"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Falling Star resolves
    expect(game.zoneOf("evangel")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "evangel", controller: P2, triggered: true })]); // Deathknell is an ability, not a card play
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P1); // still the Brynhir turn
    expect(recruits(game)).toHaveLength(3);
    for (const r of recruits(game)) {
      expect(game.state(r)).toMatchObject({ controller: P2, isToken: true, location: "base", might: 1 });
    }
    expect(game.violations()).toEqual([]);
  });

  test("control: without Brynhir the same kill yields the same three Recruits", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["evangel", "evangel"] });
    await game.settle();
    expect(game.zoneOf("evangel")).toBe("trash");
    expect(recruits(game)).toHaveLength(3);
  });
});
