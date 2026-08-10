/**
 * Interaction: Lee Sin, Ascetic (ogn-078-298) · Champion Unit · Calm · 5 + [calm] · 5 Might
 *     "[Shield] [Exhaust]: Buff me. I can have any number of buffs."                       — P1's, at bf1, 3 buffs
 *   × Stand United (ogn-053-298) · Spell · Calm · 3 · [Hidden] [Action]
 *     "Buff a friendly unit. Buffs give an additional +1 [Might] to friendly units this turn." — P1's hand
 *   × Sett, Kingpin (ogn-240-298) · Champion Unit · Order · 4 + [order] · 5 Might
 *     "[Tank] I get +1 [Might] for each buffed friendly unit at my battlefield."            — P1's, at bf1, unbuffed
 *
 * Question. P1's turn. Lee Sin (3 Buff counters from earlier activations) and Kingpin (unbuffed) share bf1.
 * P1 plays Stand United choosing Lee Sin.
 *   (a) Does Lee Sin get a 4th counter although he is already buffed?
 *   (b) Lee Sin's Might this turn / next turn?
 *   (c) Kingpin's Might — does he count Lee Sin once (one buffed unit) or four times (four buffs)?
 *   (d) Contrast: Stand United targets Kingpin instead — Kingpin's and Lee Sin's Might this turn / next turn?
 *
 * Rules: 426.1.b / 426.1.b.1 / 702.3 (one Buff counter per unit …), 426.1.b.2 (… unless an effect grants
 * permission to be buffed multiple times — Lee Sin), 703 (each Buff is +1 Might individually), 704 (buffs are
 * objects that may be counted "as specified" — Kingpin specifies buffed UNITS), Stand United rulings (each Buff
 * you control is worth +2 this turn: "Lee Sin with X buffs gets +X more").
 *
 * Expected: (a) yes, 3 → 4 counters. (b) 5 + 4×2 = 13 this turn; 5 + 4 = 9 next turn. (c) Kingpin counts units:
 * 5 + 1 = 6 (he is unbuffed, so the rider gives him nothing). (d) Kingpin 0 → 1 counter: 5 + 1 + 1 + 2 (Lee Sin
 * and himself are buffed here) = 9 this turn, 8 next; Lee Sin keeps 3 counters: 5 + 3×2 = 11 this turn, 8 next.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEE_SIN = "ogn-078-298";
const STAND_UNITED = "ogn-053-298";
const KINGPIN = "ogn-240-298";

/** P1's turn, 3 energy; Lee Sin (3 Buff counters) + Kingpin (unbuffed) at P1's bf1; a P2 bystander in base; Stand United in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LEE_SIN, "lee", { buffed: true, extraBuffs: 2 })
    .unit(P1, "bf1", KINGPIN, "sett")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "them")
    .hand(P1, STAND_UNITED, "stand");
}

/** Number of Buff counters on a unit (the flag is the first, `extraBuffs` the rest — 702/703). */
function buffCounters(game: Game, card: string): number {
  const s = game.state(card);
  return (s.isBuffed ? 1 : 0) + (((s.meta as { extraBuffs?: number }).extraBuffs as number | undefined) ?? 0);
}

function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

async function standUnitedOn(target: "lee" | "sett"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("stand", { targets: target });
  await game.settle();
  expect(game.zoneOf("stand")).toBe("trash");
  return game;
}

describe("premise — the seeded position", () => {
  test("Lee Sin carries 3 Buff counters = 5 + 3 = 8 Might; Kingpin is unbuffed and counts ONE buffed friendly unit here = 6", async () => {
    const game = await board().build();
    expect(buffCounters(game, "lee")).toBe(3);
    expect(game.state("lee")).toMatchObject({ baseMight: 5, isBuffed: true, might: 8 });
    expect(buffCounters(game, "sett")).toBe(0);
    expect(game.state("sett")).toMatchObject({ baseMight: 5, isBuffed: false, might: 6 });
  });

  test("Lee Sin's own [Exhaust] ability stacks a further counter on an already-buffed Lee Sin (426.1.b.2): 3 → 4, Might 8 → 9; Kingpin still 6 (one buffed unit)", async () => {
    const game = await board().build();
    await game.p1.activate("lee");
    await game.settle();
    expect(game.state("lee").isExhausted).toBe(true);
    expect(buffCounters(game, "lee")).toBe(4);
    expect(game.state("lee").might).toBe(9);
    expect(game.state("sett").might).toBe(6);
  });

  test("Stand United offers only FRIENDLY units (Lee Sin, Kingpin) — the already-buffed Lee Sin is still a legal choice; the enemy bystander is not", async () => {
    const game = await board().build();
    expect(targetsOffered(game, "stand")).toEqual(["lee", "sett"]);
    await expect(game.p1.cast("stand", { targets: "them" })).rejects.toThrow();
  });
});

describe("(a)–(c) Stand United on Lee Sin", () => {
  test("(a) Lee Sin DOES get a 4th Buff counter despite already being buffed (426.1.b.2 lifts 702.3); costs 3 energy", async () => {
    const game = await standUnitedOn("lee");
    expect(buffCounters(game, "lee")).toBe(4);
    expect(game.p1.energy()).toBe(0);
  });

  // Expected: Stand United's rider is per BUFF (703 + rulings 2401/2556: "X buffs → +X more"), so four
  // counters are worth +2 each this turn: 5 + 8 = 13. Actual: the engine models the rider as "+1 to each
  // buffed friendly unit", so Lee Sin reads 5 + 4 + 1 = 10.
  test("(b) this turn each of Lee Sin's 4 buffs is worth +2 → 5 + 4×2 = 13 Might (703, Stand United/Lee Sin ruling)", async () => {
    const game = await standUnitedOn("lee");
    expect(game.state("lee").might).toBe(13);
  });

  test("(b) next turn the rider has lapsed: Lee Sin is 5 + 4 = 9 and keeps all 4 counters (buffs are permanent)", async () => {
    const game = await standUnitedOn("lee");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(buffCounters(game, "lee")).toBe(4);
    expect(game.state("lee").might).toBe(9);
  });

  test("(c) Kingpin counts buffed UNITS, not Buff counters (704 'as specified'): one buffed friend here → 5 + 1 = 6; being unbuffed himself, Stand United's rider gives him nothing — this turn AND next", async () => {
    const game = await standUnitedOn("lee");
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 6 });
    await game.advanceTurn();
    expect(game.state("sett").might).toBe(6);
  });
});

describe("(d) contrast — Stand United on Kingpin", () => {
  test("Kingpin goes 0 → 1 counter; Lee Sin stays at 3", async () => {
    const game = await standUnitedOn("sett");
    expect(buffCounters(game, "sett")).toBe(1);
    expect(game.state("sett").isBuffed).toBe(true);
    expect(buffCounters(game, "lee")).toBe(3);
  });

  test("Kingpin this turn = 5 base + 1 (buff) + 1 (rider on his own buff) + 2 (two buffed friendly units here: Lee Sin and himself) = 9", async () => {
    const game = await standUnitedOn("sett");
    expect(game.state("sett").might).toBe(9);
  });

  // Expected: the rider applies to ALL friendly buffs, not just the target's — Lee Sin's 3 counters are +2
  // each this turn: 5 + 6 = 11. Actual: engine gives buffed units a flat +1 → 5 + 3 + 1 = 9.
  test("Lee Sin this turn = 5 + 3×2 = 11 — Stand United's rider doubles every friendly buff, including untargeted Lee Sin's three (703, ruling 2065/2556)", async () => {
    const game = await standUnitedOn("sett");
    expect(game.state("lee").might).toBe(11);
  });

  test("next turn: Kingpin = 5 + 1 + 2 = 8, Lee Sin = 5 + 3 = 8", async () => {
    const game = await standUnitedOn("sett");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 8 });
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 8 });
    expect(game.violations()).toEqual([]);
  });
});
