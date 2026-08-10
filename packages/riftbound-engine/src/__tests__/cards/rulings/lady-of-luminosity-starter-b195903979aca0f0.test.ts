/**
 * Ruling b195903979aca0f0 — Lady of Luminosity - Starter (OGS-021 → ogs-021-024) · Legend (Lux)
 *     "When you play a spell that costs [5] or more, draw 1."
 *   × Wind Wall (OGN-064 → ogn-064-298) · Spell · Calm · 3+[calm][calm] · [Reaction] "Counter a spell."
 *   (Falling Comet ogn-085-298 · 5 · "Deal 6 to a unit at a battlefield." is the [5]+ spell; Flash ogs-011-024 for the contrast.)
 *
 * Q: Does Lux still draw a card if the [5]+ spell is countered?
 * A: No. The legend triggers when the spell is played (i.e. resolves); a countered spell is not considered played, so no
 *    draw. Contrast: a spell whose target merely became illegal still resolves (doing nothing) and Lux DOES draw.
 * Rules: 419.4.a / 419.4.a.1 (play triggers fire on resolution; countered → never), 425.1.b, 419.4.b (Finalized count
 *        for non-triggered checks is unaffected), 359.3.e.1 (illegal target → still resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LUX_LEGEND = "ogs-021-024";
const WIND_WALL = "ogn-064-298";
const FALLING_COMET = "ogn-085-298";
const FLASH = "ogs-011-024";

/** P1's turn: Lux legend, Falling Comet + [5]. P2: 7-Might Guard at bf1, Wind Wall (3+[calm][calm]) and Flash ([2]) in hand with resources for either. */
function board() {
  return scenario()
    .legend(P1, LUX_LEGEND, "lux")
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 5, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Guard" }, "guard")
    .hand(P1, FALLING_COMET, "comet")
    .hand(P2, WIND_WALL, "ww")
    .hand(P2, FLASH, "flash");
}

const luxItems = (game: Game) => game.chain().filter((c) => c.cardId === "lux" && c.triggered);

describe("Ruling b195903979aca0f0 — a countered [5]+ spell was never 'played', so Lux's legend does not draw", () => {
  test("control: Falling Comet (cost 5) resolves uncountered → Lux triggers and P1 draws 1", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.cast("comet", { targets: "guard" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.state("guard").damage).toBe(6);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
  });

  test("P2 Wind Walls the Comet in response: both spells to trash, Guard undamaged, NO Lux trigger ever appears and P1 draws nothing (costs not refunded)", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.cast("comet", { targets: "guard" });
    expect(luxItems(game)).toEqual([]); // the legend waits for resolution, not for the cast
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ww")).toBe(true);
    await game.p2.cast("ww", { targets: "comet" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["comet", "ww"]);
    // Resolve everything, watching for a Lux item.
    let sawLux = false;
    for (let i = 0; i < 10 && game.chain().length > 0; i++) {
      sawLux ||= luxItems(game).length > 0;
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    sawLux ||= luxItems(game).length > 0;
    expect(sawLux).toBe(false);
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.state("guard").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.p1.energy()).toBe(0); // 425.1.c — no refund
    // 419.4.b — the countered Comet was still Finalized: P1's played-card tally (Legion etc.) reads 1.
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: P2 Flashes the Guard to base in response — the Comet's target is now illegal, it resolves doing nothing, and Lux DOES draw 1", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.cast("comet", { targets: "guard" });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("flash", { targets: ["guard"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["comet", "flash"]);
    await game.settle();
    expect(game.locationOf("guard")).toBe("base");
    expect(game.state("guard").damage).toBe(0); // no longer "a unit at a battlefield"
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
  });
});
