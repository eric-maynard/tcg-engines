/**
 * Ruling 1819a3ef3e5c3061 — Portal Rescue (OGN-102 → ogn-102-298) · Spell · Mind · 3+[mind] · Action
 *     "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *
 * Q: In 2v2, if I Portal Rescue a TEAMMATE's unit, does it come back to MY base?
 * A: No. The card says "its OWNER plays it to THEIR base" — the unit returns to the teammate's base, and the
 *    teammate (not the caster) is the player who plays it. Only the spell itself is played by the caster.
 * Rules: 489.8.e / 740.1.a ("friendly" spans a teammate's objects in team modes), 105 (owner never changes),
 *        346 (playing a card — the player named by the effect is the one who plays it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, P4, scenario } from "../../../harness";
import { peekCurrentState, replaceCurrentState } from "../../../harness/internal";

const PORTAL_RESCUE = "ogn-102-298";

/**
 * 2v2, teams P1+P3 vs P2+P4. P1's turn with exactly 3+[mind] and Portal Rescue in hand. Teammate P3's Mate (2,
 * exhausted) sits at bf1; P1's own Scout (2, exhausted) is in P1's base; opponent P2 has a Victim in their base.
 * The scenario builder has no team knob, so the 489.2 team map is seeded onto the built state (setup only).
 */
async function teamBoard(): Promise<Game> {
  const game = await scenario({ players: 4 })
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P3 })
    .unit(P3, "bf1", { energyCost: 2, might: 2, name: "Mate" }, "mate", { exhausted: true })
    .unit(P1, "base", { energyCost: 2, might: 2, name: "Scout" }, "scout", { exhausted: true })
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

describe("Ruling 1819a3ef3e5c3061 — Portal Rescue on a teammate's unit does not bring it to your base", () => {
  test("premise: the teammate's Mate is a legal 'friendly unit' for P1's Portal Rescue, an opponent's unit is not", async () => {
    const game = await teamBoard();
    const offered = (game.p1.option("cast", "pr")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered.toSorted()).toEqual(["mate", "scout"]);
    expect(offered).not.toContain("victim");
  });

  test("ruling: rescuing teammate P3's Mate puts it in P3's base — NOT in P1's base — still owned and controlled by P3", async () => {
    const game = await teamBoard();
    await game.p1.cast("pr", { targets: "mate" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await drain(game);
    expect(game.zoneOf("pr")).toBe("trash");
    expect(game.zoneOf("mate")).toBe("base");
    expect(game.seat(P3).base()).toContain("mate");
    expect(game.p1.base()).not.toContain("mate"); // the point of the question
    expect(game.state("mate")).toMatchObject({ controller: P3, owner: P3 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling: P3 counts as playing the unit — the played-cards ledger credits P1 only with the spell and P3 with the unit", async () => {
    const game = await teamBoard();
    await game.p1.cast("pr", { targets: "mate" });
    await drain(game);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // Portal Rescue itself
    expect(game.gameState.cardsPlayedThisTurn?.[P3]).toBe(1); // the rescued Mate
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(0);
  });

  test("cost is ignored and P3 pays nothing: the 2-cost Mate re-enters P3's base for free (and arrives as a fresh, exhausted object)", async () => {
    const game = await teamBoard();
    const p3Before = game.seat(P3).resources();
    await game.p1.cast("pr", { targets: "mate" });
    await drain(game);
    expect(game.seat(P3).resources()).toEqual(p3Before);
    expect(game.state("mate").isExhausted).toBe(true);
    expect(game.seat(P3).banishment()).not.toContain("mate");
  });

  test("contrast: rescuing P1's OWN Scout does land in P1's base and P1 is credited with both plays", async () => {
    const game = await teamBoard();
    await game.p1.cast("pr", { targets: "scout" });
    await drain(game);
    expect(game.p1.base()).toContain("scout");
    expect(game.state("scout")).toMatchObject({ controller: P1, owner: P1, zone: "base" });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.gameState.cardsPlayedThisTurn?.[P3] ?? 0).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
