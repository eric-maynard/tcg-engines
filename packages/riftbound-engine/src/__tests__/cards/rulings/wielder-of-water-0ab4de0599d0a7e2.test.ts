/**
 * Ruling 0ab4de0599d0a7e2 — Wielder of Water (OGN-055 → ogn-055-298) · Unit · Calm · 2 Might
 *     "While I'm attacking or defending alone, I have +2 [Might]."
 *   × Pakaa Cub (ogn-135-298, [Hidden] 3-Might unit) · Consult the Past (ogn-083-298, [Hidden][Reaction] spell "Draw 2.")
 *
 * Q: Does Wielder of Water count as alone when a hidden card is at the same battlefield?
 * A: Yes — a facedown card is not a unit on the battlefield. While it stays hidden Wielder keeps the alone bonus; the
 *    moment a hidden UNIT is revealed (played) there, Wielder is no longer alone and loses it; if the hidden card is a
 *    SPELL, revealing it changes nothing and the bonus stays.
 * Rules: 107.3 (facedown zone is separate from the battlefield's units), 740 ("alone" = the only friendly unit there),
 *        811 (playing a Hidden card from facedown), 365 (a "while" static re-evaluates continuously).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WIELDER_OF_WATER = "ogn-055-298";
const PAKAA_CUB = "ogn-135-298";
const CONSULT = "ogn-083-298";

/** P2's turn 3. P1 holds bf1 with Wielder (2) and ONE facedown card there; P2's Raider (3) in base. */
function board(hidden: string) {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WIELDER_OF_WATER, "wielder")
    .facedown(P1, "bf1", hidden, "hidden")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

describe("Ruling 0ab4de0599d0a7e2 — a hidden card doesn't break Wielder of Water's 'alone'; a revealed UNIT does, a revealed SPELL doesn't", () => {
  test("Raider attacks: Wielder defends ALONE despite the facedown Pakaa Cub beside it → 2 + 2 = 4 Might", async () => {
    const game = await board(PAKAA_CUB).build();
    expect(game.state("wielder").might).toBe(2); // not in combat yet
    await game.p2.move("raider", "bf1");
    expect(game.state("wielder").combatRole).toBe("defender");
    expect(game.p1.facedown("bf1")).toEqual(["hidden"]);
    expect(game.p1.units("bf1")).toEqual(["wielder"]);
    expect(game.state("wielder").might).toBe(4);
  });

  test("P1 reveals the hidden Pakaa Cub during the showdown: a second friendly UNIT is now there → Wielder immediately drops back to 2", async () => {
    const game = await board(PAKAA_CUB).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.reveal("hidden");
    // a permanent played from hidden enters at once (here)
    expect(game.zoneOf("hidden")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1").toSorted()).toEqual(["hidden", "wielder"]);
    expect(game.state("wielder").might).toBe(2);
  });

  test("…and the combat is then fought at 2: Raider (3) vs Wielder (2) + Cub (3) — P1's 5 kills the Raider; P2's 3 must go somewhere (P2 assigns onto Wielder → it dies at 2 Might)", async () => {
    const game = await board(PAKAA_CUB).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("hidden");
    const stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.kind === "distribute") {
      await game.p2.distribute({ wielder: 3 });
      await game.settle();
    }
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("if the hidden card is a SPELL (Consult the Past), revealing it leaves Wielder alone: still 4 Might after the spell resolves, and it wins the fight 4 vs 3", async () => {
    const game = await board(CONSULT).build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("raider", "bf1");
    expect(game.state("wielder").might).toBe(4);
    await game.p2.passFocus();
    await game.p1.reveal("hidden");
    expect(game.state("wielder").might).toBe(4); // on the chain: still alone
    await game.p1.passPriority();
    await game.p2.passPriority(); // Consult resolves: draw 2
    expect(game.zoneOf("hidden")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.units("bf1")).toEqual(["wielder"]);
    expect(game.state("wielder").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 4 ≥ 3
    expect(game.zoneOf("wielder")).toBe("battlefield-bf1"); // 3 < 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("wielder").might).toBe(2); // out of combat again
    expect(game.violations()).toEqual([]);
  });
});
