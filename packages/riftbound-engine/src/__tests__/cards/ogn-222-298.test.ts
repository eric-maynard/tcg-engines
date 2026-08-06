/**
 * Noxian Drummer — ogn-222-298 · Unit · Order · 3 energy (no power) · 3 Might
 *
 *   When I move to a battlefield, play a 1 [Might] Recruit unit token here.
 *   (It is also at the battlefield.)
 *
 * The trigger fires on any move whose destination is a battlefield (empty, friendly or enemy-held),
 * not on a move back to base. The token is "played", so it enters exhausted (rule 143.4).
 *
 * Engine status: the parser emits trigger event "move-to-battlefield", which the trigger matcher does
 * not recognise, so the ability never fires — every token clause below is a BUG today.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-222-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1 }, "foe")
    .unit(P1, "base", CARD, "drummer");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;
const recruitsAt = (game: Built, loc: "base" | "bf1" | "bf2") =>
  game.p1.units(loc).filter((id) => game.state(id).isToken && game.state(id).name === "Recruit");

describe("Noxian Drummer (ogn-222-298)", () => {
  test("costs 3 energy (no power); enters the base exhausted as a 3-Might unit; unaffordable with 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "drummer").build();
    await game.p1.play("drummer");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("drummer")).toBe("base");
    expect(game.state("drummer")).toMatchObject({ isExhausted: true, might: 3 });
    expect(recruitsAt(game, "base")).toHaveLength(0); // playing to base is not "moving to a battlefield"
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "drummer").build();
    expect(poor.p1.can("play", "drummer")).toBe(false);
  });

  test("moving to an open battlefield plays a 1-Might Recruit unit token at that battlefield", async () => {
    const game = await board().build();
    await game.p1.move("drummer", "bf1");
    await game.settle();
    const [tok] = recruitsAt(game, "bf1");
    expect(tok).toBeDefined();
    expect(game.state(tok!)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, isToken: true, might: 1 });
    expect(recruitsAt(game, "base")).toHaveLength(0);
    expect(recruitsAt(game, "bf1")).toHaveLength(1);
  });

  test("the Recruit token is played, so it enters exhausted (rule 143.4)", async () => {
    const game = await board().build();
    await game.p1.move("drummer", "bf1");
    await game.settle();
    const [tok] = recruitsAt(game, "bf1");
    expect(tok).toBeDefined();
    expect(game.state(tok!).isExhausted).toBe(true);
  });

  test("moving into an enemy-held battlefield also makes a Recruit there (before combat resolves)", async () => {
    const game = await board().autoProcedures(false).build();
    await game.p1.move("drummer", "bf2");
    // Resolve the trigger but stop before combat damage.
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(recruitsAt(game, "bf2")).toHaveLength(1);
  });

  test("moving from a battlefield back to base does NOT trigger", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "drummer").build();
    await game.p1.move("drummer", "base");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.zoneOf("drummer")).toBe("base");
    expect(recruitsAt(game, "base")).toHaveLength(0);
    expect(recruitsAt(game, "bf1")).toHaveLength(0);
  });
});
