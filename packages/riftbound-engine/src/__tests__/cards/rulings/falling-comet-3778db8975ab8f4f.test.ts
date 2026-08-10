/**
 * Ruling 3778db8975ab8f4f — Falling Comet (OGN-085 → ogn-085-298) · Action · [5] · "Deal 6 to a unit at a battlefield."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · [2] · "Move up to 2 friendly units to base."
 *
 * Q: Opponent plays Falling Comet on my unit at a battlefield; I Flash it back to base in response. Does it still die,
 *    having already been targeted?
 * A: No. Target legality is re-checked when the spell resolves; a unit no longer at a battlefield is not a legal
 *    "unit at a battlefield", so Falling Comet does nothing to it.
 * Rules: 359.3.f.2 (targets re-verified on resolution; illegal → unaffected), 340 (LIFO: Flash resolves first), 445 (move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_COMET = "ogn-085-298";
const FLASH = "ogs-011-024";

/** P1's turn with exactly [5]. P2 holds bf1 with a 3-Might Scout and has Flash + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout")
    .hand(P1, FALLING_COMET, "comet")
    .hand(P2, FLASH, "flash");
}

/** P1 casts Falling Comet on the Scout and passes; P2 answers with Flash moving the Scout home. */
async function cometThenFlash(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("comet", { targets: "scout" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "comet", controller: P1, targets: ["scout"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: ["scout"] });
  expect(game.p2.energy()).toBe(0);
  return game;
}

describe("Ruling 3778db8975ab8f4f — Flash the target home: Falling Comet re-checks legality on resolution and does nothing", () => {
  test("steps 1–2: Comet (targeting the Scout at bf1) sits below Flash on the chain", async () => {
    const game = await cometThenFlash();
    expect(game.chain().map((c) => `${c.cardId}/${c.controller}`)).toEqual([`comet/${P1}`, `flash/${P2}`]);
    expect(game.locationOf("scout")).toBe("bf1"); // nothing has resolved yet
  });

  test("LIFO: Flash resolves first — the Scout is in P2's base while Comet is still waiting on the chain", async () => {
    const game = await cometThenFlash();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.locationOf("scout")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["comet"]);
    expect(game.state("scout").damage).toBe(0);
  });

  test("steps 3–4: Comet then resolves against a unit that is no longer 'at a battlefield' — illegal target, no damage; the Scout lives undamaged in base and Comet just goes to the trash", async () => {
    const game = await cometThenFlash();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout")).toMatchObject({ damage: 0, location: "base", might: 3 });
    expect(game.p2.trash()).not.toContain("scout");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: un-Flashed, the same Comet deals 6 and kills the 3-Might Scout", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
  });
});
