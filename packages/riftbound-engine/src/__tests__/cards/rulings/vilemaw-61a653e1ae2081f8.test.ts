/**
 * Ruling 61a653e1ae2081f8 — filed under Vilemaw (UNL-060 → unl-060-219) · 8 Might "Enemy units here with less Might than me
 *   don't deal combat damage."
 *   × Baron Nashor (UNL-147 → unl-147-219) · Unit · Chaos · [10][chaos]×3 · 12 Might
 *     "…I can't be chosen by enemy spells and abilities. Other friendly units have +2 [Might]."
 *
 * Q: Does Baron give ITSELF the +2 Might? (A second, unrelated Vilemaw-vs-Baron question was left unanswered.)
 * A: No — "OTHER friendly units have +2 [Might]" excludes Baron Nashor itself.
 * Rules: 705 (static abilities apply as written), "other" excludes the source.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";
const VILEMAW = "unl-060-219";

/** Baron (12) and a 3-Might Minion in P1's base, another 2-Might Scout of P1's at bf1; P2's Vilemaw (8) at bf2. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", BARON_NASHOR, "baron")
    .unit(P1, "base", { might: 3, name: "Minion" }, "minion")
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf2", VILEMAW, "vilemaw");
}

describe("Ruling 61a653e1ae2081f8 — Baron Nashor's '+2 to OTHER friendly units' does not include Baron", () => {
  test("Baron stays at his printed 12 (no self-buff, no static bonus on himself)", async () => {
    const game = await board().build();
    expect(game.state("baron")).toMatchObject({ baseMight: 12, might: 12, staticMightBonus: 0 });
  });

  test("every OTHER friendly unit — wherever it is — gets +2: Minion 3 → 5, Scout 2 → 4", async () => {
    const game = await board().build();
    expect(game.state("minion")).toMatchObject({ baseMight: 3, might: 5 });
    expect(game.state("scout")).toMatchObject({ baseMight: 2, might: 4 });
  });

  test("enemy units are not 'friendly': P2's Vilemaw stays 8", async () => {
    const game = await board().build();
    expect(game.state("vilemaw")).toMatchObject({ baseMight: 8, might: 8 });
    expect(game.violations()).toEqual([]);
  });

  test("two Barons: each is 'other' to its twin, so each gets exactly +2 (14) — never its own bonus on top", async () => {
    const game = await board().unit(P1, "base", BARON_NASHOR, "baron2").build();
    expect(game.state("baron").might).toBe(14);
    expect(game.state("baron2").might).toBe(14);
    expect(game.state("minion").might).toBe(7); // +2 from each Baron
  });
});
