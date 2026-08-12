/**
 * Ruling 344cabc45435ce7f — (general [Ganking] + group moves; no specific card)
 *   Vanilla stand-ins: a [Ganking] Prowler at bfA and a plain Recruit in base, both moving to bfB.
 *
 * Q: Can a unit with [Ganking] at a battlefield and a unit at base move together to another battlefield?
 * A: Yes. [Ganking] is not a separate kind of move — it only widens where a Standard Move may start from,
 *    and one Standard Move may take several units whose origins differ.
 * Rules: 810.1.b ([Ganking] adds battlefield → battlefield to that unit's Standard Move), 140.2 (one
 *        Standard Move may move any number of your units), 140.2.a (their origins need not match).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GANKER = { cardType: "unit", keywords: ["Ganking"], might: 3, name: "Prowler" };

/** P1's turn. P1's Ganking Prowler sits at bfA (which P1 holds); a plain Recruit waits in base; bfB is empty. */
function board() {
  return scenario()
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", GANKER, "prowler")
    .unit(P1, "base", { might: 2, name: "Recruit" }, "recruit");
}

describe("Ruling 344cabc45435ce7f — one Standard Move may carry a Ganking unit off a battlefield and a base unit together", () => {
  test("both units arrive at bfB in a single move, even though one started at a battlefield and the other in base", async () => {
    const game = await board().build();
    await game.p1.move(["prowler", "recruit"], "bfB");
    await game.settle();
    expect(game.locationOf("prowler")).toBe("bfB");
    expect(game.locationOf("recruit")).toBe("bfB");
    expect(game.violations()).toEqual([]);
  });

  test("the Ganking unit is what makes the battlefield → battlefield leg legal: a plain unit at bfA cannot join the same move", async () => {
    const game = await board().unit(P1, "bfA", { might: 2, name: "Footman" }, "footman").build();
    const attempt = await game.p1.try((p) => p.move(["footman", "recruit"], "bfB"));
    expect(attempt.ok).toBe(false);
    expect(game.locationOf("footman")).toBe("bfA");
    expect(game.locationOf("recruit")).toBe("base");
  });

  test("arriving together at a battlefield the opponent holds opens ONE showdown with both of them as attackers", async () => {
    const game = await board()
      .battlefield("bfC", { controller: P2 })
      .unit(P2, "bfC", { might: 6, name: "Keeper" }, "keeper")
      .build();
    await game.p1.move(["prowler", "recruit"], "bfC");
    expect(game.decision()).toMatchObject({ context: "showdown" });
    expect(game.gameState.battlefields.bfC?.contested).toBe(true);
    expect(game.p1.units("bfC").sort()).toEqual(["prowler", "recruit"]);
    await game.settle();
    // Their 3 + 2 = 5 is short of the Keeper's 6, and its 6 is enough to make both of them lethal (3 + 2).
    expect(game.zoneOf("keeper")).toBe("battlefield-bfC");
    expect(game.state("keeper").damage).toBe(0); // 5 < 6, then healed
    expect(game.zoneOf("prowler")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.gameState.battlefields.bfC?.controller).toBe(P2);
  });
});
