/**
 * Ruling eeb1f5e2d1482751 — Mageseeker Warden (OGN-070 → ogn-070-298) · Unit · Calm · 6 · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. While I'm at a battlefield, spells and abilities
 *      can't ready enemy units and gear."
 *   × Warwick, Hunter (OGN-159 → ogn-159-298) "I enter ready. …" · Magma Wurm (OGN-011 → ogn-011-298) "Other friendly units enter ready."
 *   × Kai'Sa, Survivor (ogn-039-298) [Accelerate] · Wallop (OGN-146 → ogn-146-298) "Ready a unit." · First Mate (OGN-132 → ogn-132-298)
 *     "When you play me, ready another unit." (Mistfall OGN-152 is the third "ready" example; same class as these two.)
 *
 * Q: Does Mageseeker Warden stop "I enter ready" units (Master Yi, Warwick) from entering ready?
 * A: No. "Enter ready" (incl. Magma Wurm's grant and Accelerate) makes the unit arrive already ready — it is never readied while
 *    on the board. Warden only stops effects that ready an EXHAUSTED enemy unit (Wallop, First Mate, Mistfall).
 * Rules: 143.4 (units enter exhausted unless "enter ready"), 805 (Accelerate), Warden's restriction = "can't ready" (a transition).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MAGESEEKER_WARDEN = "ogn-070-298";
const WARWICK = "ogn-159-298";
const MAGMA_WURM = "ogn-011-298";
const KAISA_SURVIVOR = "ogn-039-298";
const WALLOP = "ogn-146-298";
const FIRST_MATE = "ogn-132-298";
const GRUNT = { cardType: "unit", energyCost: 1, might: 2, name: "Grunt" } as const;

/**
 * P2's turn with plenty of resources. P1's Mageseeker Warden stands at bf1 (P1's). P2 has an EXHAUSTED Sleepy (2) in base and
 * Warwick, Kai'Sa, Wallop, First Mate and a Grunt in hand.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 12, power: { body: 1, fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", MAGESEEKER_WARDEN, "warden")
    .unit(P2, "base", { might: 2, name: "Sleepy" }, "sleepy", { exhausted: true })
    .hand(P2, WARWICK, "ww")
    .hand(P2, KAISA_SURVIVOR, "kaisa")
    .hand(P2, WALLOP, "wallop")
    .hand(P2, FIRST_MATE, "mate")
    .hand(P2, GRUNT, "grunt");
}

describe("Ruling eeb1f5e2d1482751 — Mageseeker Warden blocks 'ready an exhausted enemy', not 'enters ready'", () => {
  test("premise: Warden is at a battlefield and its statics are live (P2 may only play units to base)", async () => {
    const game = await board().build();
    expect(game.locationOf("warden")).toBe("bf1");
    const loc = game.p2.option("playUnit", "ww")?.fields.find((f) => f.name === "location");
    expect(loc?.options).toEqual(["base"]);
  });

  test("Warwick 'I enter ready' — played under Warden he still enters READY", async () => {
    const game = await board().build();
    await game.p2.play("ww");
    await game.settle();
    expect(game.state("ww")).toMatchObject({ isReady: true, zone: "base" });
  });

  test("Magma Wurm's 'Other friendly units enter ready' — a Grunt played under Warden enters READY", async () => {
    const game = await board().unit(P2, "base", MAGMA_WURM, "wurm").build();
    await game.p2.play("grunt");
    await game.settle();
    expect(game.state("grunt")).toMatchObject({ isReady: true, zone: "base" });
  });

  test("Accelerate — Kai'Sa played with the extra [1][fury] enters READY under Warden", async () => {
    const game = await board().build();
    await game.p2.play("kaisa", { accelerate: true });
    await game.settle();
    expect(game.state("kaisa")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p2.resources()).toEqual({ energy: 7, power: { body: 1, fury: 1 } }); // 4 + 1, and one fury
  });

  test("Wallop ('Ready a unit') on the exhausted Sleepy IS stopped: the spell resolves to the trash but Sleepy stays exhausted", async () => {
    const game = await board().build();
    await game.p2.cast("wallop", { targets: "sleepy" });
    await game.settle();
    expect(game.zoneOf("wallop")).toBe("trash");
    expect(game.state("sleepy").isExhausted).toBe(true);
  });

  test("First Mate ('When you play me, ready another unit') choosing Sleepy IS stopped: Sleepy stays exhausted", async () => {
    const game = await board().build();
    await game.p2.play("mate");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, timing: "FIN" });
    await game.p2.pick("sleepy");
    await game.settle();
    expect(game.zoneOf("mate")).toBe("base");
    expect(game.state("sleepy").isExhausted).toBe(true);
  });

  test("control — with NO Warden on a battlefield, the same Wallop readies Sleepy", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .unit(P1, "base", MAGESEEKER_WARDEN, "wardenHome") // in base: "While I'm at a battlefield" is off
      .unit(P2, "base", { might: 2, name: "Sleepy" }, "sleepy", { exhausted: true })
      .hand(P2, WALLOP, "wallop")
      .build();
    await game.p2.cast("wallop", { targets: "sleepy" });
    await game.settle();
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
