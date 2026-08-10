/**
 * Ruling 797aa93e47431fdc — Charm (OGN-043 → ogn-043-298) · [1][calm] "Move an enemy unit."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [2] "[Hidden] If a friendly unit would die, kill this instead. Heal that
 *     unit, exhaust it, and recall it."
 *
 * Q: Opponent Charms my only unit off a battlefield where I have a Hidden card. Does the hidden card stay if I no longer
 *    control that battlefield?
 * A: No — once you don't control the battlefield the hidden card is trashed in the Cleanup after the move. Nuances: you may
 *    REVEAL it as a reaction before that; a revealed Zhonya's can't stay at a battlefield (gear) so it is recalled to base;
 *    and if the charmed unit then dies at its new location, that Zhonya's saves it.
 * Rules: 323 (Cleanup: lose control of an empty battlefield; facedown card there without control → trash), 811 (Hidden /
 *        reveal as Reaction for [0]), 128 (gear lives in base), 369–373 (Zhonya's replacement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const ZHONYAS = "ogn-077-298";

/** P2's turn. P1 controls bfA with its lone Sentinel (3) and a facedown Zhonya's there. P2 controls bfB with a Brute (6); Charm + [1][calm]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 3, name: "Sentinel" }, "sentinel")
    .facedown(P1, "bfA", ZHONYAS, "zh")
    .unit(P2, "bfB", { might: 6, name: "Brute" }, "brute")
    .hand(P2, CHARM, "charm");
}

/** P2 Charms the Sentinel toward `dest`; P2 passes so P1 holds priority with Charm still on the chain. */
async function charmSentinel(dest: "base" | "battlefield-bfB"): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { targets: "sentinel" });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick(dest);
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P2, targets: ["sentinel"] })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 797aa93e47431fdc — Charm away my only unit: the hidden card there is trashed (unless revealed in response)", () => {
  test("Charm resolves (Sentinel → base): bfA is empty → P1 loses control in the Cleanup → the still-hidden Zhonya's is TRASHED", async () => {
    const game = await charmSentinel("base");
    await game.p1.passPriority(); // Charm resolves
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("sentinel")).toBe("base");
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.facedown("bfA")).toEqual([]);
    expect(game.p1.can("reveal", "zh")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("nuance 1+2: P1 may REVEAL the hidden Zhonya's while Charm is on the chain; being gear it cannot sit at a battlefield and ends up in P1's base — so after Charm resolves and bfA is lost, Zhonya's is NOT trashed", async () => {
    const game = await charmSentinel("base");
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(game.p1.energy()).toBe(0); // for [0]
    expect(game.state("zh").isHidden).toBe(false);
    await game.settle(); // anything of Zhonya's, then Charm
    expect(game.zoneOf("sentinel")).toBe("base");
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.zoneOf("zh")).toBe("base"); // recalled to base, in play
    expect(game.p1.gear()).toContain("zh");
    expect(game.violations()).toEqual([]);
  });

  test("nuance 3: Charm sends the Sentinel INTO P2's Brute (6) at bfB; the revealed Zhonya's (in base) saves it when it would die — Zhonya's is killed instead, Sentinel healed, exhausted, recalled to base", async () => {
    const game = await charmSentinel("battlefield-bfB");
    await game.p1.reveal("zh");
    // Let everything resolve: Zhonya's settles into base, Charm moves Sentinel to bfB → combat 3 into 6 → Sentinel 'would die'.
    for (let i = 0; i < 4; i++) {
      const r = await game.settle();
      if (r.reason !== "open" || !(game.gameState.interaction?.showdownStack ?? []).some((s) => s.active)) {
        break;
      }
    }
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("sentinel")).toBe("base"); // recalled, not dead
    expect(game.state("sentinel")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("brute")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.gameState.battlefields.bfA?.controller).toBeNull(); // and bfA was still lost
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
