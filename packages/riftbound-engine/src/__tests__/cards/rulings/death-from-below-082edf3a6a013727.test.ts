/**
 * Ruling 082edf3a6a013727 — Death from Below (UNL-186 → unl-186-219) × Battering Ram (SFD-012 → sfd-012-221)
 *   Death from Below: 4 + [rainbow] Action — "Kill a unit at a battlefield. Then, if it had 3 [Might] or less,
 *   you may play this from your trash for [rainbow]."
 *   Battering Ram: 5-cost unit — "I cost [1] less for each card you've played this turn, to a minimum of [1]."
 *   (Repeat source used here: Temporal Portal sfd-078-221 — "next spell you play this turn has [Repeat] equal
 *   to its cost".)
 *
 * Q: If I play Death from Below and Repeat it, does that count twice toward Battering Ram's cost reduction?
 * A: No. However many times a spell's instructions are executed via Repeat, the spell is only PLAYED once, so
 *    Battering Ram sees one card played (−1), not two.
 * Rules: 820.3.a (Repeat ⇒ still played once), 820.1.d.1 (only the effect is re-executed), 419.4 (cards played).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATH_FROM_BELOW = "unl-186-219";
const BATTERING_RAM = "sfd-012-221";
const TEMPORAL_PORTAL = "sfd-078-221";
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Cantrip",
  timing: "action",
} as const;

/**
 * P1: Temporal Portal on board ([rainbow] to activate), Death from Below + Battering Ram (+ a 1-cost cantrip)
 * in hand. Two enemy units at battlefields, both above 3 Might so DfB's replay-from-trash rider never applies.
 */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy, power: { rainbow: 3 } })
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Brute A" }, "a")
    .unit(P2, "bf2", { might: 5, name: "Brute B" }, "b")
    .hand(P1, DEATH_FROM_BELOW, "dfb")
    .hand(P1, BATTERING_RAM, "ram")
    .hand(P1, CANTRIP, "cantrip");
}

function repeatOptions(game: Game): number[] {
  const field = game.p1.option("cast", "dfb")?.fields.find((f) => f.name === "repeatCount");
  return ((field?.options ?? []) as number[]).map(Number);
}

/** Energy Battering Ram would cost right now (from the play option's legality at the current pool is awkward — read it by paying). */
async function playRamAndMeasure(game: Game): Promise<number> {
  const before = game.p1.energy();
  await game.p1.play("ram");
  return before - game.p1.energy();
}

describe("Ruling 082edf3a6a013727 — a Repeated Death from Below is ONE card played: Battering Ram gets −1, not −2", () => {
  test("setup: Temporal Portal gives Death from Below (4 + [rainbow]) one Repeat tier priced at its cost", async () => {
    const game = await board(12).build();
    expect(repeatOptions(game)).toEqual([]);
    await game.p1.activate("portal");
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(2);
    expect(repeatOptions(game)).toEqual([1]);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 0 }); // activating a gear is not playing a card
  });

  test("cast with Repeat paid: 8 energy + 2 power, ONE chain item, the effect executes twice (both enemy units killed) — yet cardsPlayedThisTurn is exactly 1 (820.3.a)", async () => {
    const game = await board(12).build();
    await game.p1.activate("portal");
    await game.settle();
    await game.p1.cast("dfb", { repeat: 1, targets: ["a", "b"] });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { rainbow: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "dfb", controller: P1 });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("…so Battering Ram then costs 5 − 1 = 4 (not 3): with exactly 4 energy left it is playable and takes all 4", async () => {
    const game = await board(12).build();
    await game.p1.activate("portal");
    await game.settle();
    await game.p1.cast("dfb", { repeat: 1, targets: ["a", "b"] });
    await game.settle();
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("play", "ram")).toBe(true);
    expect(await playRamAndMeasure(game)).toBe(4);
    await game.settle();
    expect(game.zoneOf("ram")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("negative space: with only 3 energy left after the Repeated cast, Battering Ram (cost 4) is NOT playable — the Repeat did not buy a second discount", async () => {
    const game = await board(11).build();
    await game.p1.activate("portal");
    await game.settle();
    await game.p1.cast("dfb", { repeat: 1, targets: ["a", "b"] });
    await game.settle();
    expect(game.p1.energy()).toBe(3);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
    expect(game.p1.can("play", "ram")).toBe(false);
  });

  test("contrast: two genuinely separate plays (Death from Below without Repeat + a 1-cost cantrip) ARE two cards played → Battering Ram costs 5 − 2 = 3", async () => {
    const game = await board(8).build(); // 4 (DfB) + 1 (cantrip) + 3 (Ram)
    await game.p1.cast("dfb", { targets: "a" });
    await game.settle();
    await game.p1.cast("cantrip");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 });
    expect(game.p1.energy()).toBe(3);
    expect(await playRamAndMeasure(game)).toBe(3);
    await game.settle();
    expect(game.zoneOf("ram")).toBe("base");
  });
});
