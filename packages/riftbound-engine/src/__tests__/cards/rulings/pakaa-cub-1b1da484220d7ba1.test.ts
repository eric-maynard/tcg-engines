/**
 * Ruling 1b1da484220d7ba1 — Pakaa Cub (OGN-135 → ogn-135-298) · Unit · Body · [3] · 3 Might · [Hidden]
 *
 * Q: If I reveal (play from face-down) Pakaa Cub after my last unit at that battlefield is killed, is the Cub an
 *    attacker or a defender?
 * A: You can't: once your last unit there dies, your hidden card is removed (trashed) in the cleanup — there is no
 *    window to reveal "in response to" the death. Reveal it BEFORE your unit dies (during the showdown, while you have
 *    Focus); it then joins the combat as a DEFENDER.
 * Rules: 811 (Hidden: play from face-down for [0] as a Reaction, enters at that battlefield), 464.2.c.3.a (a unit arriving
 *        mid-combat takes its controller's designation), 465.2 (no priority during damage), 323.7 / 466.5.c (facedown
 *        card at a battlefield you no longer hold is trashed in cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PAKAA_CUB = "ogn-135-298";

/** P2's turn (turn 3, so the Cub was hidden "earlier"). P1 holds bf1 with a lone 2-Might Guard and the Cub face down. */
function board(auto = true) {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .facedown(P1, "bf1", PAKAA_CUB, "cub")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .autoProcedures(auto);
}

describe("Ruling 1b1da484220d7ba1 — reveal Pakaa Cub before your last unit dies (it defends); afterwards the hidden card is simply trashed", () => {
  test("revealed in time: P2 attacks, passes Focus, P1 plays the Cub from face-down for [0] — it enters AT bf1 and is designated a DEFENDER alongside the Guard", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("reveal", "cub")).toBe(false); // attacker holds Focus first
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "cub")).toBe(true);
    await game.p1.reveal("cub");
    expect(game.p1.energy()).toBe(0); // played for [0]
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("cub").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
  });

  test("…and it fights as a defender: 5 into Guard 2 + Cub 3 — P2 (5) kills both only by splitting exactly; defenders deal 5 back and the Raider dies too; bf1 is not conquered", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("cub");
    await game.settle();
    if (game.decision()?.kind === "distribute") {
      await game.p2.distribute({ cub: 3, guard: 2 });
      await game.settle();
    }
    expect(game.zoneOf("raider")).toBe("trash"); // took 2 + 3 = 5
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("too late: once both pass Focus there is no priority during combat damage — P1 has no 'reveal' option between the showdown closing and the Guard dying", async () => {
    const game = await board(false).build(); // surface combat resolution as a step instead of auto-running it
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "cub")).toBe(true); // last chance
    await game.p1.passFocus();
    // Showdown closed → only the combat-resolution procedure remains; nobody may play anything.
    expect((game.decision() as { context?: string }).context).not.toBe("showdown");
    expect((game.decision() as { context?: string }).context).not.toBe("chain");
    expect(game.p1.can("reveal", "cub")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("reveal");
  });

  test("not revealed: the lone Guard dies, P1 has no unit left at bf1, and the face-down Cub goes to P1's trash in the cleanup — it never entered play, P2 conquers", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.p1.trash()).toContain("cub");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    // And at no point now is a reveal offered "in response" to the death.
    expect(game.p1.can("reveal", "cub")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
