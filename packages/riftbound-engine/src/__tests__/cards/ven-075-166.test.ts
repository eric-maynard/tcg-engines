/**
 * Platewyrm Egg — ven-075-166 · Gear · 3 energy
 *
 *   This enters exhausted.
 *   [Empower] — [1], [Exhaust] (Use only if not Empowered.)
 *   [Reaction][>] [Exhaust]: [Add] [1]. If this is [Empowered], [Add] [2] instead.
 *
 * Rule 429.2 / 605.2: an activated ability that only [Add]s resources resolves as soon as
 * it is finalized — it never becomes a chain item and opponents get no window to respond.
 * The "…[Add] 2 instead" rider makes the effect a `conditional` wrapping two Adds; it is
 * still only an Add.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-075-166";
const ADD = 2; // #0 enters-exhausted static, #1 the [Empower] ability, #2 the [Add] ability

describe("Platewyrm Egg (ven-075-166)", () => {
  test("the [Add] ability resolves immediately: no chain item, energy is there at once", async () => {
    const game = await scenario().gear(P1, CARD, "egg").build();
    await game.p1.activate("egg", ADD);
    // rule 429.2 — resolved on activation, so no priority pass is needed.
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("egg").isExhausted).toBe(true);
  });

  test("while [Empowered] the same ability adds 2 instead — still off the chain", async () => {
    const game = await scenario().gear(P1, CARD, "egg", { empowered: true }).build();
    await game.p1.activate("egg", ADD);
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.energy()).toBe(2);
  });
});
