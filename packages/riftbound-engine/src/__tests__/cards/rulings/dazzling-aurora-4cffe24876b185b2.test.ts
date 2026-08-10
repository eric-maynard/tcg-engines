/**
 * Ruling 4cffe24876b185b2 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · 9+[body][body]
 *     "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it. Play
 *      it, ignoring its cost, and recycle the rest."
 *   × Yi, Honed (OGS-009 → ogs-009-024) · Unit · Body · 7+[body] · 6 Might "[Ganking] I enter ready."
 *
 * Q: Aurora pulls a unit that enters Ready (Yi, Honed) at end of turn — may I play it to an OPPONENT's battlefield?
 * A: No. It enters ready in your base or at a battlefield you control; then your turn ends.
 * Rules: 355.2 / 419.1 (a unit may be played only to your base or a battlefield you control), 317 (Ending Phase).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const YI_HONED = "ogs-009-024";
const CLEAVE = "ogn-004-298"; // a non-unit on top, revealed and recycled

/** P1's turn, about to end. Aurora in base; deck: Cleave, Yi. P1 controls bf2 (Holder there); P2 controls bf1 (Guard). */
function board() {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .deck(P1, [CLEAVE, YI_HONED], ["cleave", "yi"]);
}

/** End P1's turn and pass priority on Aurora's trigger until the free play of Yi asks for a destination. */
async function toDestinationPrompt(game: Game): Promise<Decision | null> {
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    return d;
  }
  return game.decision();
}

describe("Ruling 4cffe24876b185b2 — an Aurora-played 'I enter ready' unit still can't land on an enemy battlefield", () => {
  test("the destination prompt (P1's) offers base and P1's own bf2 — never P2's bf1", async () => {
    const game = await board().build();
    const d = await toDestinationPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(dests).toContain("base");
    expect(dests).toContain("battlefield-bf2");
    expect(dests).not.toContain("battlefield-bf1");
    expect(game.turnPlayer()).toBe(P1); // still P1's ending phase while choosing
  });

  test("choosing bf2: Yi arrives there READY for free, Cleave was recycled, and then the turn simply ends — P2's turn, Guard untouched at bf1", async () => {
    const game = await board().build();
    await toDestinationPrompt(game);
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("yi")).toBe("bf2");
    expect(game.state("yi").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0); // ignoring its cost
    expect(game.p1.deck().at(-1)).toBe("cleave");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("choosing base works too: Yi enters ready in P1's base and the turn passes", async () => {
    const game = await board().build();
    await toDestinationPrompt(game);
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("yi")).toBe("base");
    expect(game.state("yi").isReady).toBe(true);
    expect(game.turnPlayer()).toBe(P2);
  });
});
