/**
 * Ruling 3b61da5df56f48a4 — (no [Assault] bonus in a non-combat showdown; no specific card)
 *   Stand-in: Laurent Duelist (SFD-156 → sfd-156-221) · 3 [Might] · "[Assault 2] (+2 [Might] while I'm an
 *   attacker.)"
 *
 * Q: Do you get the +1 (here +2) from [Assault] in a non-combat showdown?
 * A: No. [Assault] is worth "+X Might while I'm an attacker", and the Attacker designation only exists in a
 *    Combat — that is, when units of two different players contest the battlefield. Walking onto an open
 *    battlefield opens a non-combat showdown, nobody is designated, and the bonus never applies.
 * Rules: 807.1 ([Assault] = +X Might while designated an Attacker), 464.2.c.3 (designations are made only
 *        when the showdown is a Combat), 344.2 (moving to an open battlefield stages a non-combat showdown).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LAURENT_DUELIST = "sfd-156-221";

/** P1's turn. bfOpen is empty and uncontrolled; bfEnemy is P2's, defended by a Warden (3). */
function board() {
  return scenario()
    .battlefield("bfOpen", { controller: null })
    .battlefield("bfEnemy", { controller: P2 })
    .unit(P2, "bfEnemy", { might: 3, name: "Warden" }, "warden")
    .unit(P1, "base", LAURENT_DUELIST, "duelist");
}

describe("Ruling 3b61da5df56f48a4 — [Assault] pays out only in a Combat, never in a non-combat showdown", () => {
  test("moving onto the open battlefield stages a non-combat showdown: no Attacker designation and the Duelist is still a plain 3 Might", async () => {
    const game = await board().build();
    expect(game.state("duelist")).toMatchObject({ keywords: ["Assault"], might: 3 });
    await game.p1.move("duelist", "bfOpen");
    expect(game.decision()).toMatchObject({ context: "showdown" });
    expect(game.state("duelist")).toMatchObject({ combatRole: null, might: 3 }); // NOT 5
    await game.settle();
    expect(game.gameState.battlefields.bfOpen?.controller).toBe(P1);
    expect(game.state("duelist").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("moving into the battlefield the opponent defends IS a Combat: the Duelist is designated Attacker and is 3 + 2 = 5 Might", async () => {
    const game = await board().build();
    await game.p1.move("duelist", "bfEnemy");
    expect(game.decision()).toMatchObject({ context: "showdown" });
    expect(game.state("duelist")).toMatchObject({ combatRole: "attacker", might: 5 });
  });

  test("and the bonus is real in that Combat: 5 kills the 3-Might Warden, so the Duelist conquers the battlefield", async () => {
    const game = await board().build();
    await game.p1.move("duelist", "bfEnemy");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.locationOf("duelist")).toBe("bfEnemy");
    expect(game.gameState.battlefields.bfEnemy?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
