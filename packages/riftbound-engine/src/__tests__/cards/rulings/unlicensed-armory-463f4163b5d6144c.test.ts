/**
 * Ruling 463f4163b5d6144c — Unlicensed Armory (OGN-023 → ogn-023-298) · Gear · [2] · "Discard 1, [Exhaust]: Choose a
 *   friendly unit. The next time it would die this turn, you may pay [fury] to heal it, exhaust it, and recall it instead."
 *   × Salvage (OGN-224 → ogn-224-298) · Action · [2][order] "You may kill up to one gear. Draw 1." — the contrast: "up to one"
 *     makes the choice optional.
 *
 * Q: Can Unlicensed Armory be activated with no friendly unit to choose, just to discard a card?
 * A: No. An ability that must choose a target cannot be activated without a legal one; "may" language does not make the
 *    target optional (only "up to N" does — which is why Salvage can be cast with no gear around).
 * Rules: 355.8 (a required choice with no legal object → the play/activation is illegal), 355.13 ("up to" may choose zero).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNLICENSED_ARMORY = "ogn-023-298";
const SALVAGE = "ogn-224-298";

/** P1's turn. Ready Armory in base, a card in hand to discard, [fury] available; `withUnit` adds a friendly unit. */
function board(withUnit: boolean) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Enemy" }, "enemy") // an ENEMY unit is not a legal choice either
    .gear(P1, UNLICENSED_ARMORY, "armory")
    .hand(P1, { might: 4, name: "Fodder" }, "fodder");
  return withUnit ? s.unit(P1, "base", { might: 2, name: "Ally" }, "ally") : s;
}

describe("Ruling 463f4163b5d6144c — Unlicensed Armory needs a friendly unit to choose; it cannot be activated just to discard", () => {
  test("with NO friendly unit on the board the Armory's ability is not on P1's menu at all, and forcing it is rejected — nothing is discarded, the Armory stays ready", async () => {
    const game = await board(false).build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("activate", "armory")).toBe(false);
    const r = await game.p1.try((p) => p.activate("armory", 0, { discard: "fodder" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("fodder")).toBe("hand");
    expect(game.state("armory").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("control: with a friendly unit present the same activation is legal — Fodder is discarded, the Armory exhausts, and the ability names the Ally", async () => {
    const game = await board(true).build();
    expect(game.p1.can("activate", "armory")).toBe(true);
    await game.p1.activate("armory", 0, { answers: ["ally"], discard: "fodder" });
    // The friendly unit is asked for (at activation or on resolution) — answer it if still pending, then resolve.
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        expect(d.options.map((o) => o.card ?? o.key)).toEqual(["ally"]); // only the FRIENDLY unit is offered
        await game.p1.pick("ally");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.state("armory").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast ('up to one'): Salvage can be cast with no gear anywhere — the kill is skipped and P1 still draws 1", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, SALVAGE, "salvage").build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.p1.can("cast", "salvage")).toBe(true);
    const hand0 = game.p1.hand().length;
    await game.p1.cast("salvage");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });
});
