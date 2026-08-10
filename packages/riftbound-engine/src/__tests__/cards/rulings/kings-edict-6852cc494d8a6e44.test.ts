/**
 * Ruling 6852cc494d8a6e44 — King's Edict (OGN-237 → ogn-237-298) · [6][order][order] "Starting with the next player, each other
 *     player chooses a unit you don't control that hasn't been chosen for this spell. Kill those units."
 *   × Not So Fast (SFD-045 → sfd-045-221) · Reaction [2][calm] "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Q: If I play King's Edict, can my opponent Not So Fast it?
 * A: No. King's Edict chooses/targets nothing when played — the choices are made by the OTHER players during resolution — so it
 *    is not "a spell that chooses a friendly unit"; Not So Fast has no legal target and can't be played. Edict resolves.
 * Rules: 355 (targets are play-time choices), 355.16 (choices made on resolution are not targets), 355.9 (needs a legal target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KINGS_EDICT = "ogn-237-298";
const NOT_SO_FAST = "sfd-045-221";

/** P1's turn with exactly [6][order][order]. P2 has two units (Big 5, Small 1), Not So Fast in hand and [2][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 2 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .unit(P2, "base", { might: 1, name: "Small" }, "small")
    .hand(P1, KINGS_EDICT, "edict")
    .hand(P2, NOT_SO_FAST, "nsf");
}

async function edictOnChain(): Promise<Game> {
  const game = await board().build();
  // Nothing is chosen at play time: no `targets` field is even offered.
  expect(game.p1.option("cast", "edict")?.fields.some((f) => f.name === "targets")).toBe(false);
  await game.p1.cast("edict");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "edict", controller: P1 })]);
  expect(game.chain()[0]?.targets ?? []).toEqual([]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 6852cc494d8a6e44 — Not So Fast can't counter King's Edict (it chooses nothing when played)", () => {
  test("King's Edict is played with NO targets; P2 gets priority but Not So Fast is not playable against it (forced attempt rejected, [2][calm] kept)", async () => {
    const game = await edictOnChain();
    expect(game.p2.can("cast", "nsf")).toBe(false);
    const r = await game.p2.try((p) => p.cast("nsf", { targets: "edict" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    expect(game.chain()).toHaveLength(1);
  });

  test("so King's Edict resolves: P2 (the next/other player) is the one asked to CHOOSE a unit P1 doesn't control — at resolution — and that unit is killed", async () => {
    const game = await edictOnChain();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["big", "small"]);
    await game.p2.pick("small");
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("edict")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Not So Fast IS live against an enemy spell that DOES choose P2's unit at play time", async () => {
    const POKE = {
      abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "order",
      energyCost: 0,
      name: "Poke",
      timing: "action",
    } as const;
    const game = await board().hand(P1, POKE, "poke").build();
    await game.p1.cast("poke", { targets: "big" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    await game.p2.cast("nsf", { targets: "poke" });
    await game.settle();
    expect(game.state("big").damage).toBe(0);
    expect(game.zoneOf("poke")).toBe("trash");
  });
});
