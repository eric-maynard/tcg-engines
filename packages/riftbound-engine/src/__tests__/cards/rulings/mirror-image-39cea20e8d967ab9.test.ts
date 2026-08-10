/**
 * Ruling 39cea20e8d967ab9 — Mirror Image (UNL-200 → unl-200-219) · Spell [3][rainbow][rainbow]
 *   "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Sprite token (OGN-274 → ogn-274-298) · 3 Might "[Temporary]"   × Reflection token (unl-t06)
 *
 * Q: Can you Mirror Image a Sprite token?
 * A: Yes — a Sprite token is a unit, so it is a legal choice. The Reflection becomes a copy of it (printed Might and
 *    text) and, having Temporary, is killed at the start of your next Beginning Phase just like the Sprite.
 * Rules: 182.1.d (tokens are units), 477.1.b (copy takes copyable traits), Temporary, 186.1 (tokens that leave the
 *        board cease to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const SPRITE = "ogn-274-298";
const COST = { energy: 3, power: { rainbow: 2 } };

function board() {
  return scenario()
    .resources(P1, COST)
    .unit(P1, "base", SPRITE, "sprite")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, MIRROR_IMAGE, "mirror");
}

function reflectionOf(game: Game): string {
  const found = game.p1.base().find((c) => c !== "sprite" && game.state(c).isToken);
  expect(found).toBeDefined();
  return found as string;
}

describe("Ruling 39cea20e8d967ab9 — Mirror Image can copy a Sprite token", () => {
  test("the Sprite token is a unit and is offered as a legal choice for Mirror Image", async () => {
    const game = await board().build();
    expect(game.state("sprite")).toMatchObject({ cardType: "unit", isToken: true, might: 3 });
    expect(game.p1.can("cast", "mirror")).toBe(true);
    const targets = (game.p1.option("cast", "mirror")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toContain("sprite");
  });

  test("resolving on the Sprite: a ready Reflection token enters P1's base as a copy — name Sprite, 3 Might, with Temporary", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "sprite" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("mirror")).toBe("trash");
    const refl = reflectionOf(game);
    expect(game.state(refl)).toMatchObject({
      controller: P1,
      isReady: true,
      isToken: true,
      location: "base",
      might: 3,
      name: "Sprite",
    });
    expect(game.state(refl).keywords).toContain("Temporary");
    expect(game.state("sprite")).toMatchObject({ might: 3, zone: "base" }); // the original is untouched
    expect(game.violations()).toEqual([]);
  });

  test("Temporary: at the start of P1's next Beginning Phase both the Sprite and its Reflection are killed (tokens cease to exist)", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "sprite" });
    await game.settle();
    const refl = reflectionOf(game);
    await game.advanceTurn(); // → P2
    expect(game.zoneOf(refl)).toBe("base"); // not P1's beginning phase yet
    expect(game.zoneOf("sprite")).toBe("base");
    await game.advanceTurn(); // → P1: Beginning Phase kills Temporary units
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.zoneOf(refl)).toBe("gone");
    expect(game.p1.base()).toEqual([]);
  });
});
