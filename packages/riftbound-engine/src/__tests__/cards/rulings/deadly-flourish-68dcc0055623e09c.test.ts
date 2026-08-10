/**
 * Ruling 68dcc0055623e09c — Deadly Flourish (UNL-073 → unl-073-219) · [4] "Deal 3 to an enemy unit. When it dies this turn, play a
 *     Gold gear token exhausted."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] "Kill a unit at a battlefield. Its controller draws 2."
 *   × Gold token (sfd-t03)
 *
 * Q: Opponent Deadly-Flourishes my unit; I react with my (hidden) Hidden Blade on the same unit. Does the opponent get the Gold?
 * A: No. Hidden Blade resolves first and kills the unit. When Deadly Flourish resolves its target is no longer on the board:
 *    the damage is skipped and the "when it dies this turn" rider cannot attach to a unit that is already gone — no token.
 * Rules: 359.3 (LIFO), 359.3.e.6 (impossible instruction ignored), 359.3.e.12 (departed object → null), FAQ #3700 / #10423.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEADLY_FLOURISH = "unl-073-219";
const HIDDEN_BLADE = "ogn-213-298";

/** P2's turn with exactly [4]. P1 holds bf1 with Victim (2) and — optionally — a facedown Hidden Blade there. */
function board(withBlade: boolean) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Victim" }, "victim")
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
    .hand(P2, DEADLY_FLOURISH, "df");
  return withBlade ? s.facedown(P1, "bf1", HIDDEN_BLADE, "blade") : s;
}

const goldOf = (game: Game, seat: typeof P1) => game.findAll({ name: "Gold", owner: seat }).filter((id) => game.zoneOf(id) !== "gone");

describe("Ruling 68dcc0055623e09c — Hidden Blade kills the Deadly Flourish target first: no Gold for the caster", () => {
  test("control: unanswered, Deadly Flourish deals 3, the 2-Might Victim dies this turn and P2 gets an EXHAUSTED Gold token", async () => {
    const game = await board(false).build();
    await game.p2.cast("df", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    const gold = goldOf(game, P2);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true });
  });

  test("P1 flips Hidden Blade onto its own Victim in response: it resolves first — Victim dies to the Blade and P1 draws 2 while Deadly Flourish still waits", async () => {
    const game = await board(true).build();
    await game.p2.cast("df", { targets: "victim" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["victim"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["df", "blade"]);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "blade"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["df"]);
    expect(goldOf(game, P2)).toEqual([]);
  });

  test("Deadly Flourish then resolves against nothing: no damage, its 'when it dies this turn' never attaches — P2 gets NO Gold token, now or by end of turn", async () => {
    const game = await board(true).build();
    await game.p2.cast("df", { targets: "victim" });
    await game.p2.passPriority();
    await game.p1.reveal("blade", { answers: ["victim"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("df")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(goldOf(game, P2)).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.state("holder").damage).toBe(0); // the 3 did not get redirected anywhere
    await game.advanceTurn();
    expect(goldOf(game, P2)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
