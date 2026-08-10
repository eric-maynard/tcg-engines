/**
 * Ruling a5f9b2b85a84bea7 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: If you play Zhonya's from hidden, can it affect units at any battlefield?
 * A: Yes. Its effect does not target, so the from-hidden "choose only here" restriction does not bind it — a Zhonya's
 *    flipped at battlefield 1 still saves a friendly unit dying at battlefield 2 (or anywhere on the board).
 * Rules: 811 (Hidden: play from facedown as a Reaction; targeting limited to "here"), 366–373 (replacement effects do not
 *        target/choose), 355 (only chosen targets are restricted).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
/** P2's removal: deal 6 to a unit (kills any of P1's units here). */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2's turn 3. P1 holds bf1 (Sentinel + facedown Zhonya's) and bf2 (Far Ally); Home Ally in base. P2 has Bolt + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .unit(P1, "bf2", { might: 2, name: "Far Ally" }, "far")
    .unit(P1, "base", { might: 2, name: "Home Ally" }, "home")
    .hand(P2, BOLT, "bolt");
}

describe("Ruling a5f9b2b85a84bea7 — Zhonya's flipped from hidden at bf1 saves a friendly unit anywhere (it doesn't target)", () => {
  test("Bolt at the bf2 unit; P1 flips the bf1-hidden Zhonya's in response (for [0]); Bolt resolves → the bf2 unit would die → Zhonya's is killed instead and the unit is healed, exhausted and recalled to base", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "far" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    expect(game.p1.energy()).toBe(0); // played from hidden for [0]
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("far")).toBe("base"); // saved from ANOTHER battlefield than where Zhonya's was hidden
    expect(game.state("far")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.trash()).not.toContain("far");
    expect(game.violations()).toEqual([]);
  });

  test("likewise for a friendly unit in BASE: the flipped Zhonya's replaces that death too", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "home" });
    await game.p2.passPriority();
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.state("home")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("contrast — left face down, Zhonya's has no effect: the bf2 unit simply dies", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "far" });
    await game.settle();
    expect(game.zoneOf("far")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
  });
});
