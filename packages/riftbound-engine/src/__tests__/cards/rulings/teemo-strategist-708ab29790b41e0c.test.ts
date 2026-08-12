/**
 * Ruling 708ab29790b41e0c — Teemo, Strategist (OGN-121 → ogn-121-298) · Unit · [2][mind] · 2 Might
 *     "[Hidden] … When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to
 *      that unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Qiyana, Victorious (OGN-155 → ogn-155-298) · 4 Might · "[Deflect] (Opponents must pay [rainbow] to choose me…)"
 *
 * Q: How many times must Teemo's ability pay the [Deflect] cost?
 * A: Once. The ability chooses its target a single time, and [Deflect] is charged per act of choosing — not per
 *    revealed card or per point of damage. It is paid at Finalization, BEFORE any card is flipped; decline and the
 *    ability never reaches the chain and nothing is revealed.
 * Rules: 735.1.c/809.1.c.1 ([Deflect] is a mandatory additional cost "for each time they choose me"),
 *        383.3.b/402–404 (a triggered ability's costs and targets are settled at Finalization, before priority).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const QIYANA = "ogn-155-298"; // 4 Might, [Deflect]
// P1's top 5: three [Hidden] cards + two without.
const HIDDEN_BLADE = "ogn-213-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const CONSULT_THE_PAST = "ogn-083-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P2's turn. P1 holds bf1 with Teemo and has [3][rainbow]×3; P2's Qiyana ([Deflect]) waits in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 3, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P2, "base", QIYANA, "qiyana")
    .deck(P1, [HIDDEN_BLADE, FIGHT_OR_FLIGHT, CONSULT_THE_PAST, WATCHFUL_SENTRY, WATCHFUL_SENTRY]);
}

describe("Ruling 708ab29790b41e0c — Teemo, Strategist pays [Deflect] exactly once, up front", () => {
  test("ruling: Qiyana's attack fires Teemo's defend trigger and the [Deflect] surcharge is asked ONCE, at Finalization — one yes/no for the whole ability, before any flip", async () => {
    const game = await board().build();
    const deckTop = game.p1.deck().slice(0, 5);
    await game.p2.move("qiyana", "bf1");
    expect(game.decision()).toMatchObject({
      canAccept: true,
      kind: "yes-no",
      seat: P1,
      source: { cardId: "teemo", pendingChoiceType: "opt-in" },
      timing: "FIN",
    });
    expect(game.decision()?.prompt).toContain("[Deflect]");
    // Nothing has been revealed yet — the cost decision precedes the flip.
    expect(game.p1.deck().slice(0, 5)).toEqual(deckTop);
    expect(game.p1.power("rainbow")).toBe(3);
  });

  test("ruling: accepting pays [rainbow] ONE time and the ability then deals 1 per [Hidden] card — three [Hidden] cards, three damage, still only one pip spent", async () => {
    const game = await board().build();
    await game.p2.move("qiyana", "bf1");
    await game.p1.yes();
    expect(game.p1.power("rainbow")).toBe(2); // exactly one pip, charged at Finalization
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", targets: ["qiyana"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("qiyana").damage).toBe(3);
    expect(game.p1.power("rainbow")).toBe(2); // NOT one pip per revealed [Hidden] card
    expect(game.violations()).toEqual([]);
  });

  test("ruling: declining the [Deflect] cost removes the ability entirely — no chain item, no flip, no damage, nothing paid", async () => {
    const game = await board().build();
    const deckTop = game.p1.deck().slice(0, 5);
    await game.p2.move("qiyana", "bf1");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(3);
    expect(game.state("qiyana").damage).toBe(0);
    expect(game.p1.deck().slice(0, 5)).toEqual(deckTop);
  });

  test("control — against an attacker WITHOUT [Deflect] no surcharge is asked at all and the ability just goes on the chain", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 3, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
      .unit(P2, "base", { might: 4, name: "Plain" }, "plain")
      .deck(P1, [HIDDEN_BLADE, FIGHT_OR_FLIGHT, CONSULT_THE_PAST, WATCHFUL_SENTRY, WATCHFUL_SENTRY])
      .build();
    await game.p2.move("plain", "bf1");
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", targets: ["plain"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("plain").damage).toBe(3);
    expect(game.p1.power("rainbow")).toBe(3);
  });
});
