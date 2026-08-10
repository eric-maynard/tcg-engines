/**
 * Ruling 327f01a381c7ea0a — Vanguard Armory (SFD-168 → sfd-168-221) · Gear · Order · 7
 *   "[Exhaust]: Play three 1 [Might] Recruit unit tokens. (You may play them to different locations.)"
 *
 * Q: Can the Armory's Recruit tokens be played onto an OPEN (uncontrolled, empty) battlefield?
 * A: No. Tokens are played to a valid location — your base or a battlefield you already control. An open battlefield
 *    is not controlled by you, and the Armory grants no permission to bypass that.
 * Rules: 439.2.b.1 / 355.2.a (units are played to base or a battlefield you control), 187 (tokens are played).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARMORY = "sfd-168-221";

/** P1's turn: ready Armory in base; bf1 held by P1 (Holder), bf2 OPEN (nobody, no units), bf3 P2's (Sentry). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf3", { might: 2, name: "Sentry" }, "sentry")
    .gear(P1, ARMORY, "armory");
}

const recruitsAt = (game: Game, ids: string[]) => ids.filter((id) => game.state(id).name === "Recruit");

/** Activate the Armory and let the ability resolve up to the first token's destination prompt. */
async function crankToFirstPrompt(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("armory");
  expect(game.state("armory").isExhausted).toBe(true);
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "choose-destination" } });
  return game;
}

describe("Ruling 327f01a381c7ea0a — Vanguard Armory's Recruits cannot be played to an open battlefield", () => {
  test("each token's destination menu is exactly {base, bf1 (controlled)} — the open bf2 and the enemy bf3 are not offered", async () => {
    const game = await crankToFirstPrompt();
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["base", "battlefield-bf1"]);
    expect(keys).not.toContain("battlefield-bf2");
    expect(keys).not.toContain("battlefield-bf3");
  });

  test("naming the open bf2 (or enemy bf3) is rejected; the prompt stays open and no Recruit appears there", async () => {
    const game = await crankToFirstPrompt();
    expect((await game.p1.try((p) => p.pick("battlefield-bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("battlefield-bf3"))).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(recruitsAt(game, game.cardsAt("battlefield-bf2"))).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull();
  });

  test("legal placements resolve normally: bf1, base, bf1 → two Recruits at the controlled bf1, one in base, none at bf2/bf3; bf2 still open", async () => {
    const game = await crankToFirstPrompt();
    for (const dest of ["battlefield-bf1", "base", "battlefield-bf1"]) {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick(dest);
      await game.settle();
    }
    expect(recruitsAt(game, game.p1.units("bf1"))).toHaveLength(2);
    expect(recruitsAt(game, game.p1.base())).toHaveLength(1);
    expect(recruitsAt(game, game.cardsAt("battlefield-bf2"))).toEqual([]);
    expect(recruitsAt(game, game.cardsAt("battlefield-bf3"))).toEqual([]);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: null });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
