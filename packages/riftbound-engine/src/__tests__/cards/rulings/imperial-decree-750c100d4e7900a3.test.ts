/**
 * Ruling 750c100d4e7900a3 — Imperial Decree (OGN-221 → ogn-221-298) · Spell · Order · [5][order][order] · [Action]
 *     "When any unit takes damage this turn, kill it."
 *
 * Q: If Imperial Decree is played AFTER a unit has already been damaged, does that unit die?
 * A: No. The Decree creates a delayed trigger that watches for the EVENT of taking damage while it is active. Damage
 *    dealt before it resolved is a past event, and the Decree never inspects the board's current damage state. The
 *    unit only dies if it takes further damage while the Decree is live.
 * Rules: 383.2 (a trigger fires on its event occurring, not on a state), 390 (delayed triggers begin when created),
 *        359.3.f (an effect reads the game as it resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";

/** Inline [1] action spell: deal 1 to a unit. */
const sting = (name: string) => ({
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name,
  timing: "action",
});

/** P1's turn with [7][order][order]: Decree (5 + 2 order) plus two [1] Stings. P2's 3-Might Survivor sits in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 2 } })
    .unit(P2, "base", { might: 3, name: "Survivor" }, "surv")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, sting("Sting One"), "sting1")
    .hand(P1, sting("Sting Two"), "sting2");
}

describe("Ruling 750c100d4e7900a3 — Imperial Decree does not look back at damage dealt before it resolved", () => {
  test("ruling 750c100d4e7900a3 — damage first, Decree second: the already-damaged unit survives the Decree's resolution", async () => {
    const game = await board().build();
    await game.p1.cast("sting1", { targets: "surv" });
    await game.settle();
    expect(game.state("surv").damage).toBe(1);
    expect(game.zoneOf("surv")).toBe("base");

    await game.p1.cast("decree");
    expect(game.chain().map((c) => c.cardId)).toEqual(["decree"]);
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.zoneOf("surv")).toBe("base"); // still alive — no retroactive kill
    expect(game.state("surv").damage).toBe(1); // and its old damage is still just marked damage
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("…but the very next point of damage while the Decree is live does kill it", async () => {
    const game = await board().build();
    await game.p1.cast("sting1", { targets: "surv" });
    await game.settle();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.zoneOf("surv")).toBe("base");
    await game.p1.cast("sting2", { targets: "surv" });
    await game.settle();
    expect(game.zoneOf("surv")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control — Decree first, damage second: a single point of damage is lethal straight away", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.zoneOf("surv")).toBe("base");
    await game.p1.cast("sting1", { targets: "surv" });
    await game.settle();
    expect(game.zoneOf("surv")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
