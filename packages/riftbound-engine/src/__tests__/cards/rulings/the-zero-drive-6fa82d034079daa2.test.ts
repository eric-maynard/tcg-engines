/**
 * Ruling 6fa82d034079daa2 — The Zero Drive (SFD-090 → sfd-090-221) · Equipment · +2
 *     "[3][mind], Banish this: Play all units banished with this, ignoring their costs. [Deathknell] — Banish me."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) "Your [Deathknell] effects trigger an additional time."
 *   (× Ekko, Recurrent OGN-110 mentioned as an analogous case.)
 *
 * Q: With Karthus in play the Zero Drive Deathknell triggers twice — can the Drive later play TWO copies of the unit?
 * A: No. Both banish triggers go on the chain; the first banishes the dead unit from the trash; the second whiffs
 *    because the unit was already moved. "Banished by this" is binary; only ONE copy is played later.
 * Rules: 808 (Deathknell), 428 (kill → trash), 340 (LIFO), 124 (zone change → new object; the second trigger can no
 *        longer find it), 383.3.d (one controller orders simultaneous triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZERO_DRIVE = "sfd-090-221";
const KARTHUS = "ogn-236-298";
/** P1's plain kill spell so the wearer dies on P1's own turn (the Drive is activated later the same turn). */
const CULL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Cull",
  timing: "action",
} as const;

/** P1's turn. Karthus in base; a vanilla Squire (2) wears The Zero Drive; P1 has 1 (Cull) + 3+[mind] (Drive). */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .unit(P1, "base", KARTHUS, "karthus")
    .unit(P1, "base", { energyCost: 2, might: 2, name: "Squire" }, "squire", { equippedWith: ["zd"] })
    .gear(P1, ZERO_DRIVE, "zd", { attachedTo: "squire" })
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, CULL, "cull");
}

async function killSquire(): Promise<Game> {
  const game = await board().build();
  expect(game.state("squire")).toMatchObject({ attachments: ["zd"], might: 4 });
  await game.p1.cast("cull", { targets: "squire" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Cull resolves → Squire dies
  return game;
}

describe("Ruling 6fa82d034079daa2 — Karthus doubles Zero Drive's Deathknell but only one banish 'sticks'; the Drive replays ONE unit", () => {
  test("Squire dies beside Karthus: the Drive-granted Deathknell is on the chain TWICE while the Squire sits in the trash", async () => {
    const game = await killSquire();
    // Two identical triggers of one controller — nothing to order; straight to the chain priority window.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("squire")).toBe("trash");
    const triggers = game.chain().filter((c) => c.cardId === "squire" && c.triggered);
    expect(triggers).toHaveLength(2);
  });

  test("first trigger banishes the Squire from the trash; the second resolves to no effect — exactly one Squire in banishment, nothing else moved", async () => {
    const game = await killSquire();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("squire")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["squire"]);
    expect(game.p1.trash()).toEqual(["cull"]);
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("later: [3][mind], Banish the Drive → plays the units 'banished with this' — ONE Squire enters the board, not two", async () => {
    const game = await killSquire();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } });
    const unitsBefore = game.p1.units();
    expect(unitsBefore).toEqual(["karthus"]);
    await game.p1.activate("zd", 1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zd", triggered: false })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("zd")).toBe("banishment");
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.p1.units().sort()).toEqual(["karthus", "squire"]);
    expect(game.p1.units()).toHaveLength(2); // one copy only
    expect(game.p1.banishment()).toEqual(["zd"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // Squire itself was free
    expect(game.violations()).toEqual([]);
  });
});
