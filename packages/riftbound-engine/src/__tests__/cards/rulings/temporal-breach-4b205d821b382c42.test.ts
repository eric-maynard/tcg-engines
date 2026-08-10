/**
 * Ruling 4b205d821b382c42 — Temporal Breach (VEN-066 → ven-066-166) · Spell · Mind · [2][mind] · [Hidden]
 *     "Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *   × Rockfall Path (SFD-216 → sfd-216-221) · Battlefield · "Units can't be played here."
 *
 * Q: What happens when Temporal Breach hits a unit standing at Rockfall Path?
 * A: The banish executes; "its owner plays it to the same location" cannot be followed (units can't be played at
 *    Rockfall Path) and is ignored — so the unit is banished for good and never returns. A token additionally ceases
 *    to exist on entering Banishment; a card just stays in its owner's banishment.
 * Rules: 359.3.e.6 (impossible instruction ignored, rest of the spell stands), 183.1 / 186.1 (token off the board
 *        ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166";
const ROCKFALL_PATH = "sfd-216-221";
const SKULKER = "ogn-175-298"; // vanilla 3-cost 3-Might unit CARD
const SPRITE = "ogn-274-298"; // 3-Might unit TOKEN

/**
 * P1's turn with exactly [2][mind]. bf1 is Rockfall Path (live text) when `rockfall`, else inert; P2's `victimDef` unit
 * (1 damage marked) stands there next to a Holder so bf1 never empties. P2 has no resources (the replay ignores cost).
 */
function board(rockfall: boolean, victimDef: string) {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", rockfall ? { controller: P2, def: ROCKFALL_PATH, inert: false } : { controller: P2 })
    .unit(P2, "bf1", victimDef, "victim", { damage: 1 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, TEMPORAL_BREACH, "breach");
}

async function breach(game: Game): Promise<void> {
  expect(game.p1.can("cast", "breach")).toBe(true);
  await game.p1.cast("breach", { targets: "victim" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "breach", targets: ["victim"] })]);
  await game.settle({ policy: "first" }); // any forced replay step for P2 is taken
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("breach")).toBe("trash");
}

describe("Ruling 4b205d821b382c42 — Temporal Breach on a unit at Rockfall Path banishes it permanently", () => {
  test("premise: Rockfall Path is not a legal place to play a unit to", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3 })
      .battlefield("bf1", { controller: P2, def: ROCKFALL_PATH, inert: false })
      .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P2, SKULKER, "fresh")
      .build();
    const dests = game.p2.option("play", "fresh")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(dests).toContain("base");
    expect(dests).not.toContain("battlefield-bf1");
    expect((await game.p2.try((p) => p.play("fresh", { to: "bf1" }))).ok).toBe(false);
  });

  test("a unit CARD at Rockfall Path: step 1 (banish) executes, step 2 (owner replays it here) is impossible and ignored — it stays in P2's banishment, off the board, nothing paid", async () => {
    const game = await board(true, SKULKER).build();
    await breach(game);
    expect(game.zoneOf("victim")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["victim"]);
    expect(game.p2.units().toSorted()).toEqual(["holder"]);
    expect(game.p2.hand()).not.toContain("victim");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // Holder still there
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("a unit TOKEN at Rockfall Path: banished → it ceases to exist altogether (nothing in banishment, nothing replayed)", async () => {
    const game = await board(true, SPRITE).build();
    expect(game.state("victim").isToken).toBe(true);
    await breach(game);
    expect(game.zoneOf("victim")).toBe("gone");
    expect(game.has("victim")).toBe(false);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.units().toSorted()).toEqual(["holder"]);
    expect(game.violations()).toEqual([]);
  });

  test("control (ordinary battlefield): the same card is banished and immediately replayed to bf1 by its owner for free, coming back as a fresh object (damage gone)", async () => {
    const game = await board(false, SKULKER).build();
    await breach(game);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim").damage).toBe(0);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });
});
