/**
 * Ruling 4320ed38ff125b0b — Ravenbloom Student (OGN-103 → ogn-103-298) · Unit · 2 Might
 *   "When you play a spell, give me +1 [Might] this turn."
 *   × Wages of Pain (SFD-070 → sfd-070-221) · Spell · [Hidden] [Action] "Deal 3 to a unit at a battlefield. …"
 *   × Teemo, Scout (OGN-197 → ogn-197-298) · Unit · [Hidden] · "When you play me, give me +3 [Might] this turn."
 *
 * Q: Does Ravenbloom Student get +1 when you play a spell from hidden?
 * A: Yes — playing a card from hidden is still playing it. Hiding the card is a separate action that is NOT a
 *    play (it opens no chain and passes no priority), so hiding triggers nothing; and revealing a UNIT from
 *    hidden is a unit play, not a spell, so that triggers nothing either.
 * Rules: 811 ([Hidden]: hide, then play from face down), 419 (playing a card, from any zone), 383.4 (When-you-play-a-spell).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM = "ogn-103-298";
const WAGES_OF_PAIN = "sfd-070-221";
const TEEMO_SCOUT = "ogn-197-298";

/** P1's turn. Ravenbloom Student (2) in P1's base; P1 holds bf1 with a Sentry; P2 has a Target at bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", RAVENBLOOM, "student")
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 4, name: "Target" }, "victim");
}

describe("Ruling 4320ed38ff125b0b — a spell played from hidden still counts as played for Ravenbloom Student", () => {
  test("ruling nuance: HIDING the spell is not playing it — no trigger, no chain, no priority pass", async () => {
    const game = await board().hand(P1, WAGES_OF_PAIN, "wages").build();
    await game.p1.hide("wages", "bf1");
    expect(game.zoneOf("wages")).toBe("facedown-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("student").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("ruling: playing that spell out of the face-down zone DOES trigger the Student — 2 → 3", async () => {
    const game = await board().facedown(P1, "bf1", WAGES_OF_PAIN, "wages").build();
    expect(game.zoneOf("wages")).toBe("facedown-bf1");
    await game.p1.reveal("wages");
    // Played from hiding the choice is locked to bf1 (811.1.d.2), so the Sentry is the only unit it can hit.
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("sentry");
    }
    await game.settle();
    expect(game.state("student").might).toBe(3);
    expect(game.zoneOf("sentry")).toBe("trash"); // 3 ≥ 2
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.p1.energy()).toBe(3); // played from hiding for [0]
    expect(game.violations()).toEqual([]);
  });

  test("baseline: the same spell played from HAND gives the same +1", async () => {
    const game = await board().hand(P1, WAGES_OF_PAIN, "wages").build();
    await game.p1.cast("wages", { targets: "victim" });
    await game.settle();
    expect(game.state("student").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("ruling nuance: revealing a UNIT from hidden is not a spell — the Student stays at 2", async () => {
    const game = await board().facedown(P1, "bf1", TEEMO_SCOUT, "teemo").build();
    await game.p1.reveal("teemo");
    await game.settle();
    expect(game.locationOf("teemo")).toBe("bf1");
    expect(game.state("student").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
