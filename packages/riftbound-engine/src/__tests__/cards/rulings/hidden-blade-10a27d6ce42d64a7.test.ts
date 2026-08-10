/**
 * Ruling 10a27d6ce42d64a7 — Hidden Blade (OGN-213 → ogn-213-298, Action, 2 + [order])
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Tideturner (ogn-199-298, 2 Might, [Hidden]) "When you play me, you may choose a unit you control at another
 *     location. Move me to its location and it to my original location."
 *   (+ Flash ogs-011-024 "Move up to 2 friendly units to base." for the "no longer at ANY battlefield" nuance)
 *
 * Q: Hidden Blade targets a unit at battlefield 1; in response Tideturner swaps it to battlefield 2. Still killed?
 * A: Yes. Hidden Blade declares a UNIT (that must be at a battlefield), not a battlefield. After the swap the unit is
 *    still "a unit at a battlefield" (bf2) → it is killed there and its controller draws 2. Only if it is no longer at
 *    ANY battlefield (e.g. moved to base) is the target illegal — then no kill and no draw.
 * Rules: 355.7/355.8 (target = the unit), 359.3.e.2/359.3.e.5 (legality re-checked on resolution against the same
 *        requirement), 359.3.e.14.a (linked "its controller draws 2" ignored when the kill is), 811 (Hidden → Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const TIDETURNER = "ogn-199-298";
const FLASH = "ogs-011-024";

/**
 * P1's turn. P2 holds bf1 (Victim, 3) and bf2 (Guard, 1, with Tideturner facedown there since an earlier turn).
 * P1: Hidden Blade, exactly 2 + [order]. P2: Flash in hand + 2 energy (only for the contrast).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf2", { might: 1, name: "Guard" }, "guard")
    .facedown(P2, "bf2", TIDETURNER, "tt")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, FLASH, "flash");
}

/** Blade on Victim; P1 passes; P2 flips Tideturner at bf2, accepts the swap with Victim; the swap trigger resolves. */
async function bladeThenSwap(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "victim" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["victim"] })]);
  await game.p1.passPriority();
  expect(game.p2.can("reveal", "tt")).toBe(true);
  await game.p2.reveal("tt");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "tt" }, timing: "FIN" });
  await game.p2.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2) {
    await game.p2.pick("victim"); // Guard shares Tideturner's location, so Victim is the only "another location" unit
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "tt"]);
  expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["victim"], triggered: true });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Tideturner's swap resolves (LIFO)
  return game;
}

describe("Ruling 10a27d6ce42d64a7 — Hidden Blade follows its target unit to another battlefield", () => {
  test("in response to Hidden Blade, P2's flipped Tideturner swaps places with the targeted Victim: Victim bf1 → bf2, Tideturner bf2 → bf1, with the Blade still pending on Victim", async () => {
    const game = await bladeThenSwap();
    expect(game.locationOf("victim")).toBe("bf2");
    expect(game.locationOf("tt")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["victim"] })]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf2"); // still "a unit at a battlefield"
  });

  test("Hidden Blade then resolves and STILL kills Victim at its new battlefield (bf2); its controller P2 draws 2; P1 draws nothing", async () => {
    const game = await bladeThenSwap();
    const p2Hand = game.p2.hand().length;
    const p1Hand = game.p1.hand().length;
    const p2Deck = game.p2.deck().length;
    await game.acting().passPriority();
    await game.acting().passPriority(); // Blade resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p2.deck()).toHaveLength(p2Deck - 2);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.locationOf("tt")).toBe("bf1");
    expect(game.locationOf("guard")).toBe("bf2");
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: if instead the target leaves ALL battlefields (P2 Flashes Victim to base), the target is illegal on resolution — no kill and NOBODY draws", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "victim" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // Flash left, nothing drawn
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // Blade left, nothing drawn
  });
});
