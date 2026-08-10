/**
 * Ruling e4d3b4202b719f0d — Reflection token (UNL-T06 → unl-t06) · unit token · 0 Might
 *     "(I become a copy of something when played. I don't get that card's play effects.)"
 *   × Sprite token (OGN-274 → ogn-274-298) · 3 Might · "[Temporary]"
 *   × Mirror Image (UNL-200 → unl-200-219) "Choose a unit. Play a ready Reflection unit token to your base. It becomes a
 *     copy of that unit. Give it [Temporary]."   × Deceiver (UNL-199 → unl-199-219) legend (same templating).
 *
 * Q: Does a Reflection token have Temporary by itself, if it doesn't copy anything?
 * A: No. The Reflection token's identity is just "domainless 0-Might unit token" — no Temporary (unlike Sprite, whose
 *    identity lists Temporary). Temporary comes only from the creating effect ("Give it [Temporary]"); if the copy part
 *    fails (no valid target) the grant still resolves — but as a GRANT, not a printed keyword.
 * Rules: 184.2 (Sprite) vs 184.6 (Reflection) token identities, 359.3.e.5 (illegal target ⇒ only that instruction skipped),
 *        816 Temporary.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../../harness";

const REFLECTION = "unl-t06";
const SPRITE = "ogn-274-298";
const MIRROR_IMAGE = "unl-200-219";
const GUST = "ogn-169-298";

const reflectionOf = (game: Game) => game.p1.units().find((u) => game.state(u).isToken);

describe("Ruling e4d3b4202b719f0d — a Reflection token has no inherent [Temporary]; the creating effect grants it", () => {
  test("token identities: Sprite's definition lists Temporary; Reflection's is a 0-Might unit token with NO keywords", async () => {
    const pool = await loadDefaultCardPool();
    const sprite = pool.get(SPRITE);
    const reflection = pool.get(REFLECTION);
    expect(sprite).toMatchObject({ cardType: "unit", might: 3 });
    const printedKeywords = (def: typeof sprite) => [
      ...((def?.keywords ?? []) as string[]),
      ...((def?.abilities ?? []) as { type?: string; keyword?: string }[]).filter((a) => a.type === "keyword").map((a) => a.keyword ?? ""),
    ];
    expect(printedKeywords(sprite)).toContain("Temporary");
    expect(reflection).toMatchObject({ cardType: "unit", might: 0 });
    expect(printedKeywords(reflection)).not.toContain("Temporary");
    // A bare Reflection placed on the board (no creating effect) carries no Temporary either.
    const game = await scenario().unit(P1, "base", REFLECTION, "refl").unit(P1, "base", SPRITE, "sprite").build();
    expect(game.state("refl")).toMatchObject({ might: 0 });
    expect(game.state("refl").keywords).not.toContain("Temporary");
    expect(game.state("refl").grantedKeywords.map((g) => g.keyword)).not.toContain("Temporary");
    expect(game.state("sprite").keywords).toContain("Temporary");
    expect(game.state("sprite").grantedKeywords).toEqual([]); // printed, not granted
  });

  test("Mirror Image: the Reflection copies the chosen unit AND is GIVEN Temporary — it shows as a granted keyword, not part of the token's identity", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .unit(P1, "base", "ogn-175-298", "skulker")
      .hand(P1, MIRROR_IMAGE, "mi")
      .build();
    await game.p1.cast("mi", { targets: "skulker" });
    await game.settle();
    const tok = reflectionOf(game);
    expect(tok).toBeDefined();
    expect(game.state(tok!)).toMatchObject({ isToken: true, might: 3, name: "Shipyard Skulker" });
    expect(game.state(tok!).keywords).toContain("Temporary");
    expect(game.state(tok!).grantedKeywords.map((g) => g.keyword)).toContain("Temporary");
  });

  test("copy fails (the chosen unit is Gusted away in response): the Reflection is still played as a plain 0-Might token and STILL receives the granted Temporary — and dies to it at P1's next Beginning Phase", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .unit(P1, "bf1", { might: 5, name: "Anchor" }, "anchor")
      .hand(P1, MIRROR_IMAGE, "mi")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.cast("mi", { targets: "scout" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("mi")).toBe("trash");
    const tok = reflectionOf(game);
    expect(tok).toBeDefined();
    expect(game.state(tok!)).toMatchObject({ isToken: true, location: "base", might: 0 });
    expect(game.state(tok!).name).not.toBe("Scout"); // nothing was copied
    expect(game.state(tok!).keywords).toContain("Temporary"); // … yet "Give it [Temporary]" still resolved
    // Temporary does its job at the start of P1's next turn.
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: Temporary kills it in the Beginning Phase
    expect(game.has(tok!)).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
