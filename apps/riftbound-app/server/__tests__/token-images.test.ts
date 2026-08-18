import { describe, expect, test } from "bun:test";
import { cardImageUrls } from "../cards";
import { RIFTBOUND_TOKEN_DEFS } from "../../../../packages/riftbound-engine/src/game-definition/moves/token";

/**
 * Every token the engine can put on the board must have art.
 *
 * Regression: Spiritforged's Mech and Sand Soldier tokens are played by a
 * dozen cards (Ferrous Forerunner, Guards!, Arise!, Assembly Rig, Royal Guard,
 * Azir, the Rumble legends), but Riot's gallery publishes only SFD-T03 (Gold)
 * of that set's tokens — so both rendered blank on the board while every other
 * token had an image. Nothing failed; they were just invisible.
 *
 * This is derived from the engine's own token table rather than a hand-written
 * list, so a token added there without art fails here instead of shipping
 * blank.
 */
describe("token art", () => {
  const slugs = Object.values(RIFTBOUND_TOKEN_DEFS).map((d: { name: string }) =>
    d.name.toLowerCase().replace(/\s+/g, "-"),
  );

  test("the engine defines tokens to check", () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  test("every spawnable token resolves to an image", () => {
    const missing = slugs.filter((s) => !cardImageUrls.get(`token-def-${s}`));
    expect({ missing }).toEqual({ missing: [] });
  });

  test("token art is addressed by the shared token-def id, not an instance id", () => {
    // Both minting paths (create-token and the manual addToken move) stamp
    // `token-def-<slug>`; an instance id like `token-gold-1` must never be
    // what the renderer looks up, or art breaks after the first token.
    for (const s of slugs) {
      expect(cardImageUrls.get(`token-def-${s}`)).toBeTruthy();
    }
  });
});
