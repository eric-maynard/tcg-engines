/**
 * Ruling 3d9f90eb919303cb — Sprite (OGN-274 → ogn-274-298) · 3-Might token · [Temporary]
 *   × Smoke and Mirrors (UNL-083 → unl-083-219) · [Hidden] [Action] "Choose a unit you control and another unit you control
 *     at a different location. If at least one of them has [Temporary], move each to the other's location. Draw 1."
 *   × Lillia, Fae Fawn (unl-082-219) — the mover ("When I move from a location, play a Sprite token there").
 *
 * Q: Smoke and Mirrors is hidden at battlefield B where I have a Sprite. I move Lillia to battlefield A and a showdown
 *    starts. May I react with the hidden Smoke and Mirrors to swap the Sprite (B) with Lillia (A)?
 * A: Yes. Its "another unit at a different location" can never be met by units at the hidden battlefield alone, so it
 *    may pick one unit at B plus one elsewhere (exception to the hidden-targeting restriction). Hidden ⇒ Reaction, and a
 *    hidden card may be played during a showdown at another battlefield. Sprite has Temporary → Lillia goes to B, the
 *    Sprite to A, and the showdown at A continues with the Sprite. One of the two units MUST be at B.
 * Rules: 811.6 (hidden cards gain Reaction), 811.1.d.2 (hidden targeting "here" restriction and its exception), 341.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const SMOKE_AND_MIRRORS = "unl-083-219";
const LILLIA_FAE_FAWN = "unl-082-219";

/**
 * Turn 3, P1's turn, empty pool. Battlefield A: P2's with a 2-Might Guard. Battlefield B: P1's, holding a Sprite token,
 * with Smoke and Mirrors facedown there (hidden on an earlier turn). Lillia (3) and a 1-Might Homebody are in P1's base.
 */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P1 })
    .unit(P2, "bfA", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "bfB", SPRITE, "sprite")
    .unit(P1, "base", LILLIA_FAE_FAWN, "lillia")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
    .facedown(P1, "bfB", SMOKE_AND_MIRRORS, "snm");
}

/** Lillia moves base → A (her move trigger drops a Sprite in base and resolves); the combat showdown at A is open with P1 on Focus. */
async function showdownAtA(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("lillia", "bfA");
  while (game.decision()?.kind === "action" && game.chain().length > 0) {
    await game.acting().passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // Lillia applied Contested → P1 has Focus
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bfA" });
  expect(game.chain()).toEqual([]); // Open state
  expect(game.locationOf("lillia")).toBe("bfA");
  expect(game.locationOf("sprite")).toBe("bfB");
  expect(game.state("sprite").keywords).toContain("Temporary");
  expect(game.zoneOf("snm")).toBe("facedown-bfB");
  return game;
}

describe("Ruling 3d9f90eb919303cb — hidden Smoke and Mirrors at B swaps the Sprite there with Lillia in the showdown at A", () => {
  test("premise: after Lillia's move the showdown at A is open, P1 (attacker) has Focus, the Temporary Sprite sits at B under the facedown Smoke and Mirrors", async () => {
    await showdownAtA();
  });

  // Expected: the facedown Smoke and Mirrors is playable now (Reaction, other battlefield's showdown) for 0, offering
  // only pairs that include a unit at B — {sprite, lillia} / {sprite, home} / {sprite, new Sprite in base} — and never
  // a pair with no unit at B (e.g. {lillia, home}). Choosing {sprite, lillia} swaps them and draws 1; the showdown at A
  // goes on with the Sprite as P1's unit there.
  // Actual: `reveal snm` is not a legal action at all — the engine applies the plain hidden-targeting restriction, which
  // this card's "different location" requirement can never satisfy, so it can never be played from facedown.
  test("ruling 3d9f90eb919303cb — engine never lets a facedown Smoke and Mirrors be played; expected reveal for 0 choosing {Sprite@B, Lillia@A}, swap, draw 1, showdown continues (811.6, 811.1.d.2)", async () => {
    const game = await showdownAtA();
    expect(game.p1.can("reveal", "snm")).toBe(true);
    const pairs = (game.p1.option("reveal", "snm")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(pairs.some((p) => p.includes("sprite") && p.includes("lillia"))).toBe(true);
    // "You must choose one unit at B": no offered pair lacks the unit at the hidden battlefield.
    expect(pairs.every((p) => p.includes("sprite"))).toBe(true);
    const hand = game.p1.hand().length;
    await game.p1.reveal("snm", { targets: ["sprite", "lillia"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played from hidden for [0]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snm", controller: P1 })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("snm")).toBe("trash");
    expect(game.locationOf("lillia")).toBe("bfB");
    expect(game.locationOf("sprite")).toBe("bfA");
    expect(game.p1.hand()).toHaveLength(hand + 1); // Draw 1
    // The showdown at A continues, now with the Sprite as P1's unit there.
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bfA" });
    expect(game.p1.units("bfA")).toContain("sprite");
    expect(game.p1.units("bfA")).not.toContain("lillia");
  });

  test("control: the same swap cast from HAND in that showdown is legal and works — {sprite, lillia} is an offered pair, they trade places, P1 draws 1", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bfA", { controller: P2 })
      .battlefield("bfB", { controller: P1 })
      .unit(P2, "bfA", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "bfB", SPRITE, "sprite")
      .unit(P1, "base", LILLIA_FAE_FAWN, "lillia")
      .hand(P1, SMOKE_AND_MIRRORS, "snm")
      .build();
    await game.p1.move("lillia", "bfA");
    while (game.decision()?.kind === "action" && game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    const pairs = (game.p1.option("cast", "snm")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(pairs.some((p) => p.includes("sprite") && p.includes("lillia"))).toBe(true);
    const hand = game.p1.hand().length; // includes snm itself
    await game.p1.cast("snm", { targets: ["sprite", "lillia"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("lillia")).toBe("bfB");
    expect(game.locationOf("sprite")).toBe("bfA");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfA" });
  });
});
