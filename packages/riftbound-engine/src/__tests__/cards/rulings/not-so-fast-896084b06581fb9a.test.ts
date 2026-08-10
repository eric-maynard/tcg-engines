/**
 * Ruling 896084b06581fb9a — Not So Fast (SFD-045 → sfd-045-221) · [Reaction] · 2 + [calm]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × King's Edict (OGN-237 → ogn-237-298) · 6 + [order][order] "Starting with the next player, each other player
 *     chooses a unit you don't control that hasn't been chosen for this spell. Kill those units."
 *
 * Q: Does Not So Fast counter King's Edict?
 * A: No. King's Edict targets/chooses nothing when played — the opponents make choices during its RESOLUTION, which
 *    is not the spell "choosing" a unit. So it is not a legal object for Not So Fast; the Edict resolves.
 * Rules: 355 (targets are play-time choices), 355.16 (choices made on resolution are not targets), 355.9.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const KINGS_EDICT = "ogn-237-298";

/** P1's turn with exactly 6 + [order]×2. P2: Big (5) at its bf1, Small (1) in base, Not So Fast + 2 + [calm]. */
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
  // Nothing is chosen at play time: the cast offers no `targets` field at all.
  expect(game.p1.option("cast", "edict")?.fields.some((f) => f.name === "targets") ?? false).toBe(false);
  await game.p1.cast("edict");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "edict", controller: P1 })]);
  expect(game.chain()[0]?.targets ?? []).toEqual([]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 896084b06581fb9a — Not So Fast cannot counter King's Edict", () => {
  test("with King's Edict on the chain (no unit chosen), P2 has priority and the resources but Not So Fast is NOT playable; a forced attempt is rejected and nothing is spent", async () => {
    const game = await edictOnChain();
    expect(game.p2.can("cast", "nsf")).toBe(false);
    const r = await game.p2.try((p) => p.cast("nsf", { targets: "edict" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["edict"]);
  });

  test("King's Edict resolves: only THEN is P2 asked to choose a unit P1 doesn't control (a resolution-time choice by the opponent, not a target); it dies", async () => {
    const game = await edictOnChain();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["big", "small"]);
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

  test("contrast: Not So Fast IS live against an enemy spell that chooses P2's unit when played (a targeted poke) and counters it", async () => {
    const POKE = {
      abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "order",
      energyCost: 0,
      name: "Poke",
      rulesText: "[Action] Deal 1 to a unit.",
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
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });
});
