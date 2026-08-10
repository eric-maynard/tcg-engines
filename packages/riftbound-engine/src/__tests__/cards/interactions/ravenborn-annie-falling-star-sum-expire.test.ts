/**
 * Interaction: Ravenborn Tome (ogn-032-298, Gear · Fury · [3])
 *     "[Exhaust]: The next spell you play this turn deals 1 Bonus Damage."
 *   × Annie, Fiery (ogs-001-024, Unit · Fury · 4 Might)
 *     "Your spells and abilities deal 1 Bonus Damage."
 *   × Falling Star (ogn-029-298, Spell · Fury · [2][fury][fury]) "Deal 3 to a unit. Deal 3 to a unit."
 *   (+ Hextech Ray ogn-009-298, [1][fury], "Deal 3 to a unit at a battlefield." as the second spell)
 *
 * Question: P1 controls Annie and a ready Tome, exhausts the Tome, then plays Falling Star with one
 * instance on P2's X (5 Might) and one on P2's Y (5 Might). (a) Do the two grants stack, and is the
 * bonus per Deal instance or spread over the spell? Exact damage on X and Y? (b) Both instances on X?
 * (c) Hextech Ray at Z (5 Might) later the same turn — does the Tome's bonus still apply?
 *
 * Rules: 713 (Bonus Damage is granted to Deal actions), 714 (multiple instances are summed and
 * applied once per action), 715 / 715.1 (applies to the total of ONE instance of the action — each
 * "Deal 3" separately), 417.6.a (the spell is the source), 417.1.c, 428.5.c (Cleanup kills credited
 * to the spell that just resolved).
 *
 * Expected: (a) +1 (Annie) +1 (Tome) = +2 on EACH Deal: X 3+2 = 5, Y 3+2 = 5 → both 5-Might units die.
 * (b) X takes 5 then 5 = 10 and dies; Y untouched. (c) The Tome's grant was consumed by Falling Star
 * ("the next spell"); Hextech Ray gets only Annie's +1 → Z takes 4 and survives.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RAVENBORN_TOME = "ogn-032-298";
const ANNIE_FIERY = "ogs-001-024";
const FALLING_STAR = "ogn-029-298";
const HEXTECH_RAY = "ogn-009-298";

type Built = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1: Annie, Fiery in base, a READY Ravenborn Tome, Falling Star + Hextech Ray in hand and
 * exactly their costs ([2][fury][fury] + [1][fury]). P2 holds bf1 with X, Y, Z (5 Might each) and a
 * 12-Might Wall (survives anything here, so marked damage can be read off it).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ANNIE_FIERY, "annie")
    .gear(P1, RAVENBORN_TOME, "tome")
    .unit(P2, "bf1", { might: 5, name: "X" }, "unitX")
    .unit(P2, "bf1", { might: 5, name: "Y" }, "unitY")
    .unit(P2, "bf1", { might: 5, name: "Z" }, "unitZ")
    .unit(P2, "bf1", { might: 12, name: "Wall" }, "wall")
    .hand(P1, FALLING_STAR, "star")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** Exhaust the Tome (its [Exhaust] ability) and let it resolve. */
async function primeTome(game: Built): Promise<void> {
  await game.p1.activate("tome");
  await game.settle();
  expect(game.state("tome").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 3 } }); // [Exhaust] only
}

describe("Ravenborn Tome + Annie, Fiery × Falling Star: bonuses SUM per Deal instance, Tome expires after one spell", () => {
  test("baseline (no Tome activation): Annie alone gives each Falling Star instance +1 → X takes 4, Y takes 4, both 5-Might units survive", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["unitX", "unitY"] });
    await game.settle();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.state("unitX").damage).toBe(4);
    expect(game.state("unitY").damage).toBe(4);
    expect(game.zoneOf("unitX")).toBe("battlefield-bf1");
    expect(game.zoneOf("unitY")).toBe("battlefield-bf1");
  });

  test("(a) Tome exhausted, Falling Star X / Y: Annie +1 and Tome +1 are SUMMED (714) and applied to EACH 'Deal 3' (715.1) → 5 to X and 5 to Y; both 5-Might units die in the Cleanup (credited to Falling Star, 428.5.c); it is not '+2 spread across the spell'", async () => {
    const game = await board().build();
    await primeTome(game);
    await game.p1.cast("star", { targets: ["unitX", "unitY"] });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.settle();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("unitX")).toBe("trash");
    expect(game.zoneOf("unitY")).toBe("trash");
    expect(game.state("unitZ").damage).toBe(0); // never chosen
    expect(game.state("wall").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(a) exact amounts, read off units that survive: X and the 12-Might Wall each take exactly 3+2 = 5 (not 4/4, not 5/3, not 6/6)", async () => {
    const game = await board().build();
    await primeTome(game);
    await game.p1.cast("star", { targets: ["wall", "unitZ"] });
    await game.settle();
    expect(game.state("wall").damage).toBe(5);
    expect(game.zoneOf("unitZ")).toBe("trash"); // 5 ≥ 5 Might
    // And with both instances on survivable units of different sizes: a second board, Wall + a 6-Might unit.
    const g2 = await board().unit(P2, "bf1", { might: 6, name: "Big" }, "big").build();
    await primeTome(g2);
    await g2.p1.cast("star", { targets: ["wall", "big"] });
    await g2.settle();
    expect(g2.state("wall").damage).toBe(5);
    expect(g2.state("big").damage).toBe(5);
    expect(g2.zoneOf("big")).toBe("battlefield-bf1"); // 5 < 6
  });

  test("(b) both instances on X: 5 + 5 — X (5 Might) dies once, Y is untouched; on the 12-Might Wall the same play marks exactly 10", async () => {
    const game = await board().build();
    await primeTome(game);
    await game.p1.cast("star", { targets: ["unitX", "unitX"] });
    await game.settle();
    expect(game.zoneOf("unitX")).toBe("trash");
    expect(game.p2.trash().filter((c) => c === "unitX")).toHaveLength(1);
    expect(game.state("unitY").damage).toBe(0);
    expect(game.zoneOf("unitY")).toBe("battlefield-bf1");

    const g2 = await board().build();
    await primeTome(g2);
    await g2.p1.cast("star", { targets: ["wall", "wall"] });
    await g2.settle();
    expect(g2.state("wall").damage).toBe(10);
    expect(g2.zoneOf("wall")).toBe("battlefield-bf1");
    expect(g2.violations()).toEqual([]);
  });

  test("(c) the Tome's grant is consumed by 'the next spell you play' (Falling Star): Hextech Ray at Z the same turn gets only Annie's +1 → Z takes 4 and survives with 4 marked", async () => {
    const game = await board().build();
    await primeTome(game);
    await game.p1.cast("star", { targets: ["unitX", "unitY"] });
    await game.settle();
    expect(game.zoneOf("unitX")).toBe("trash");
    expect(game.zoneOf("unitY")).toBe("trash");
    await game.p1.cast("ray", { targets: "unitZ" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("unitZ").damage).toBe(4);
    expect(game.zoneOf("unitZ")).toBe("battlefield-bf1");
    expect(game.state("tome").isExhausted).toBe(true); // still exhausted — the grant is simply gone
    expect(game.violations()).toEqual([]);
  });

  test("(c) contrast: if Hextech Ray is the FIRST spell after exhausting the Tome, IT gets +2 (3+1+1 = 5) and Z (5 Might) dies", async () => {
    const game = await board().build();
    await primeTome(game);
    await game.p1.cast("ray", { targets: "unitZ" });
    await game.settle();
    expect(game.zoneOf("unitZ")).toBe("trash");
  });
});
