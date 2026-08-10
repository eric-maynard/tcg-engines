/**
 * Ruling ec7ca1bc576b4b6a — Noxian Drummer (OGN-222 → ogn-222-298) · 3 Might · "When I move to a battlefield, play a 1 [Might]
 *     Recruit unit token here."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield · "Units here have +1 [Might]. (This includes attackers.)"
 *   × Gust (OGN-169 → ogn-169-298) · [Reaction] · 1 · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: The 3-Might Drummer moves to Trifarian War Camp and the opponent wants to Gust her — does the Camp's +1 apply first?
 * A: Yes. The Camp's passive applies the moment she arrives, so she is 4 Might; Gust (3 or less) cannot target her.
 * Rules: 522 (statics apply continuously, incl. on arrival), 355.8 (targets must be legal when chosen), Gust's restriction.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOXIAN_DRUMMER = "ogn-222-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298";
const GUST = "ogn-169-298";

/**
 * P1's turn. The live War Camp is P2's, held by a 5-Might Wall (reads 6 there). P1: ready Drummer (3) in base and a 2-Might
 * Scout at the plain bf2 (a unit Gust CAN hit, so Gust itself is castable). P2: Gust + [1].
 */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("camp", { controller: P2, def: TRIFARIAN_WAR_CAMP, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "camp", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "base", NOXIAN_DRUMMER, "drummer")
    .hand(P2, GUST, "gust");
}

function gustTargets(game: Game): string[] {
  const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flat() as string[])];
}

/** Drummer moves onto the Camp; her move trigger is on the chain; P1 passes so P2 holds priority. */
async function drummerAtCampP2Window(): Promise<Game> {
  const game = await board().build();
  expect(game.state("drummer").might).toBe(3);
  expect(game.state("wall").might).toBe(6); // premise: the Camp is live
  await game.p1.move("drummer", "camp");
  expect(game.zoneOf("drummer")).toBe("battlefield-camp");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling ec7ca1bc576b4b6a — the War Camp's +1 lands before Gust can be aimed: a 4-Might Drummer is no Gust target", () => {
  test("the Drummer is 4 Might the instant she arrives at the Camp (3 + 1), already while her own move trigger waits on the chain", async () => {
    const game = await drummerAtCampP2Window();
    expect(game.state("drummer")).toMatchObject({ baseMight: 3, might: 4 });
  });

  test("in P2's Reaction window Gust is castable (the 2-Might Scout at bf2 is legal) but the Drummer is NOT among its legal targets; forcing her is rejected", async () => {
    const game = await drummerAtCampP2Window();
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = gustTargets(game);
    expect(offered).toContain("scout");
    expect(offered).not.toContain("drummer");
    expect(offered).not.toContain("wall");
    const r = await game.p2.try((p) => p.cast("gust", { targets: "drummer" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.zoneOf("drummer")).toBe("battlefield-camp");
  });

  test("left alone, the trigger resolves: a Recruit token joins her at the Camp (and reads 2 there); the Drummer stays at 4", async () => {
    const game = await drummerAtCampP2Window();
    await game.p2.passPriority();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    const recruits = game.findAll({ name: "Recruit", owner: P1 });
    expect(recruits).toHaveLength(1);
    expect(game.zoneOf(recruits[0] as string)).toBe("battlefield-camp");
    expect(game.state(recruits[0] as string)).toMatchObject({ baseMight: 1, might: 2 });
    expect(game.state("drummer").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — moving to the plain bf2 instead leaves her at 3, and there Gust CAN take her", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1 })
      .battlefield("camp", { controller: P2, def: TRIFARIAN_WAR_CAMP, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "camp", { might: 5, name: "Wall" }, "wall")
      .unit(P2, "bf2", { might: 5, name: "Wall 2" }, "wall2")
      .unit(P1, "base", NOXIAN_DRUMMER, "drummer")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.move("drummer", "bf2");
    expect(game.state("drummer").might).toBe(3);
    await game.p1.passPriority();
    expect(gustTargets(game)).toContain("drummer");
    await game.p2.cast("gust", { targets: "drummer" });
    await game.settle();
    expect(game.zoneOf("drummer")).toBe("hand");
  });
});
