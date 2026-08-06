/**
 * The Ruination — unl-180-219 · Spell · Order · 9 energy + 3 [order]
 *
 *   Kill all units.
 *
 * Rule 186.1 — a token sent to a non-board zone ceases to exist.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const THE_RUINATION = "unl-180-219";
const SPRITE_FOUNTAIN = "unl-078-219";

describe("The Ruination (unl-180-219)", () => {
  test("kills all units; killed unit tokens cease to exist instead of going to trash (rule 186.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 11, power: { mind: 1, order: 3 } })
      .unit(P2, "base", { might: 4 }, "enemy")
      .hand(P1, SPRITE_FOUNTAIN, "fountain")
      .hand(P1, THE_RUINATION, "ruin")
      .build();

    await game.p1.playGear("fountain");
    await game.settle();
    const sprites = game.p1.base().filter((id) => id.startsWith("token-sprite-"));
    expect(sprites).toHaveLength(1);
    const sprite = sprites[0] as string;

    await game.p1.cast("ruin");
    await game.settle();

    expect(game.zoneOf("enemy")).toBe("trash");
    expect(game.has(sprite)).toBe(false);
    expect(game.p1.trash().some((id) => id.startsWith("token-"))).toBe(false);
  });
});
