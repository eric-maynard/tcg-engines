/**
 * Ruling 937445914f19dd7c — Portal Rescue (OGN-102 → ogn-102-298) · [Action] · 3 + [mind]
 *     "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *   × Harnessed Dragon (OGN-234 → ogn-234-298) · 8 + [order][order] · 6 Might · "When you play me, kill an enemy unit."
 *
 * Q: What is Portal Rescue for?
 * A: It is an Action, so with Focus in a combat showdown you can pull out a unit you're about to lose (it comes back
 *    in your base, free) — and because the unit is PLAYED again its "When you play me" ability triggers a second
 *    time; e.g. rescuing Harnessed Dragon kills the attacker and the opponent takes nothing.
 * Rules: 333 (Actions playable with Focus in a showdown), 350/399 (a play by effect is a play → play triggers), 356.1.b.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PORTAL_RESCUE = "ogn-102-298";
const HARNESSED_DRAGON = "ogn-234-298";

/**
 * Turn 3, P2 active. P1 holds bf1 with Harnessed Dragon (6) and has exactly 3 + [mind] (nowhere near the Dragon's own
 * 8 + [order][order]). P2: Titan (9) and a Minion (1) in base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", HARNESSED_DRAGON, "dragon")
    .unit(P2, "base", { might: 9, name: "Titan" }, "titan")
    .unit(P2, "base", { might: 1, name: "Minion" }, "minion")
    .hand(P1, PORTAL_RESCUE, "portal");
}

/** Titan attacks bf1; P2 passes Focus; P1 Portal-Rescues the Dragon and the spell resolves. Stops at the Dragon's kill prompt. */
async function rescueTheDragon(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("titan", "bf1");
  await game.p2.passFocus();
  await game.p1.cast("portal", { targets: "dragon" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["portal"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 937445914f19dd7c — Portal Rescue mid-combat saves the unit and re-fires its play trigger", () => {
  test("timing: during P2's attack P1 cannot cast Portal Rescue until it holds Focus; once P2 passes Focus it can", async () => {
    const game = await board().build();
    await game.p2.move("titan", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "portal")).toBe(false);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "portal")).toBe(true);
  });

  test("resolving it: the 6-Might Dragon (about to lose to the 9-Might Titan) leaves the battlefield and is PLAYED to P1's base for free — and its 'When you play me' triggers again, asking P1 for an enemy unit to kill", async () => {
    const game = await rescueTheDragon();
    expect(game.zoneOf("portal")).toBe("trash");
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // 8 + [order][order] ignored
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "dragon" } });
    const offered = game.decision()?.kind === "pick" ? (game.decision() as { options: { card?: string; key: string }[] }).options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["minion", "titan"]);
  });

  test("ruling 937445914f19dd7c — picking the attacking Titan: it dies, the combat fizzles, P2 conquers nothing and scores 0; the Dragon is safe in base", async () => {
    const game = await rescueTheDragon();
    await game.p1.pick("titan");
    await game.settle();
    expect(game.zoneOf("titan")).toBe("trash");
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.state("dragon").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: without the rescue the Titan (9) kills the Dragon (6) and P2 conquers bf1 (+1)", async () => {
    const game = await board().build();
    await game.p2.move("titan", "bf1");
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
