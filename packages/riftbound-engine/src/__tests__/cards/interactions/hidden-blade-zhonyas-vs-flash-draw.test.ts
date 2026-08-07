/**
 * Interaction: Hidden Blade (ogn-213-298) Action, [2][order] "[Hidden] Kill a unit at a battlefield.
 *                Its controller draws 2."
 *   × Zhonya's Hourglass (ogn-077-298) Gear "[Hidden] If a friendly unit would die, kill this
 *                instead. Heal that unit, exhaust it, and recall it."
 *   × Flash (ogs-011-024) Reaction "Move up to 2 friendly units to base."
 *
 * Question: P1 plays Hidden Blade on P2's unit at a battlefield.
 *   Case A: P2 flips its hidden Zhonya's Hourglass in response and lets it replace the death.
 *   Case B: P2 reacts with Flash, moving the unit to base before Hidden Blade resolves.
 * In each case, does the unit die and does P2 draw 2?
 *
 * Rules: 369.1 / 370.1.a.1 (Zhonya's replaces the kill — the unit never died); 359.3.e.14 /
 * 359.3.e.14.b (linked instruction "Its controller draws 2" references the unit's controller, not
 * the kill action, so it still executes when the kill is REPLACED); 359.3.e.5 / 359.3.e.14.a (if
 * the target is no longer "at a battlefield" the spell mistargets: the kill is ignored and the
 * linked draw is ignored too).
 *
 * Expected A: Hourglass → trash; unit survives healed, exhausted, recalled to base; P2 draws 2.
 * Expected B: unit survives in base; nobody draws. Hidden Blade goes to trash in both cases.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const ZHONYA = "ogn-077-298";
const FLASH = "ogs-011-024";

function board() {
  return scenario()
    .turn(3) // the facedown Hourglass was hidden on an earlier turn (811: playable from the next turn)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3 }, "victim")
    .hand(P1, HIDDEN_BLADE, "blade");
}

const withHiddenHourglass = () => board().facedown(P2, "bf1", ZHONYA, "zh");
const withFlash = () => board().hand(P2, FLASH, "flash");

describe("Hidden Blade × Zhonya's Hourglass / Flash — replaced kill vs. mistarget, and who draws", () => {
  // ---- baseline ---------------------------------------------------------------------------

  test("control (no response): Hidden Blade costs [2][order], kills the unit at the battlefield and goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "victim" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("order")).toBe(0);
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
  });

  // Expected: "Its controller" = the killed unit's controller (P2) draws 2; the caster draws nothing.
  // Actual: the engine resolves the draw for the caster's opponent-of-record incorrectly — P1 (the
  // caster) draws 2 and P2 draws 0.
  test("control — 'Its controller draws 2' means the unit's controller (P2) draws 2, not the caster (359.3.e.14)", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // only Hidden Blade left the hand
  });

  // ---- Case A: hidden Zhonya's Hourglass flipped in response ------------------------------------

  test("A: with Hidden Blade on the chain P2 gets priority and may play the hidden Hourglass for [0]; it is in play before the Blade resolves", async () => {
    const game = await withHiddenHourglass().build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("reveal", "zh")).toBe(true);
    const energy = game.p2.energy();
    await game.p2.reveal("zh");
    expect(game.p2.energy()).toBe(energy); // hidden cards are played for [0]
    // Let anything the reveal put on the chain resolve, but stop before Hidden Blade does.
    while (game.chain().length > 1) {
      await game.acting().pass();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("zh")); // face up, in play
    expect(game.state("zh").isHidden).toBe(false);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
  });

  // Expected: the kill is replaced — Hourglass is killed instead (trash); the unit is healed,
  // exhausted and recalled to base (370.1.a.1). Actual: Zhonya's replacement never intercepts a
  // "kill" game action; the unit goes to the trash and the Hourglass stays in base.
  test("A — Zhonya's replaces the kill: Hourglass to trash, unit survives in base healed and exhausted (369.1, 370.1.a.1)", async () => {
    const game = await withHiddenHourglass().build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.reveal("zh");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    expect(game.state("victim").isExhausted).toBe(true);
    expect(game.p2.units("bf1")).toEqual([]);
  });

  // Expected: the draw is linked to the unit ("its controller"), not to the kill action, so a
  // REPLACED kill still lets P2 draw 2 (359.3.e.14.b). Actual: P2 draws 0 (and the caster draws).
  test("A — even though the kill was replaced, the unit's controller P2 still draws 2 (359.3.e.14.b)", async () => {
    const game = await withHiddenHourglass().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.reveal("zh");
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1);
  });

  test("A: Hidden Blade ends in P1's trash after resolving", async () => {
    const game = await withHiddenHourglass().build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.reveal("zh");
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  // ---- Case B: Flash in response -----------------------------------------------------------------

  test("B: P2 may react with Flash while Hidden Blade is pending; Flash resolves first (LIFO) and the unit is in base with the Blade still on the chain", async () => {
    const game = await withFlash().build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.zoneOf("flash")).toBe("trash");
  });

  // Expected: when Hidden Blade resolves its target is no longer "at a battlefield" → mistarget:
  // the kill is ignored and so is the linked draw (359.3.e.5, 359.3.e.14.a). Actual: the engine
  // does not re-check target legality on resolution — the unit is killed in base and a draw happens.
  test("B — the Flashed unit is no longer a legal target: Hidden Blade mistargets, the unit survives in base and nobody draws (359.3.e.5, 359.3.e.14.a)", async () => {
    const game = await withFlash().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p2.trash()).not.toContain("victim");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // spent Flash, drew 0
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // spent Hidden Blade, drew 0
  });

  test("B: P2 draws nothing off a mistargeted Hidden Blade; both spells end in their owners' trash", async () => {
    const game = await withFlash().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "victim" });
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // only Flash left P2's hand
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.trash()).toContain("blade");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.p2.trash()).toContain("flash");
    expect(game.chain()).toEqual([]);
  });
});
