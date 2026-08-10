/**
 * Ruling b3e8d7668ed47ccb — Last Breath (OGN-260 → ogn-260-298) · Spell · Calm/Chaos · 3+2 power · Action
 *     "Ready a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield."
 *   × Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · 2
 *     "When a friendly unit attacks or defends alone, give it +1 Might this turn."
 *
 * Q: Can I Last Breath an exhausted unit in base, then move it to a battlefield (triggering the Mask bonus) BEFORE Last
 *    Breath deals its damage?
 * A: No. Once Last Breath starts resolving, "ready" then "deal damage" happen back to back with no window to act in
 *    between; the damage uses the unit's Might as it sits in base. You CAN move the unit first (attacking alone triggers
 *    the Mask on its own), and only then cast Last Breath with the bonus already applied.
 * Rules: 359.1/359.3 (a resolving spell performs all its instructions before anything else happens), 336–343 (no
 *        player acts during resolution), 740.2 (alone), Mask trigger 383.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LAST_BREATH = "ogn-260-298";
const MASK_OF_FORESIGHT = "ogn-060-298";

/** P1's turn: Swordsman (4) in base, Mask of Foresight in base, exactly Last Breath's 3 + 2 power. P2 holds bf1 with a 7-Might Brute. */
function board(swordsmanExhausted: boolean) {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 4, name: "Swordsman" }, "swordsman", { exhausted: swordsmanExhausted })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .hand(P1, LAST_BREATH, "lb");
}

describe("Ruling b3e8d7668ed47ccb — no moving between Last Breath's 'ready' and its damage", () => {
  test("Last Breath on the exhausted Swordsman in base resolves in one go: it readies and IMMEDIATELY deals 4 (its base-side Might, no Mask bonus) to the Brute — P1 is never offered a move (or anything but priority passes) while it is on the chain", async () => {
    const game = await board(true).build();
    expect(game.state("swordsman").isExhausted).toBe(true);
    await game.p1.cast("lb", { targets: ["swordsman", "brute"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lb", controller: P1 })]);
    // Drain the chain by hand: every decision until Last Breath is in the trash is a plain priority pass — no move,
    // no destination pick, no Mask prompt in between "ready" and "deal damage".
    for (let i = 0; i < 6 && game.zoneOf("lb") !== "trash"; i++) {
      const d = game.decision();
      expect(d).toMatchObject({ context: "chain", kind: "action" });
      if (d?.kind === "action") {
        expect(d.options.map((o) => o.verb).filter((v) => v !== "concede" && v !== "passPriority")).toEqual([]);
      }
      await game.acting().passPriority();
    }
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.state("swordsman")).toMatchObject({ isReady: true, location: "base", might: 4, mightModifier: 0 });
    expect(game.state("brute").damage).toBe(4); // 4, not 5 — the Mask never triggered
    expect(game.chain()).toEqual([]);
    // Only AFTER full resolution is the game open again — now the (ready) Swordsman may move.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("standardMove")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the legal line: move the Swordsman into bf1 FIRST (it attacks alone → Mask gives +1 on its own chain), then cast Last Breath in the showdown — it readies the Swordsman and deals 5 to the Brute", async () => {
    const game = await board(false).build();
    await game.p1.move("swordsman", "bf1");
    expect(game.state("swordsman").combatRole).toBe("attacker");
    // Mask of Foresight's trigger resolves (its own chain) before anyone acts with Focus.
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("swordsman")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "lb")).toBe(true);
    await game.p1.cast("lb", { targets: ["swordsman", "brute"] });
    for (let i = 0; i < 6 && game.zoneOf("lb") !== "trash"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.state("swordsman").isReady).toBe(true);
    expect(game.state("brute").damage).toBe(5); // 4 + the Mask's +1, already active when Last Breath resolved
    expect(game.violations()).toEqual([]);
  });
});
