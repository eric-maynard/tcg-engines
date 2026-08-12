/**
 * Ruling 8585121969344bda — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · [12][body]×4 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units.
 *      When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *
 * Q: Does "each location" include the enemy BASE?
 * A: Yes. A base is a location, so an enemy unit sitting in the opponent's base is a legal choice and takes its 1
 *    (which, thanks to the Dragon's other line, is lethal).
 * Rules: 107.1.b (a base is a location), 355.13 ("up to one … at each location"), Elder Dragon's lethal-damage static.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";

const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** P1's turn, exactly [12] + [body]×4. P2 has a Sentry at P2's bf1 and a Homebody in P2's BASE. */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 6, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, ELDER_DRAGON, "dragon");
}

/** Play the Dragon and take every offer, returning the union of everything that was ever offered. */
async function playAndTakeAll(game: Game): Promise<string[]> {
  const seen = new Set<string>();
  await game.p1.play("dragon", { to: "base" });
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    const keys = offered(d);
    for (const k of keys) {
      seen.add(k);
    }
    const wanted = ["sentry", "home"].filter((k) => keys.includes(k));
    if (wanted.length === 0) {
      await game.p1.decline();
    } else {
      await game.p1.pick(...wanted.slice(0, Math.max(1, Math.min(wanted.length, d.max))));
    }
  }
  await game.settle();
  return [...seen].sort();
}

describe("Ruling 8585121969344bda — the enemy base counts as a location for Elder Dragon", () => {
  test("ruling 8585121969344bda — the unit in P2's BASE is offered alongside the one at the battlefield (and P1's own Ally never is)", async () => {
    const game = await board().build();
    const seen = await playAndTakeAll(game);
    expect(seen).toContain("home"); // enemy base is a location
    expect(seen).toContain("sentry");
    expect(seen).not.toContain("ally"); // "enemy unit"
    expect(seen).not.toContain("dragon");
  });

  test("…and it actually takes the damage: the 6-Might Homebody in base dies to the 1, exactly like the Sentry at bf1", async () => {
    const game = await board().build();
    await playAndTakeAll(game);
    expect(game.zoneOf("home")).toBe("trash"); // "any amount of your damage is enough"
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("a base-only board still gives the Dragon a location to hit: the lone base unit is chosen (a sole option is still a choice) and dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 12, power: { body: 4 } })
      .unit(P2, "base", { might: 6, name: "Homebody" }, "home")
      .hand(P1, ELDER_DRAGON, "dragon")
      .build();
    await game.p1.play("dragon", { to: "base" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "dragon" } });
    expect(offered(game.decision())).toEqual(["home"]);
    await game.p1.pick("home");
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
