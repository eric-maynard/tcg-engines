/**
 * Ruling df855b3971a2d0aa — Mageseeker Warden (OGN-070 → ogn-070-298) · Unit · Calm · 6+[calm] · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base.
 *      While I'm at a battlefield, spells and abilities can't ready enemy units and gear."
 *   × Sprite Mother (ogn-106-298) "When you play me, play a ready 3 [Might] Sprite unit token with [Temporary] here."
 *   × Sprite token (ogn-274-298) · × Thousand-Tailed Watcher (ogn-116-298) "[Accelerate] … enter ready"
 *   × Darius, Trifarian (ogn-027-298) "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: Does the Warden stop Accelerated units / ready Sprite tokens from entering ready, or Thousand-Tailed Watcher?
 * A: No. Entering the board ready is not "readying" an exhausted permanent; Sprite tokens and Accelerated units enter
 *    ready and are unaffected. Darius, Trifarian is different: his ability explicitly readies him, which the Warden stops.
 * Rules: 140.2 (enter ready vs. become ready), 729 (Accelerate), 417 (Ready action), Warden's static restriction.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARDEN = "ogn-070-298";
const SPRITE_MOTHER = "ogn-106-298";
const WATCHER = "ogn-116-298";
const DARIUS = "ogn-027-298";
const CHEAP = "ogn-175-298"; // Shipyard Skulker, a plain unit — the "first card" for Darius

/** P1's turn. P2 holds bf1 with Mageseeker Warden AT A BATTLEFIELD (both statics on). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", WARDEN, "warden")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder");
}

const tokens = (game: Game) => game.p1.units().filter((id) => game.state(id).isToken);

describe("Ruling df855b3971a2d0aa — Mageseeker Warden does not stop units ENTERING ready", () => {
  test("Warden's first clause is live (sanity): P1 may only play Sprite Mother to base — bf2 (P1's own battlefield) is not offered", async () => {
    const game = await board().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, SPRITE_MOTHER, "mother").build();
    const to = game.p1.option("play", "mother")?.fields.find((f) => f.name === "location" || f.arg === "to");
    const offered = (to?.options ?? ["base"]) as string[];
    expect(offered.every((o) => o === "base")).toBe(true);
    expect((await game.p1.try((p) => p.play("mother", { to: "bf2" }))).ok).toBe(false);
  });

  test("Sprite Mother (to base): her Sprite token is PLAYED READY and stays ready — the Warden's 'can't ready enemy units' never applies to entering ready", async () => {
    const game = await board().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, SPRITE_MOTHER, "mother").build();
    await game.p1.play("mother", { to: "base" });
    await game.settle();
    expect(game.zoneOf("mother")).toBe("base");
    expect(game.state("mother").isExhausted).toBe(true); // the Mother herself was not accelerated
    const toks = tokens(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ isReady: true, might: 3, name: "Sprite" });
    expect(game.state(toks[0] as string).keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });

  test("Thousand-Tailed Watcher with Accelerate paid ([7][mind] + [1][mind]) enters READY opposite the Warden — there is never a moment it is exhausted", async () => {
    const game = await board().resources(P1, { energy: 8, power: { mind: 2 } }).hand(P1, WATCHER, "watcher").build();
    await game.p1.play("watcher", { accelerate: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("watcher")).toMatchObject({ isReady: true, zone: "base" });
    await game.settle();
    expect(game.state("watcher")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.state("warden").might).toBe(2); // the Watcher's own play effect (-3, min 1) still works: 5 → 2
  });

  test("contrast — Darius, Trifarian explicitly 'readies' himself: as P1's second card of the turn resolves his trigger gives +2 [Might] but the READY is stopped by the Warden (he stays exhausted)", async () => {
    const game = await board()
      .resources(P1, { energy: 8, power: { mind: 1 } })
      .unit(P1, "base", DARIUS, "darius", { exhausted: true })
      .hand(P1, CHEAP, "first")
      .hand(P1, SPRITE_MOTHER, "second")
      .build();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.play("first", { to: "base" });
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 }); // first card: nothing
    await game.p1.play("second", { to: "base" });
    await game.settle();
    expect(game.state("darius").might).toBe(7); // +2 this turn landed
    expect(game.state("darius").isExhausted).toBe(true); // …but "ready me" was prevented by the Warden
    // The Sprite token from the second card still entered ready.
    const toks = tokens(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string).isReady).toBe(true);
  });

  test("contrast of the contrast — with the Warden NOT at a battlefield (in P2's base) Darius' ready goes through", async () => {
    const game = await scenario()
      .unit(P2, "base", WARDEN, "warden")
      .resources(P1, { energy: 8, power: { mind: 1 } })
      .unit(P1, "base", DARIUS, "darius", { exhausted: true })
      .hand(P1, CHEAP, "first")
      .hand(P1, SPRITE_MOTHER, "second")
      .build();
    await game.p1.play("first", { to: "base" });
    await game.settle();
    await game.p1.play("second", { to: "base" });
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });
});
