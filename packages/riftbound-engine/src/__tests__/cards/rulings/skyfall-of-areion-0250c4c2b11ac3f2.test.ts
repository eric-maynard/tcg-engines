/**
 * Ruling 0250c4c2b11ac3f2 — Skyfall of Areion (SFD-030 → sfd-030-221) · Equipment · +2 Might "[Equip] [1][fury] …
 *   My hold effects are also conquer effects, and vice versa."
 *   × Yone, Blademaster (SFD-116 → sfd-116-221) · 5 Might "[Weaponmaster] When I conquer a battlefield that was
 *     uncontrolled, deal damage equal to my Might to an enemy unit in a base."
 *   × Reckoner's Arena (OGN-286 → ogn-286-298) · Battlefield "When you hold here, activate the conquer effects of
 *     units here."
 *
 * Q: Does Skyfall of Areion make Yone's ability trigger on holds?
 * A: No. Skyfall lets his conquer effect also fire on a hold, but a standard hold is of a battlefield you already
 *    control, so "that was uncontrolled" can never be met (464.2). It still fires on every conquer of an
 *    uncontrolled battlefield. Not even Reckoner's Arena ("activate the conquer effects of units here") gets
 *    him there: activation only treats the conquer part of the condition as fulfilled (383.4.g.1), and the
 *    "was uncontrolled" part is still false during a hold.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SKYFALL = "sfd-030-221";
const YONE = "sfd-116-221";
const RECKONERS_ARENA = "ogn-286-298";

/** End of P2's turn 2; P1's Yone (wearing Skyfall, 5 + 2 = 7) already stands on P1's bf1 → P1 HOLDS it as P1's turn begins. P2's Big (9) sits in P2's base. */
function holdBoard(bfDef?: string) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1, ...(bfDef ? { def: bfDef, inert: false } : {}) })
    .unit(P1, "bf1", YONE, "yone", { equippedWith: ["skyfall"] })
    .card("skyfall", { def: SKYFALL, meta: { attachedTo: "yone" }, owner: P1, zone: "bf1" })
    .unit(P2, "base", { might: 9, name: "Big" }, "big");
}

/** Step from P2's endTurn through P1's Beginning Phase, recording every chain item seen, until P1's open main phase. */
async function throughP1Beginning(game: Game): Promise<string[]> {
  const seen: string[] = [];
  await game.p2.endTurn();
  for (let i = 0; i < 20; i++) {
    for (const c of game.chain()) {
      const tag = `${c.cardId}/${c.controller}`;
      if (!seen.includes(tag)) {
        seen.push(tag);
      }
    }
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.options.length > 0) {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling 0250c4c2b11ac3f2 — Skyfall of Areion does not make Yone, Blademaster trigger on holds", () => {
  test("premise: Yone wears Skyfall (5 + 2 = 7) on P1's own bf1", async () => {
    const game = await holdBoard().build();
    expect(game.state("skyfall").attachedTo).toBe("yone");
    expect(game.state("yone").might).toBe(7);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("standard HOLD with Skyfall-equipped Yone: P1 scores the hold point, but Yone's ability never goes on the chain and no enemy unit is damaged ('was uncontrolled' cannot be met on a hold)", async () => {
    const game = await holdBoard().build();
    expect(game.p1.points()).toBe(0);
    const seen = await throughP1Beginning(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // the hold happened
    expect(seen).not.toContain("yone/player-1");
    expect(game.state("big").damage).toBe(0);
    expect(game.zoneOf("big")).toBe("base");
  });

  test("CONQUER of an uncontrolled battlefield with Skyfall-equipped Yone: his ability triggers and deals his Might (7, Skyfall included) to the enemy unit in base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", YONE, "yone", { equippedWith: ["skyfall"] })
      .card("skyfall", { def: SKYFALL, meta: { attachedTo: "yone" }, owner: P1, zone: "base" })
      .unit(P2, "base", { might: 9, name: "Big" }, "big")
      .build();
    await game.p1.move("yone", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus(); // showdown ends → conquer
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yone", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("skyfall").attachedTo).toBe("yone"); // equipment travels with him
    expect(game.state("big").damage).toBe(7);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: conquering a battlefield that was CONTROLLED (taken from P2 in combat) does not trigger Yone either", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "bump")
      .unit(P1, "base", YONE, "yone", { equippedWith: ["skyfall"] })
      .card("skyfall", { def: SKYFALL, meta: { attachedTo: "yone" }, owner: P1, zone: "base" })
      .unit(P2, "base", { might: 9, name: "Big" }, "big")
      .build();
    await game.p1.move("yone", "bf1");
    await game.settle();
    expect(game.zoneOf("bump")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("big").damage).toBe(0);
  });

  test("even Reckoner's Arena does not get Yone there: holding THERE puts the Arena's 'activate the conquer effects of units here' trigger on the chain, but activating a conquer effect only treats the CONQUER part as fulfilled — Yone's 'that was uncontrolled' is a non-conquer part of his condition and is false on a hold", async () => {
    const game = await holdBoard(RECKONERS_ARENA).build();
    const seen = await throughP1Beginning(game);
    expect(game.p1.points()).toBe(1);
    expect(seen[0]).toBe("bf1/player-1"); // the Arena's hold trigger — the bridge
    // rule 383.4.g.1 — "if any of the non-conquer parts of the condition are not fulfilled, it will not
    // be placed on the chain"; a hold is of a battlefield you already control (rule 464.2).
    expect(seen).not.toContain("yone/player-1");
    expect(game.state("big").damage).toBe(0);
  });
});
