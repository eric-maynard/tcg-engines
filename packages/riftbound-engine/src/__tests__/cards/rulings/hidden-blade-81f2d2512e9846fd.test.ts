/**
 * Ruling 81f2d2512e9846fd — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · 2 + [order]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Flurry of Blades (OGN-133 → ogn-133-298) · Reaction "Deal 1 to all units at battlefields."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that unit,
 *     exhaust it, and recall it."
 *
 * Q: I Hidden Blade a unit and my opponent kills it with a spell on the chain before the Blade resolves — does its
 *    controller still draw 2?
 * A: No: killed BEFORE resolution → the target is illegal when the Blade resolves, no controller can be determined,
 *    nobody draws. Contrast: if the unit is moved away by a REPLACEMENT effect (Zhonya's/Sett) DURING the Blade's
 *    resolution, the controller captured at the start of resolution still draws 2.
 * Rules: 359.3.f.2 / 355.11 (target legality re-checked on resolution; dependent instruction skipped),
 *        372–373 (replacement during resolution), 359.3.e.14.b.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FLURRY_OF_BLADES = "ogn-133-298";
const ZHONYAS = "ogn-077-298";
const FILLER = "ogn-175-298";

/**
 * P1's turn. P1 holds bf1 with a 1-Might Page (and, in the Zhonya's case, a 3-Might Brawler + a face-up Hourglass in
 * base). P1: Hidden Blade with exactly 2 + [order]; known deck top d1..d3. P2: Flurry of Blades with 1 + [body].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Page" }, "page")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, FLURRY_OF_BLADES, "flurry")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
}

describe("Ruling 81f2d2512e9846fd — Hidden Blade: target killed in response → no draw; death replaced during resolution → still draw 2", () => {
  test("P1 Blades its own Page (to draw 2); P2 answers with Flurry of Blades, which resolves first and KILLS the 1-Might Page while the Blade still waits", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "page" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "flurry")).toBe(true);
    await game.p2.cast("flurry");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flurry"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.zoneOf("page")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["page"] })]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("…Hidden Blade then resolves against an illegal (dead) target: nothing more is killed and NOBODY draws — P1's hand stays empty, deck untouched", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "page" });
    await game.p1.passPriority();
    await game.p2.cast("flurry");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — replacement DURING resolution: P1 Blades its own Brawler with a face-up Zhonya's in base; the Hourglass dies instead, Brawler is recalled exhausted — and P1 STILL draws 2", async () => {
    const game = await board().unit(P1, "bf1", { might: 3, name: "Brawler" }, "brawler").gear(P1, ZHONYAS, "hourglass").build();
    await game.p1.cast("blade", { targets: "brawler" });
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.state("brawler")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control — no response at all: the Page dies to the Blade and P1 (its controller) draws 2", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "page" });
    await game.settle();
    expect(game.zoneOf("page")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
  });
});
