/**
 * Ruling 4ee96761941c55b7 — Bellows Breath (SFD-080 → sfd-080-221) · Action · [1][mind] "Deal 1 to up to three units at the same location."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · [2] "Move up to 2 friendly units to base."
 *
 * Q: My 2 units at a battlefield are targeted by Bellows Breath; I Flash both back to base in response. Do they still take damage?
 * A: Yes. Bellows Breath targets the units, not the location; "same location" is checked when the spell is played. At resolution
 *    it follows the units wherever they are (and they are still together, in base), so each takes 1.
 * Rules: 355.5 (targeting requirements checked on play), 355.11 (targets tracked to resolution), 359.3.f.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const FLASH = "ogs-011-024";

/** P1's turn. P2 holds bf1 with Twin A and Twin B (3 Might each) and has Flash + [2]. P1: Bellows Breath + exactly [1][mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { mind: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Twin A" }, "twinA")
    .unit(P2, "bf1", { might: 3, name: "Twin B" }, "twinB")
    .hand(P1, BELLOWS_BREATH, "bellows")
    .hand(P2, FLASH, "flash");
}

async function bellowsThenFlash(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bellows", { targets: ["twinA", "twinB"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bellows", controller: P1 })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: ["twinA", "twinB"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bellows", "flash"]);
  return game;
}

describe("Ruling 4ee96761941c55b7 — Flashing Bellows Breath's targets to base does not dodge the damage", () => {
  test("Flash resolves first (LIFO): both Twins are in P2's base while Bellows Breath is still on the chain", async () => {
    const game = await bellowsThenFlash();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("twinA")).toBe("base");
    expect(game.locationOf("twinB")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bellows"]);
    expect(game.state("twinA").damage).toBe(0);
  });

  test("Bellows Breath then resolves onto the same two units in base: each takes 1", async () => {
    const game = await bellowsThenFlash();
    await game.settle();
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.state("twinA")).toMatchObject({ damage: 1, location: "base" });
    expect(game.state("twinB")).toMatchObject({ damage: 1, location: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
