/**
 * Ruling e4b1cc9578599903 — Portal Rescue (OGN-102 → ogn-102-298) · Spell · Mind · 3+[mind] · Action
 *     "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *   (× Possession ogn-203-298 — cited only as the contrast: Possession changes control, Portal Rescue does not.)
 *
 * Q: In 2v2, if I Portal Rescue a TEAMMATE's unit, whose base does it go to and who counts as playing it?
 * A: Its owner's (the teammate's) base, and the teammate is the player who plays it — not the caster. Ownership never
 *    changes (unlike Possession).
 * Rules: 489.8.e / 740.1.a (in team modes "friendly" includes a teammate's objects), 346 (playing a card), 105 (owner).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, P4, scenario } from "../../../harness";
import { peekCurrentState, replaceCurrentState } from "../../../harness/internal";

const PORTAL_RESCUE = "ogn-102-298";

/**
 * 2v2 (Magma Chamber seating P1+P3 vs P2+P4), P1's turn with exactly 3+[mind]. P1's Own (2) in P1's base; teammate P3's
 * Mate (2) exhausted at bf1 (P3's); opponent P2's Victim in P2's base. The builder has no team knob, so the 489.2 team map
 * is seeded onto the built state (setup only).
 */
async function teamBoard(): Promise<Game> {
  const game = await scenario({ players: 4 })
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P3 })
    .unit(P3, "bf1", { energyCost: 2, might: 2, name: "Mate" }, "mate", { exhausted: true })
    .unit(P1, "base", { energyCost: 2, might: 2, name: "Own" }, "own", { exhausted: true })
    .unit(P2, "base", { might: 3, name: "Victim" }, "victim")
    .hand(P1, PORTAL_RESCUE, "pr")
    .build();
  const st = structuredClone(peekCurrentState(game.engine));
  (st as { teams?: Record<string, number> }).teams = { [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 };
  replaceCurrentState(game.engine, st);
  game.engine.getFlowManager()?.syncState(st);
  expect(game.gameState.teams).toEqual({ [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 });
  return game;
}

const offered = (game: Game) =>
  (game.p1.option("cast", "pr")?.fields.find((f) => f.name === "targets")?.options ?? []).map((o) => (Array.isArray(o) ? o[0] : o) as string);

/** Pass priority for every seat until the chain is empty. */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "yes-no") {
      await game.seat(d.seat).no();
    } else {
      break;
    }
  }
}

describe("Ruling e4b1cc9578599903 — Portal Rescue on a teammate's unit (2v2)", () => {
  test("baseline on your OWN unit: Own is banished and re-played by its owner P1 to P1's base (enters exhausted, cost ignored); P1's played-cards ledger counts BOTH the spell and the unit; an opponent's unit is never 'friendly'", async () => {
    const game = await teamBoard();
    expect(offered(game)).toContain("own");
    expect(offered(game)).not.toContain("victim");
    await game.p1.cast("pr", { targets: "own" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await drain(game);
    expect(game.zoneOf("pr")).toBe("trash");
    expect(game.state("own")).toMatchObject({ controller: P1, owner: P1, zone: "base" });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.gameState.cardsPlayedThisTurn?.[P3] ?? 0).toBe(0);
  });

  // 489.8.e: a teammate's unit is "friendly", so Mate is a legal target for Portal Rescue.
  test("ruling e4b1cc9578599903 — teammate P3's Mate is offered as a friendly target (489.8.e)", async () => {
    const game = await teamBoard();
    expect(offered(game).sort()).toEqual(["mate", "own"]);
    expect((await game.p1.try((p) => p.cast("pr", { targets: "mate" }))).ok).toBe(true);
  });

  // Mate is banished, then ITS OWNER P3 plays it to P3's base ignoring cost — it lands in P3's base still owned
  // and controlled by P3 (no Possession-style control change), P1 paid only for the spell, and the "who played a card"
  // ledger credits P3 with the unit (P1: 1 = Portal Rescue; P3: 1 = Mate).
  test("ruling e4b1cc9578599903 — rescued teammate unit goes to ITS OWNER's (P3's) base and P3 counts as playing it", async () => {
    const game = await teamBoard();
    await game.p1.cast("pr", { targets: "mate" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await drain(game);
    expect(game.zoneOf("pr")).toBe("trash");
    expect(game.state("mate")).toMatchObject({ controller: P3, owner: P3, zone: "base" });
    expect(game.seat(P3).base()).toContain("mate");
    expect(game.p1.base()).not.toContain("mate");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P3]).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
