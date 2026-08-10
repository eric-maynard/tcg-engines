/**
 * Ruling 197aecc657a55596 — Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might "[Deathknell] — Draw 1."
 *   × Dragon Form (VEN-116 → ven-116-166) · Spell [3] "Choose a unit. Its base Might becomes 5 this turn."
 *   (token copy made with Mirror Image, unl-200-219: "Choose a unit. Play a ready Reflection unit token to your
 *    base. It becomes a copy of that unit. Give it [Temporary].")
 *
 * Q: A token copy is made of a Watchful Sentry that had Dragon Form played on it. Does the token get 1 Might or 5?
 * A: 1. Dragon Form is a temporary trait-altering effect on the original, not a copyable printed trait; copies take
 *    only printed name/type/tags/cost/domain/rules text/Might.
 * Rules: 477.1.b.1 (copyable traits), layer-1 trait alteration is not inherited.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const WATCHFUL_SENTRY = "ogn-096-298";
const DRAGON_FORM = "ven-116-166";
const MIRROR_IMAGE = "unl-200-219";

/** P1's turn. Watchful Sentry (1) in base; Dragon Form [3] and Mirror Image [3][rainbow][rainbow] in hand; exactly enough to pay both. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .hand(P1, DRAGON_FORM, "dragonForm")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .resources(P1, { energy: 6, power: { mind: 1, order: 1 } });
}

/** Cast Mirror Image on the Sentry and return the fresh Reflection token's id. */
async function reflectSentry(game: Game): Promise<string> {
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: "sentry" });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const fresh = game.p1.base().filter((id) => !before.includes(id) && game.state(id).isToken);
  expect(fresh).toHaveLength(1);
  return fresh[0] as string;
}

describe("Ruling 197aecc657a55596 — a copy of a Dragon-Formed Watchful Sentry has the PRINTED 1 Might, not 5", () => {
  test("premise: Dragon Form sets the original Sentry's base Might to 5 for the turn", async () => {
    const game = await board().build();
    expect(game.state("sentry").might).toBe(1);
    await game.p1.cast("dragonForm", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("dragonForm")).toBe("trash");
    expect(game.state("sentry").might).toBe(5);
  });

  test("the Reflection copy of the Dragon-Formed Sentry enters as 'Watchful Sentry' with 1 Might (477.1.b.1) while the original stays 5", async () => {
    const game = await board().build();
    await game.p1.cast("dragonForm", { targets: "sentry" });
    await game.settle();
    expect(game.state("sentry").might).toBe(5);
    const tok = await reflectSentry(game);
    expect(game.state(tok)).toMatchObject({ controller: P1, isToken: true, name: "Watchful Sentry", zone: "base" });
    expect(game.state(tok).might).toBe(1);
    expect(game.state("sentry").might).toBe(5); // the original keeps its temporary 5
    expect(game.violations()).toEqual([]);
  });

  test("control: copying an un-altered Sentry also yields 1 Might — the copy result is the same either way", async () => {
    const game = await board().build();
    const tok = await reflectSentry(game);
    expect(game.state(tok).name).toBe("Watchful Sentry");
    expect(game.state(tok).might).toBe(1);
  });

  test("Dragon Form on the original wears off at end of turn (→ 1); the token was never 5 at any point", async () => {
    const game = await board().build();
    await game.p1.cast("dragonForm", { targets: "sentry" });
    await game.settle();
    const tok = await reflectSentry(game);
    expect(game.state(tok).might).toBe(1);
    await game.p1.endTurn();
    await game.settle();
    expect(game.state("sentry").might).toBe(1);
    if (game.has(tok) && game.zoneOf(tok) === "base") {
      expect(game.state(tok).might).toBe(1);
    }
  });
});
