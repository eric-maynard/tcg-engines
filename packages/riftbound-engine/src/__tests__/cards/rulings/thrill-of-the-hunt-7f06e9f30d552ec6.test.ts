/**
 * Ruling 7f06e9f30d552ec6 — Thrill of the Hunt (UNL-184 → unl-184-219) · Spell · Fury/Body · [2][rainbow] · [Reaction]
 *     "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *
 * Q: Can I play Thrill of the Hunt on my opponent's turn and conquer a battlefield I am standing on?
 * A: Yes. It is a [Reaction], so it is legal in a window on their turn. The unit arrives at a battlefield you do
 *    not control, which becomes Contested; when that showdown closes with only your unit there you establish
 *    control and Conquer, scoring a point on their turn. Limit: the WINNING point via Conquer needs every other
 *    battlefield scored the same turn — otherwise it is withheld.
 * Rules: 344.2 / 348.2 (non-combat showdown closes ⇒ control established), 464.1 (Conquer scores),
 *        465 (once per battlefield per turn), 466.1.b.2 (winning point via Conquer restriction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL = "unl-184-219";
const SKULKER = "ogn-175-298";

/** P2's turn. bf1 and bf2 are open. P1's Hunter waits in base with Thrill + [2][rainbow]; P2 has a Runner. */
function board(p1Points = 0) {
  return scenario()
    .active(P2)
    .victoryScore(8)
    .points(P1, p1Points)
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Hunter" }, "hunter")
    .unit(P2, "base", { might: 2, name: "Runner" }, "runner")
    .hand(P1, THRILL, "thrill")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"]);
}

/** P2 walks into bf2 (opening a showdown) and passes Focus, giving P1 its window on P2's turn. */
async function p1sWindowOnP2sTurn(p1Points = 0): Promise<Game> {
  const game = await board(p1Points).build();
  await game.p2.move("runner", "bf2");
  await game.p2.passFocus();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 casts Thrill on its own Hunter and sends it to bf1 on resolution. */
async function thrillToBf1(game: Game): Promise<void> {
  expect(game.p1.can("cast", "thrill")).toBe(true);
  await game.p1.cast("thrill", { targets: "hunter" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Thrill resolves
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 }); // "its owner plays it to any battlefield"
  const dests = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
  expect(dests).toContain("battlefield-bf1");
  expect(dests).not.toContain("base"); // a battlefield, never home
  await game.p1.pick("battlefield-bf1");
}

describe("Ruling 7f06e9f30d552ec6 — Thrill of the Hunt conquers on the opponent's turn", () => {
  test("as a [Reaction] it is castable in P1's window on P2's turn: the Hunter is banished and replayed to bf1 for free, making bf1 Contested by P1", async () => {
    const game = await p1sWindowOnP2sTurn();
    await thrillToBf1(game);
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("hunter")).toMatchObject({ controller: P1, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.p1.points()).toBe(0); // not yet — that showdown must close first
  });

  test("when the showdown at bf1 closes P1 is the only one there: control is established = a Conquer, and P1 scores 1 on P2's turn", async () => {
    const game = await p1sWindowOnP2sTurn();
    await thrillToBf1(game);
    for (let i = 0; i < 4; i++) {
      const stop = await game.settle();
      const cur = game.decision();
      if (!(stop.reason === "open" && cur?.kind === "action" && cur.context === "showdown")) {
        break;
      }
      await game.acting().passFocus();
    }
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.locationOf("hunter")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P2); // still their turn
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("winning-point limit: at 7 of 8 the identical conquest does NOT end the game — P1 scored no other battlefield this turn, so the point is withheld", async () => {
    const game = await p1sWindowOnP2sTurn(7);
    await thrillToBf1(game);
    for (let i = 0; i < 4; i++) {
      const stop = await game.settle();
      const cur = game.decision();
      if (!(stop.reason === "open" && cur?.kind === "action" && cur.context === "showdown")) {
        break;
      }
      await game.acting().passFocus();
    }
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // the conquest itself happened
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });
});
