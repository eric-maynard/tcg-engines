/**
 * Ruling 86fa804ee7d14ed2 — Relentless Storm (OGN-249 → ogn-249-298) · Legend · Volibear
 *     "When you play a [Mighty] unit, you may exhaust me to channel 1 rune exhausted. (Mighty = 5+ [Might].)"
 *   × Sett, Brawler (ogn-164-298, 4 Might, "When I'm played … buff me")
 *   × Draven, Showboat (OGN-028 → ogn-028-298, 3 Might, "My Might is increased by your points.")
 *
 * Q: Does the Volibear legend trigger when Sett is played and then reaches 5 Might off his own play trigger?
 * A: No. The legend checks Might at the moment Sett is played — Sett is 4 then; his buff comes from a triggered
 *    ability that resolves later, after the trigger window. Contrast: Draven, Showboat's bonus is a static that
 *    applies immediately, so with enough points he IS Mighty as he is played and the legend triggers.
 * Rules: 383.2.c (conditions evaluated at the inciting event), 336–340 (triggered ability resolves via the chain),
 *        372/static abilities apply continuously, 702 (Buff).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const RELENTLESS_STORM = "ogn-249-298";
const SETT = "ogn-164-298";
const DRAVEN_SHOWBOAT = "ogn-028-298";

describe("Ruling 86fa804ee7d14ed2 — Relentless Storm checks Mighty as the unit is played", () => {
  test("Sett, Brawler (4 Might) is played: only Sett's own 'buff me' trigger goes on the chain — the legend does not trigger and P1 is never asked to exhaust it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1 } })
      .legend(P1, RELENTLESS_STORM, "storm")
      .hand(P1, SETT, "sett")
      .build();
    await game.p1.play("sett");
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 }); // 4 at the moment he is played
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sett", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "storm")).toBe(false);
    expect(game.decision()?.kind).toBe("action"); // no opt-in yes/no from the legend
  });

  test("after Sett's trigger resolves he is buffed to 5 (Mighty) — but the window has passed: still no legend trigger, legend stays ready, no rune channeled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1 } })
      .legend(P1, RELENTLESS_STORM, "storm")
      .hand(P1, SETT, "sett")
      .build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("sett");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("storm").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Draven, Showboat with 2 points is 5 Might the instant he is played (static bonus, no chain): the legend triggers, P1 may exhaust it, and 1 rune is channeled exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .points(P1, 2)
      .legend(P1, RELENTLESS_STORM, "storm")
      .hand(P1, DRAVEN_SHOWBOAT, "draven")
      .build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("draven");
    expect(game.state("draven").might).toBe(5);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "storm", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "storm" } });
    await game.p1.yes();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("storm").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1); // channeled exhausted
  });
});
