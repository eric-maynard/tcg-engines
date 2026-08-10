/**
 * Ruling 9f68554bb89aa003 — Sprite Call (OGN-094 → ogn-094-298) · [3][mind] [Hidden] [Action]
 *     "Play a ready 3 Might Sprite unit token with [Temporary]."   × Sprite token (OGN-274 → ogn-274-298)
 *   (+ Pakaa Cub OGN-135 → ogn-135-298, a vanilla [Hidden] unit, for the "revealed from hidden" case.)
 *
 * Q: When a hidden card is revealed or a unit is played, does it enter ready or exhausted?
 * A: Units enter exhausted by default, whether played from hand or played by revealing a hidden card (revealing IS
 *    playing). Card text overrides: Sprite Call says "ready", so the Sprite token enters ready.
 * Rules: 140.3 / 356 (units enter the board exhausted), 811 (playing a Hidden card from facedown is playing it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";
const PAKAA_CUB = "ogn-135-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit

function sprites(game: Game): string[] {
  return game.findAll({ name: "Sprite", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");
}

/** Pass the spell through and answer the token's destination prompt (if the engine asks) with `where`. */
async function resolveCall(game: Game, where: string): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(where);
      break;
    }
    if (d?.kind === "action" && d.context !== "main") {
      await game.acting().pass();
      continue;
    }
    break;
  }
  await game.settle();
}

describe("Ruling 9f68554bb89aa003 — units enter exhausted by default; Sprite Call's token enters ready because it says so", () => {
  test("default: a unit played from hand enters the board EXHAUSTED", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).hand(P1, SKULKER, "skulker").build();
    await game.p1.play("skulker");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.state("skulker").isExhausted).toBe(true);
  });

  test("default applies to Hidden too: a facedown Pakaa Cub revealed (= played) at its battlefield enters EXHAUSTED", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .facedown(P1, "bf1", PAKAA_CUB, "cub")
      .build();
    expect(game.p1.can("reveal", "cub")).toBe(true);
    await game.p1.reveal("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
    expect(game.state("cub").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0); // played for [0] from facedown
  });

  test("override: Sprite Call (from hand) plays a 3-Might Sprite token that enters READY, with [Temporary]", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, SPRITE_CALL, "call").build();
    await game.p1.cast("call");
    await resolveCall(game, "base");
    expect(game.zoneOf("call")).toBe("trash");
    const made = sprites(game);
    expect(made).toHaveLength(1);
    expect(game.locationOf(made[0]!)).toBe("base");
    const sprite = game.state(made[0]!);
    expect(sprite).toMatchObject({ isExhausted: false, isReady: true, isToken: true, might: 3 });
    expect(sprite.keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });

  test("override holds when Sprite Call itself is revealed from facedown: the token still enters READY (here, at that battlefield)", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .facedown(P1, "bf1", SPRITE_CALL, "call")
      .unit(P2, "base", { might: 1 }, "bystander")
      .build();
    await game.p1.reveal("call");
    await resolveCall(game, "battlefield-bf1");
    expect(game.zoneOf("call")).toBe("trash");
    const made = sprites(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0]!)).toMatchObject({ isReady: true, isToken: true, might: 3 });
  });
});
