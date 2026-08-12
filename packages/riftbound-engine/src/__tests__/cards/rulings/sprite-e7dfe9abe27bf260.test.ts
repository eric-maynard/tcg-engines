/**
 * Ruling e7dfe9abe27bf260 — Sprite (OGN-274 → ogn-274-298, the token) · 3 Might · [Temporary]
 *   created by Lillia, Fae Fawn (UNL-082 → unl-082-219) · 3 Might
 *   "When I move from a location, play a 3 [Might] Sprite unit token with [Temporary] there."
 *
 * Q: If Lillia moves from my base to a battlefield, where does the Sprite token appear?
 * A: At the location Lillia moved FROM — the base. The trigger notes the origin location when it is put on
 *    the chain, so "there" is the place she left, not the place she arrived at.
 * Rules: 359.3.f.3 (a trigger referencing a location moved from notes it when the ability is placed on the
 *        chain), 383 (triggered abilities), 355.4 (the move itself is complete before the trigger resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LILLIA = "unl-082-219";

const spriteOf = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  game.findAll({ name: "Sprite" }).filter((id) => game.has(id));

describe("Ruling e7dfe9abe27bf260 — Lillia's Sprite spawns at the location she LEFT", () => {
  test("base → battlefield: Lillia ends at bf1 and the Sprite is left behind in P1's base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", LILLIA, "lillia")
      .build();
    await game.p1.move("lillia", "bf1");
    await game.settle();
    expect(game.locationOf("lillia")).toBe("bf1");
    const sprites = spriteOf(game);
    expect(sprites).toHaveLength(1);
    const sprite = sprites[0]!;
    expect(game.locationOf(sprite)).toBe("base");
    expect(game.zoneOf(sprite)).toBe("base");
    expect(game.state(sprite)).toMatchObject({ controller: P1, might: 3 });
    expect(game.state(sprite).keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });

  test("mirror case — battlefield → base: the Sprite is left at the battlefield she left", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LILLIA, "lillia")
      .build();
    await game.p1.move("lillia", "base");
    await game.settle();
    expect(game.locationOf("lillia")).toBe("base");
    const sprites = spriteOf(game);
    expect(sprites).toHaveLength(1);
    expect(game.locationOf(sprites[0]!)).toBe("bf1");
  });

  test("the token is [Temporary]: it dies at the start of its controller's next Beginning Phase", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", LILLIA, "lillia")
      .build();
    await game.p1.move("lillia", "bf1");
    await game.settle();
    const sprite = spriteOf(game)[0]!;
    expect(game.zoneOf(sprite)).toBe("base");
    await game.advanceTurn(); // → P2's turn
    expect(game.has(sprite)).toBe(true);
    await game.advanceTurn(); // → P1's Beginning Phase
    expect(game.zoneOf(sprite)).toBe("gone"); // a token that leaves the board ceases to exist
  });

  test("control: with no move there is no Sprite at all", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", LILLIA, "lillia")
      .build();
    expect(spriteOf(game)).toEqual([]);
  });
});
