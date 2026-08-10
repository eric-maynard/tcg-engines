/**
 * Ruling 0095544582dc3dd3 — Hextech Ray (OGN-009 → ogn-009-298) · [1][fury] · [Action] "Deal 3 to a unit at a battlefield."
 *
 * Q: My opponent Hextech Rays my only defending unit during a showdown. Can I still play Action spells (e.g. my own Hextech
 *    Ray) to kill their attacker before they conquer?
 * A: Yes. The unit dies in the Cleanup after the spell resolves, but a showdown doesn't end because one side has no units —
 *    it ends only when all players pass in an Open state. You can retaliate; if their unit dies too, nothing is conquered.
 * Rules: 344–346 (showdown ends when everyone passes with an empty chain), 322/323 (Cleanup kills lethally-damaged units
 *        when the state changes), 466.5.b (no units of either side left ⇒ nobody conquers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P2 holds bf1 with a lone Defender (3). P1's Attacker (3) attacks from base. Each player holds a Hextech Ray with
 * exactly [1][fury]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "defender")
    .unit(P1, "base", { might: 3, name: "Attacker" }, "attacker")
    .hand(P1, HEXTECH_RAY, "rayP1")
    .hand(P2, HEXTECH_RAY, "rayP2");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Attacker moves in; P1 (Focus) Hextech Rays the Defender; both pass so it resolves and the Defender dies. */
async function p1RaysTheDefender(game: Game): Promise<void> {
  await game.p1.move("attacker", "bf1");
  expect(showdown(game)).toBeDefined();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rayP1", { targets: "defender" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rayP1", controller: P1 })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("rayP1")).toBe("trash");
  expect(game.zoneOf("defender")).toBe("trash"); // lethal damage ⇒ died in the Cleanup after resolution
}

describe("Ruling 0095544582dc3dd3 — losing your only defender to a spell mid-showdown doesn't end the showdown; you can Ray back", () => {
  test("after P1's Hextech Ray kills the lone Defender the showdown is STILL open (nobody has passed in the Open state) — no combat/conquer yet, P2 keeps bf1 for now", async () => {
    const game = await board().build();
    await p1RaysTheDefender(game);
    expect(showdown(game)).toBeDefined();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.p2.units("bf1")).toEqual([]); // zero defenders does not auto-end it
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("P2 can still play an Action spell in that showdown: P2's Hextech Ray kills the Attacker; with both sides empty nothing is conquered and P1 scores nothing", async () => {
    const game = await board().build();
    await p1RaysTheDefender(game);
    // Focus comes round to P2 (pass P1's Focus first if P1 still holds it).
    for (let i = 0; i < 2 && game.decision()?.seat !== P2; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rayP2")).toBe(true);
    await game.p2.cast("rayP2", { targets: "attacker" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rayP2", controller: P2 })]);
    await game.settle();
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.zoneOf("rayP2")).toBe("trash");
    expect(showdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // conquest prevented
    expect(game.p1.points()).toBe(0);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P2 just passes, the showdown ends with only the Attacker there and P1 conquers bf1 for a point", async () => {
    const game = await board().build();
    await p1RaysTheDefender(game);
    await game.settle();
    expect(game.zoneOf("attacker")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
