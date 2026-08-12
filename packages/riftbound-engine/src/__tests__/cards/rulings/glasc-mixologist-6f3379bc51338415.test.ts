/**
 * Ruling 6f3379bc51338415 — Glasc Mixologist (SFD-165 → sfd-165-221) · Unit · Order · [5][order] · 5 Might
 *   "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your
 *    trash, ignoring its cost."
 *
 * Q: My Mixologist attacks and dies. May its Deathknell play a unit from my trash into that same
 *    battlefield, attacking, before the showdown ends?
 * A: No. As the attacker you do NOT control that battlefield — control is only established once you
 *    conquer it — so you have no permission to play a unit there. The unit goes to your base instead.
 *    A DEFENDING Mixologist is different: its controller already controls the battlefield, so it may.
 * Rules: 190.4 (control), 419.1.a / 366.1 (a unit may only be played where you have permission —
 *        base, or a battlefield you control), 190.4.b (a defender's control is frozen during the combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIXOLOGIST = "sfd-165-221";
const RECRUIT = { cardType: "unit", energyCost: 1, might: 2, name: "Recruit" };

/**
 * Settle to the end, answering the Deathknell dialog (opt-in → pick from trash → destination) and
 * reporting every destination the engine offered for the replacement unit ([] = it was never asked,
 * i.e. exactly one legal location).
 */
async function runDeathknell(game: Game): Promise<string[]> {
  const destinations: string[] = [];
  for (let i = 0; i < 14; i++) {
    const stop = await game.settle();
    const d = game.decision();
    if (stop.reason !== "unanswered" || !d) break;
    if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "pick") {
      if (d.semantics === "destination") destinations.push(...d.options.map((o) => o.zone ?? o.key));
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else {
      break;
    }
  }
  return destinations;
}

describe("Ruling 6f3379bc51338415 — an ATTACKING Mixologist's Deathknell cannot play its replacement into the contested battlefield", () => {
  test("Mixologist attacks bf1, dies to the two Guards, and the Deathknell's unit is NOT offered bf1 — it lands in P1's base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Guard A" }, "guardA")
      .unit(P2, "bf1", { might: 6, name: "Guard B" }, "guardB")
      .unit(P1, "base", MIXOLOGIST, "mixo")
      .trash(P1, RECRUIT, "recruit")
      .build();
    await game.p1.move("mixo", "bf1");
    expect(game.state("mixo").combatRole).toBe("attacker");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the attacker never controls it

    const destinations = await runDeathknell(game); // combat damage (12 onto a 5-Might Mixologist), then the Deathknell
    expect(game.zoneOf("mixo")).toBe("trash");

    // Only P1's base is a legal location, so no destination is even offered — and never bf1.
    expect(destinations.some((z) => z.includes("bf1"))).toBe(false);
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.locationOf("recruit")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a DEFENDING Mixologist's controller still controls the battlefield (190.4.b), so bf1 IS an offered destination", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", MIXOLOGIST, "mixo")
      .unit(P1, "base", { might: 6, name: "Striker" }, "striker")
      .trash(P2, RECRUIT, "recruit")
      .build();
    await game.p1.move("striker", "bf1");
    expect(game.state("mixo").combatRole).toBe("defender");

    const destinations = await runDeathknell(game); // combat damage (6 onto the 5-Might Mixologist), then the Deathknell
    expect(game.zoneOf("mixo")).toBe("trash");
    expect(destinations).toContain("base");
    expect(destinations).toContain("battlefield-bf1"); // P2 still controls bf1 during the combat
    expect(game.violations()).toEqual([]);
  });
});
