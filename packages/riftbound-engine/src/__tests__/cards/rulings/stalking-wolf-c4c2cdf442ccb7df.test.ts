/**
 * Ruling c4c2cdf442ccb7df — Stalking Wolf (UNL-166 → unl-166-219) 6 Might [4][order] "[Ambush] As an additional cost to play me, kill
 *   a Bird, Cat, Dog, or Poro you control. You may play me to its battlefield (even if you don't have other units there)."
 *   × Bird token (UNL-T02 → unl-t02) 1 Might · Bird · [Deflect].
 *
 * Q: Can I play Stalking Wolf to a DIFFERENT location than the battlefield of the pet I killed to pay for it?
 * A: Yes. "You MAY play me to its battlefield" is an extra option, not a restriction — the Wolf can instead go to any other legal
 *    destination (base, or a battlefield where you have units). Ambush likewise lets it be played as a Reaction to a battlefield
 *    where you have units, independent of where the cost was paid.
 * Rules: 356 (additional cost), 419.3 (legal play destinations), 822 (Ambush).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STALKING_WOLF = "unl-166-219";
const BIRD = "unl-t02";

/** P1's turn with [4][order]. P1: Bird token alone at bf1, Sentry (3) at bf2, nothing in base but the Wolf in hand. P2 holds bf3. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", BIRD, "bird")
    .unit(P1, "bf2", { might: 3, name: "Sentry" }, "sentry")
    .unit(P2, "bf3", { might: 2, name: "Guard" }, "guard")
    .hand(P1, STALKING_WOLF, "wolf");
}

/** Destinations offered for the Wolf, normalised to bare location ids ("base", "bf1", …). */
const destinations = (game: Game) =>
  ((game.p1.option("play", "wolf")?.fields.find((f) => f.arg === "to")?.options as string[] | undefined) ?? [])
    .map((z) => (z.startsWith("battlefield-") ? z.slice("battlefield-".length) : z))
    .toSorted();

describe("Ruling c4c2cdf442ccb7df — the Wolf need not be played where its sacrificed pet was", () => {
  test("the play menu: the Bird is the only sacrifice, and the destinations on offer are base, bf1 (the Bird's battlefield) AND bf2 (where P1 has the Sentry) — not the enemy bf3", async () => {
    const game = await board().build();
    const sac = (game.p1.option("play", "wolf")?.fields.find((f) => f.arg === "sacrifice")?.options as string[] | undefined) ?? [];
    expect(sac).toEqual(["bird"]);
    expect(destinations(game)).toEqual(["base", "bf1", "bf2"]);
  });

  test("kill the Bird at bf1, play the Wolf to BASE: legal — Bird gone (token ceases to exist), Wolf in base, [4][order] paid", async () => {
    const game = await board().build();
    await game.p1.play("wolf", { sacrifice: "bird", to: "base" });
    await game.settle();
    expect(game.zoneOf("bird")).toBe("gone");
    expect(game.zoneOf("wolf")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("kill the Bird at bf1, play the Wolf to bf2 (another battlefield where P1 has units): legal too", async () => {
    const game = await board().build();
    await game.p1.play("wolf", { sacrifice: "bird", to: "bf2" });
    await game.settle();
    expect(game.zoneOf("bird")).toBe("gone");
    expect(game.locationOf("wolf")).toBe("bf2");
    expect(new Set(game.p1.units("bf2"))).toEqual(new Set(["sentry", "wolf"]));
  });

  test("and of course 'its battlefield' (bf1) works even though the Bird was P1's only unit there", async () => {
    const game = await board().build();
    await game.p1.play("wolf", { sacrifice: "bird", to: "bf1" });
    await game.settle();
    expect(game.locationOf("wolf")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Ambush nuance: on P2's turn, when P2 attacks bf2, P1 (with Focus) may play the Wolf as a Reaction TO bf2 — where the Sentry is — while paying with the Bird over at bf1", async () => {
    const game = await board().active(P2).unit(P2, "base", { might: 4, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "wolf")).toBe(true);
    expect(destinations(game)).toContain("bf2");
    await game.p1.play("wolf", { sacrifice: "bird", to: "bf2" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("bird")).toBe("gone");
    expect(game.locationOf("wolf")).toBe("bf2");
    expect(game.state("wolf").combatRole).toBe("defender");
  });
});
