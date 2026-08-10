/**
 * Ruling b98b300f7b46ddc0 — Frigid Jewel (UNL-074 → unl-074-219) × Gust (OGN-169 → ogn-169-298)
 *   Frigid Jewel (gear): "When you draw your second card each turn, give a friendly unit +2 [Might] this turn."
 *   Gust ([1], [Reaction]): "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (draw source used here: Downstage Dramatics, unl-061-219 — "[Reaction] [Repeat][2] Draw 1.")
 *
 * Q: Opponent goes to a showdown with a 3-Might unit, then draws their 2nd card — can I answer the Frigid Jewel trigger
 *    with Gust on that unit?
 * A: Yes. The Jewel's triggered ability goes on the chain (Closed state) and I get priority to play a Reaction. LIFO: Gust
 *    resolves first (the unit is 3 Might → legal) and returns it to hand; the Jewel then resolves and, its unit no longer on
 *    the battlefield, does nothing.
 * Rules: 383 (triggered ability is a chain item), 330–332 (Closed state → priority passes), 336–340 / 359.3.e.7 (LIFO),
 *        355.12 (target gone → no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FRIGID_JEWEL = "unl-074-219";
const DOWNSTAGE_DRAMATICS = "unl-061-219";
const GUST = "ogn-169-298";

/**
 * P2's turn ("my opponent"). P2: Frigid Jewel in base, a single 3-Might Scout in base, Downstage Dramatics in hand and
 * exactly 4 energy (Draw 1 + Repeat = two draws). P1 holds bf1 with a 4-Might Anchor and has Gust + exactly 1 energy.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 4 })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Anchor" }, "anchor")
    .gear(P2, FRIGID_JEWEL, "jewel")
    .unit(P2, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P2, DOWNSTAGE_DRAMATICS, "dd")
    .hand(P1, GUST, "gust");
}

/** Scout attacks bf1 (showdown), P2 double-draws in the showdown → the Jewel triggers onto the chain (→ Scout, P2's only unit). */
async function jewelTriggersInShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("scout", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("dd", { repeat: 1 });
  expect(game.p2.energy()).toBe(0);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Dramatics resolves: draw, draw → "your second card this turn"
  expect(game.p2.hand()).toHaveLength(2);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jewel", controller: P2, triggered: true })]);
  return game;
}

describe("Ruling b98b300f7b46ddc0 — Gust in response to Frigid Jewel's trigger bounces the 3-Might unit; the Jewel then does nothing", () => {
  test("the Jewel's trigger is a chain item (Closed state): after P2 passes, P1 has priority and Gust on the 3-Might Scout at bf1 is legal", async () => {
    const game = await jewelTriggersInShowdown();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(true);
    expect(game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options).toEqual([["scout"]]);
    await game.p1.cast("gust", { targets: "scout" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["jewel", "gust"]);
    expect(game.state("scout").might).toBe(3); // nothing has resolved yet
  });

  test("LIFO: Gust resolves first and returns Scout (still 3 Might → legal) to P2's hand; the Jewel then resolves with its unit gone — no +2 lands anywhere, no prompt", async () => {
    const game = await jewelTriggersInShowdown();
    await game.p2.passPriority();
    await game.p1.cast("gust", { targets: "scout" });
    await game.acting().passPriority();
    await game.acting().passPriority(); // Gust
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.hand()).toContain("scout");
    expect(game.chain().map((c) => c.cardId)).toEqual(["jewel"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Jewel: no effect
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.state("scout").might).toBe(3);
    expect(game.state("anchor").might).toBe(4); // certainly not an enemy unit either
    expect(game.decision()?.kind).toBe("action"); // no dangling pick for the Jewel
    expect(game.p2.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control — no Gust: the Jewel resolves and Scout at bf1 becomes 5 Might this turn", async () => {
    const game = await jewelTriggersInShowdown();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("scout")).toMatchObject({ location: "bf1", might: 5 });
  });
});
