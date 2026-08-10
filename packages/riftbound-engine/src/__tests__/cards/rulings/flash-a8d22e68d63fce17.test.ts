/**
 * Ruling a8d22e68d63fce17 — Flash (OGS-011 → ogs-011-024) · Reaction [2] · "Move up to 2 friendly units to base."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · Action [2][order] · "[Hidden] Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: My unit is targeted by Hidden Blade; I Flash it to base in response. Do I still draw 2?
 * A: No. Flash resolves first (LIFO) and the unit is no longer "at a battlefield", so it is an illegal target: the kill fails and
 *    "its controller draws 2" can't identify a controller (null) — no draw.
 * Rules: 331 (LIFO), 359.3.e.5 (illegal/moved target is unaffected), 359.3.e.12 (information about an unavailable target is
 *        null; dependent instructions are ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn: Hidden Blade + [2][order]. P2: 3-Might Runner at P2's bf1, Flash + [2], known deck. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, FLASH, "flash")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P1 Blades the Runner; P2 answers with Flash on the Runner. */
async function bladeThenFlash(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "runner" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["runner"] })]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: ["runner"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
  return game;
}

describe("Ruling a8d22e68d63fce17 — Flash the Hidden Blade target home: no kill, no draw 2", () => {
  test("Flash resolves first: the Runner is in P2's base while Hidden Blade still waits on the chain", async () => {
    const game = await bladeThenFlash();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.state("runner")).toMatchObject({ location: "base", zone: "base" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("ruling: Hidden Blade then resolves against a unit no longer at a battlefield — the Runner lives and P2 draws NOTHING (hand empty, deck untouched)", async () => {
    const game = await bladeThenFlash();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("runner")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p2.trash()).toEqual(["flash"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.hand()).toEqual([]); // and certainly not the caster
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — un-Flashed: Hidden Blade kills the Runner at bf1 and ITS CONTROLLER (P2) draws 2", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["d1", "d2", "flash"]);
  });
});
