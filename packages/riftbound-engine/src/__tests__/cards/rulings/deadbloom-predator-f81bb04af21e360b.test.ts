/**
 * Ruling f81bb04af21e360b — Deadbloom Predator (OGN-161 → ogn-161-298) · 8 Might · 8 + [body][body]
 *   "[Deflect] / You may play me to an occupied enemy battlefield."
 *
 * Q: Playing Deadbloom Predator into an occupied enemy battlefield — may other units from my base
 *    join the same combat?
 * A: No. The Predator goes in alone. It is being PLAYED, not moved, so the rules that let you bring a
 *    group along on a move do not apply; and once the showdown it starts is open, discretionary moves
 *    are no longer legal. The showdown must resolve first.
 * Rules: 307 (discretionary actions need a Neutral Open State), 410.1.a (moves are discretionary),
 *        355.2.a / play permissions (a play puts exactly the played card onto the board).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PREDATOR = "ogn-161-298";

/** P2 holds bf1 with a 3-Might Guard; P1 has the Predator in hand plus two spare units in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Backup A" }, "backupA")
    .unit(P1, "base", { might: 3, name: "Backup B" }, "backupB")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, PREDATOR, "pred");
}

describe("Ruling f81bb04af21e360b — a Deadbloom Predator played into an occupied enemy battlefield fights alone", () => {
  test("the enemy-occupied battlefield really is an offered destination for the play", async () => {
    const game = await board().build();
    const to = game.p1.option("play", "pred")?.fields.find((f) => f.arg === "to")?.options;
    expect(to).toContain("battlefield-bf1");
  });

  test("playing it there opens the showdown immediately, and the only things P1 may now do are act in the showdown or pass — no move joins it", async () => {
    const game = await board().build();
    await game.p1.play("pred", { to: "bf1" });
    expect(game.zoneOf("pred")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passFocus"]);
    const join = await game.p1.try((p) => p.move("backupA", "bf1"));
    expect(join.ok).toBe(false);
    expect(game.locationOf("backupA")).toBe("base");
    expect(game.locationOf("backupB")).toBe("base");
  });

  test("the combat is resolved by the Predator alone: its 8 kills the Guard, the backups never took damage and never conquered anything", async () => {
    const game = await board().build();
    await game.p1.play("pred", { to: "bf1" });
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("pred").damage).toBe(0); // Guard's 3 into 8 Might, then healed
    expect(game.locationOf("backupA")).toBe("base");
    expect(game.locationOf("backupB")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a MOVE into the same battlefield may take several units at once — the restriction is specific to playing the Predator", async () => {
    const game = await board().build();
    await game.p1.move(["backupA", "backupB"], "bf1");
    expect(game.locationOf("backupA")).toBe("bf1");
    expect(game.locationOf("backupB")).toBe("bf1");
  });
});
