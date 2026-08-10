/**
 * Ruling 0c99aa4a67e3c8b4 — Possession (OGN-203 → ogn-203-298) · Spell · Chaos · [8][chaos][chaos][chaos] · [Action]
 *   "Choose an enemy unit at a battlefield. Take control of it and recall it. (Send it to your base.)"
 *   × Fiora, Victorious (ogn-232-298) / Darius, Trifarian (ogn-027-298) — Champion Units.
 *
 * Q: Is a Champion Unit a "unit" — can Possession target it?
 * A: Yes, champion units are units in every sense once they are on the board. But one still sitting in the
 *    Champion Zone is not on a battlefield and cannot be chosen.
 * Rules: 132/133 (champion units are units), 106 (Champion Zone is not the board), Possession's "at a battlefield".
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const FIORA_VICTORIOUS = "ogn-232-298";
const DARIUS_TRIFARIAN = "ogn-027-298";

/** P1's turn with 8 + 3 chaos. P2: Fiora (champion unit) holding bf1, a plain unit in base, Darius still in P2's Champion Zone. */
function board() {
  return scenario()
    .turn(5)
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", FIORA_VICTORIOUS, "fiora")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "homebody")
    .champion(P2, DARIUS_TRIFARIAN, "darius")
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .hand(P1, POSSESSION, "poss");
}

function targetsOffered(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[] {
  const field = game.p1.option("cast", "poss")?.fields.find((f) => f.name === "targets" || f.arg === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("Ruling 0c99aa4a67e3c8b4 — Possession can take a champion UNIT on a battlefield, never one in the Champion Zone", () => {
  test("legal targets: the enemy champion unit at bf1 (Fiora) is offered; the Champion-Zone Darius, the enemy base unit and P1's own unit are not", async () => {
    const game = await board().build();
    expect(game.state("fiora").zone).toBe("battlefield-bf1");
    expect(game.zoneOf("darius")).toBe("championZone");
    expect(game.p1.can("cast", "poss")).toBe(true);
    expect(targetsOffered(game)).toEqual(["fiora"]);
    const r = await game.p1.try((p) => p.cast("poss", { targets: "darius" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("poss")).toBe("hand");
  });

  test("cast on Fiora: it resolves — P1 takes control of the champion unit and it is recalled to P1's base; P2 loses bf1's only unit", async () => {
    const game = await board().build();
    await game.p1.cast("poss", { targets: "fiora" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("poss")).toBe("trash");
    expect(game.state("fiora")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
    expect(game.p1.units("base").sort()).toEqual(["fiora", "mine"]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
