/**
 * Ruling 46af9195ece0f259 — Discipline (OGN-058 → ogn-058-298) · Spell · [2] · [Reaction]
 *   "Give a unit +2 [Might] this turn. Draw 1."
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] · [1][calm] "Counter a spell that costs no more than [4]."
 *
 * Q: Playing Discipline in response to an opponent's attack — do I draw the card immediately, or only on resolution?
 * A: Only on resolution. Discipline goes on the chain; the opponent gets a window to respond (and may counter it,
 *    in which case there is no +2 and no draw). Once it resolves you have the card and may use it right away in
 *    the same showdown if it is a [Reaction] (or an [Action], in combat).
 * Rules: 340 (chain / LIFO), 425.1 (a counter removes the spell — none of its instructions happen), 419 (playing a spell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";
const GUST = "ogn-169-298"; // [Reaction] [1] — return a unit at a battlefield with 3 Might or less to its owner's hand

/** P2's turn. P2 attacks P1's bf1 with Raider (3); P1 defends with Guard (3) and holds Discipline + [3]. Deck top: Gust. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, DEFY, "defy")
    .deck(P1, [GUST], ["gust"]);
}

/** P2 attacks; focus passes to P1, who reacts with Discipline on the Guard. */
async function disciplineInResponse(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  await game.p2.passFocus();
  expect(game.actingSeat()).toBe(P1);
  const handBefore = game.p1.hand().length;
  await game.p1.cast("disc", { targets: "guard" });
  expect(game.p1.hand().length).toBe(handBefore - 1); // only Discipline left the hand — nothing drawn yet
  return game;
}

describe("Ruling 46af9195ece0f259 — Discipline's draw happens on resolution, not when it is played", () => {
  test("ruling: while Discipline sits on the chain nothing has happened — no +2, no draw, and Gust is still on top of the deck", async () => {
    const game = await disciplineInResponse();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P1, targets: ["guard"] })]);
    expect(game.state("guard").might).toBe(3);
    expect(game.p1.deck()).toContain("gust");
    expect(game.p1.hand()).not.toContain("gust");
  });

  test("ruling: the opponent gets a window to respond before it resolves", async () => {
    const game = await disciplineInResponse();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
  });

  test("ruling: unanswered, Discipline resolves — THEN the Guard is 5 and the card is in hand", async () => {
    const game = await disciplineInResponse();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("guard").might).toBe(5);
    expect(game.p1.hand()).toContain("gust");
    expect(game.p1.deck()).not.toContain("gust");
  });

  test("ruling nuance: the freshly drawn [Reaction] can be used at once, still inside the same showdown", async () => {
    const game = await disciplineInResponse();
    await game.p1.passPriority();
    await game.p2.passPriority();
    // The chain is empty again and the showdown is still running; focus returns to the attacker first.
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
    await game.p2.passFocus();
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: countered before resolution, Discipline gives nothing — no +2 and no draw", async () => {
    const game = await disciplineInResponse();
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "disc" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("guard").might).toBe(3);
    expect(game.p1.hand()).not.toContain("gust");
    expect(game.p1.deck()).toContain("gust");
    expect(game.violations()).toEqual([]);
  });
});
