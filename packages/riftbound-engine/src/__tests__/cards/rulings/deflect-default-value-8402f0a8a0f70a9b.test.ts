/**
 * Ruling 8402f0a8a0f70a9b — (no specific card) how much Power does a bare [Deflect] cost?
 *   Exercised with a Bird token (UNL-t02 → unl-t02, printed bare "[Deflect]"), Void Seeker
 *   (OGN-024 → ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1." and inline units
 *   carrying bare / numbered [Deflect], [Assault] and [Shield].
 *
 * Q: How much Power do you spend to target something with [Deflect] when no number is printed?
 * A: One, of any Domain. A keyword written without a number has X = 1 — the same default applies
 *    to [Shield] and [Assault]. [Deflect X] costs X, and the Power paid may always be off-domain.
 * Rules: 809.1.b.3 (bare [Deflect] ⇒ 1), 809.1.c/809.1.c.1 (the surcharge, payable in any Domain),
 *        807.1.b.3 (bare [Assault] ⇒ 1), 808.1.b.3-style default for [Shield], 356.2.a.2
 *        (a mandatory additional cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BIRD = "unl-t02"; // printed "[Deflect]" — no number
const VOID_SEEKER = "ogn-024-298"; // [3] + [fury]

const DEFLECT_2 = {
  abilities: [{ keyword: "Deflect", type: "keyword", value: 2 }],
  cardType: "unit",
  might: 3,
  name: "Test Bulwark",
  rulesText: "[Deflect 2]",
} as const;

const SPARE = 4; // off-domain Power kept around to pay surcharges from

/** P2's turn; P2 holds Void Seeker with exactly its cost plus 4 spare off-domain Power. */
const board = () =>
  scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1, mind: SPARE } })
    .battlefield("bf1", { controller: P1 })
    .hand(P2, VOID_SEEKER, "seeker");

/** Cast Void Seeker at `target`; report the Power spent beyond its own [fury] pip. */
async function surcharge(game: Game, target: string): Promise<number> {
  await game.p2.cast("seeker", { targets: target });
  expect(game.p2.energy()).toBe(0);
  expect(game.p2.power("fury")).toBe(0); // its own printed pip
  return SPARE - game.p2.power("mind");
}

describe("Ruling 8402f0a8a0f70a9b — an omitted keyword value is 1", () => {
  test("a plain unit costs nothing extra — the baseline", async () => {
    const game = await board().unit(P1, "bf1", { might: 3, name: "Plain" }, "plain").build();
    expect(await surcharge(game, "plain")).toBe(0);
  });

  test("the Bird's printed bare [Deflect] costs exactly 1 Power", async () => {
    const game = await board().unit(P1, "bf1", BIRD, "bird").build();
    expect(game.state("bird").keywords).toContain("Deflect");
    expect(await surcharge(game, "bird")).toBe(1);
  });

  test("that Power may be of any Domain: a [fury] spell pays the Bird's surcharge with [mind]", async () => {
    const game = await board().unit(P1, "bf1", BIRD, "bird").build();
    await game.p2.cast("seeker", { targets: "bird" });
    expect(game.p2.power("fury")).toBe(0); // only the printed pip came from fury
    expect(game.p2.power("mind")).toBe(SPARE - 1); // the surcharge came from an off-domain pool
  });

  test("[Deflect 2] costs 2 — the number is used verbatim when it is printed", async () => {
    const game = await board().unit(P1, "bf1", DEFLECT_2, "bulwark").build();
    expect(await surcharge(game, "bulwark")).toBe(2);
  });

  test("with only 1 spare Power the bare-Deflect Bird is still targetable but [Deflect 2] is not", async () => {
    const tight = () =>
      scenario()
        .active(P2)
        .resources(P2, { energy: 3, power: { fury: 1, mind: 1 } })
        .battlefield("bf1", { controller: P1 })
        .hand(P2, VOID_SEEKER, "seeker");
    const g1 = await tight().unit(P1, "bf1", DEFLECT_2, "bulwark").build();
    expect((await g1.p2.try((p) => p.cast("seeker", { targets: "bulwark" }))).ok).toBe(false);
    const g2 = await tight().unit(P1, "bf1", BIRD, "bird").build();
    await g2.p2.cast("seeker", { targets: "bird" });
    expect(g2.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
  });

  test("the same default for [Assault]: a bare-Assault attacker is +1 Might in combat", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", { keywords: ["Assault"], might: 4, name: "Test Raider" }, "raider")
      .build();
    expect(game.state("raider").might).toBe(4); // no bonus outside combat
    await game.p1.move("raider", "bf1");
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", might: 5 }); // 4 + Assault 1
  });

  test("the same default for [Shield]: a bare-Shield defender survives exactly-lethal damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { keywords: ["Shield"], might: 4, name: "Test Guard" }, "guard")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    expect(game.state("guard").combatRole).toBe("defender");
    await game.settle();
    // 4 damage vs 4 Might + Shield 1 = 5 needed: the guard lives and the attacker (4 vs 5) dies.
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
