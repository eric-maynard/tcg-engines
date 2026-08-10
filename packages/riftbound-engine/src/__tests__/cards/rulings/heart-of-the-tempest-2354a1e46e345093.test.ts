/**
 * Ruling 2354a1e46e345093 — Heart of the Tempest (VEN-197 → ven-197-166) · Legend (Kennen) · Order/Chaos
 *   "When you play a card from anywhere other than your hand, empower me. [Action] Disempower me, [Exhaust]: …"
 *   × Kennen, Storm of Shuriken (ven-113-166) · [3][chaos] · 4 Might — the Chosen Champion ("When you play me, [Burn 2]. …")
 *
 * Q: Playing Kennen — if I play my Chosen Champion, does the legend become Empowered?
 * A: Yes. The Champion Zone is not your hand (419.1.a), so playing the Chosen Champion from it triggers the legend and
 *    Empowers THE LEGEND — not the champion unit. Playing a second copy of the champion FROM HAND does not empower it.
 * Rules: 419.1.a (play from hand or Champion Zone), 419.4.a (play triggers on completion), 441 (Empower).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const HEART = "ven-197-166";
const KENNEN = "ven-113-166";

/** P1's turn: legend Heart of the Tempest (not empowered), Kennen in the Champion Zone AND a second Kennen in hand; [6] + 2 chaos. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { chaos: 2 } })
    .legend(P1, HEART, "heart")
    .champion(P1, KENNEN, "chosen")
    .hand(P1, KENNEN, "copy");
}

describe("Ruling 2354a1e46e345093 — playing the Chosen Champion (from the Champion Zone) empowers Heart of the Tempest", () => {
  test("before anything is played the legend is NOT empowered and its [Action] ability is unavailable", async () => {
    const game = await board().build();
    expect(game.p1.champion()).toBe("chosen");
    expect(game.state("heart").isEmpowered).toBe(false);
    expect(game.p1.can("activate", "heart")).toBe(false);
  });

  test("playing the Chosen Champion from the Champion Zone (pays [3][chaos]) fires the legend's trigger: the LEGEND becomes Empowered…", async () => {
    const game = await board().build();
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 1 } });
    await game.settle();
    expect(game.zoneOf("chosen")).toBe("base");
    expect(game.state("heart").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "heart")).toBe(true); // Disempower is now payable
    expect(game.violations()).toEqual([]);
  });

  test("…and 'empower ME' means the legend only: the Kennen unit itself does not gain the Empowered status", async () => {
    const game = await board().build();
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.state("chosen").isEmpowered).toBe(false);
    expect(game.state("heart").isEmpowered).toBe(true);
  });

  test("contrast: playing the second copy of Kennen FROM HAND is a play from hand — the legend stays un-empowered", async () => {
    const game = await board().build();
    await game.p1.play("copy");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 1 } });
    await game.settle();
    expect(game.zoneOf("copy")).toBe("base");
    expect(game.state("heart").isEmpowered).toBe(false);
    expect(game.p1.can("activate", "heart")).toBe(false);
    expect(game.p1.champion()).toBe("chosen"); // the chosen one is untouched
  });
});
