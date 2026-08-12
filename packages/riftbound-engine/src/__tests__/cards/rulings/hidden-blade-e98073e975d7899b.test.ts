/**
 * Ruling e98073e975d7899b — Hidden Blade (OGN-213 → ogn-213-298) · 2 + [order] · [Action] [Hidden]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × En Garde (ogn-046-298) "[Reaction] Give a friendly unit +1 [Might] this turn, then an additional
 *     +1 [Might] this turn if it is the only unit you control there."
 *
 * Q: Hidden Blade resolves during a showdown and the opponent draws 2 — can they cast a reaction off
 *    those cards to save the unit that was being killed?
 * A: No. The kill and the draw are one resolution: by the time the opponent holds the cards and gets
 *    priority again, that unit is already dead. They may of course start a new chain with what they
 *    drew (and more chains can happen before any combat damage), just not to rescue that unit.
 * Rules: 359.3 (a chain item resolves fully before anyone gets priority again), 340 (priority returns
 *        after the item has resolved), 465 (combat damage waits for the showdown to close).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const EN_GARDE = "ogn-046-298";

/** P1 attacks bf1; P2 defends with a 4-Might Sentinel and a 4-Might Reserve, and draws En Gardes. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 4, name: "Sentinel" }, "sentinel")
    .unit(P2, "bf1", { might: 4, name: "Reserve" }, "reserve")
    .hand(P1, HIDDEN_BLADE, "blade")
    .deck(P2, [EN_GARDE, EN_GARDE, EN_GARDE], ["e1", "e2", "e3"]);
}

describe("Ruling e98073e975d7899b — Hidden Blade's kill and draw are one resolution: the drawn cards arrive too late to save the unit", () => {
  test("with the showdown open, Hidden Blade kills the Sentinel and its controller draws 2 in the same resolution", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(game.p2.hand()).toEqual([]);
    await game.p1.cast("blade", { targets: "sentinel" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.zoneOf("sentinel")).toBe("battlefield-bf1"); // still alive while it is on the chain
    expect(game.p2.hand()).toEqual([]);

    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.p2.hand()).toEqual(["e1", "e2"]);
  });

  test("the opponent does get to act with the new cards — but the dead unit is not among En Garde's legal objects", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("blade", { targets: "sentinel" });
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.p2.can("cast", "e1")).toBe(true); // a fresh chain may be started
    const targets = game.p2.option("cast", "e1")?.fields.find((f) => f.arg === "targets")?.options;
    expect((targets as string[][]).flat()).toEqual(["reserve"]); // never the trashed Sentinel
    const rescue = await game.p2.try((p) => p.cast("e1", { targets: "sentinel" }));
    expect(rescue.ok).toBe(false);
    expect(game.zoneOf("sentinel")).toBe("trash");
  });

  test("those extra chains all happen before combat damage: En Garde resolves, and only after both sides pass Focus is damage assigned", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("blade", { targets: "sentinel" });
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    await game.p2.cast("e1", { targets: "reserve" });
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("reserve").might).toBeGreaterThan(4);
    expect(game.state("raider").damage).toBe(0); // no combat damage yet
    await game.settle(); // both pass Focus ⇒ combat
    expect(game.zoneOf("raider")).toBe("trash"); // the buffed 4+ Reserve out-damages the 4-Might Raider
    expect(game.violations()).toEqual([]);
  });
});
