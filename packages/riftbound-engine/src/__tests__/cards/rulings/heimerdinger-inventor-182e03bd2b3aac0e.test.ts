/**
 * Ruling 182e03bd2b3aac0e — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · Champion Unit · Mind · 3 + [mind] · 3
 *     "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   × Gold (SFD-T03 → sfd-t03) · Gear token "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Q: When Heimerdinger uses the Gold token's exhaust ability, does the "Kill this" cost kill HIM, or does he only
 *    copy the "add a power" effect?
 * A: He copies the whole ability, costs included. "Kill this" now refers to Heimerdinger, so activating it kills
 *    (and exhausts) Heimerdinger as the cost; the power is then added. The Gold token itself is untouched.
 * Rules: 160/357 (costs are part of the ability and paid by the activating permanent), [Exhaust]-ability copying.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const GOLD = "sfd-t03";

/** P1's turn: ready Heimerdinger and a ready Gold token in base; empty pool. */
function board() {
  return scenario().unit(P1, "base", HEIMERDINGER, "heimer").gear(P1, GOLD, "gold");
}

describe("Ruling 182e03bd2b3aac0e — Heimerdinger copying Gold's ability pays 'Kill this' with himself", () => {
  test("Heimerdinger offers Gold's [Exhaust] ability, and its copied cost names HEIMERDINGER as the thing to kill", async () => {
    const game = await board().build();
    const opt = game.p1.legal().find((o) => o.moveId === "activateAbility" && o.card === "heimer");
    expect(opt).toBeDefined();
    expect(opt?.variants.map((v) => v.params.sourceCardId)).toEqual(["gold"]);
    const kill = opt?.fields.find((f) => f.arg === "sacrifice");
    expect(kill?.options).toEqual(["heimer"]); // "Kill this" → the copier, not the token
  });

  test("activating it: Heimerdinger is killed as the cost, [rainbow] power is added, and the Gold token stays on the board ready", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.activate("heimer", 0, { source: "gold" });
    // [Add] abilities resolve immediately — no chain item to respond to.
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("heimer")).toBe("trash");
    expect(game.p1.power()).toBe(1);
    expect(game.zoneOf("gold")).toBe("base");
    expect(game.state("gold").isExhausted).toBe(false);
    // …and the token's own ability is still available afterwards.
    expect(game.p1.can("activate", "gold")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: activating the Gold token's OWN ability kills the token (it ceases to exist) and leaves Heimerdinger alone", async () => {
    const game = await board().build();
    await game.p1.activate("gold");
    await game.settle();
    expect(game.zoneOf("gold")).toBe("gone"); // token left the board (186.1)
    expect(game.zoneOf("heimer")).toBe("base");
    expect(game.state("heimer").isExhausted).toBe(false);
    expect(game.p1.power()).toBe(1);
  });
});
