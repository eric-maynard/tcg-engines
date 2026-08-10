/**
 * Ruling 5cfd177dd933c567 — Ride the Wind (OGN-173 → ogn-173-298) · Action spell · Chaos · [2][chaos]
 *   "Move a friendly unit and ready it."
 *   × Stalwart Poro (OGN-052 → ogn-052-298) · 2 Might · [Shield] (+1 Might while defending)
 *   (Facebreaker ogn-220-298 is only mentioned in a nuance about stunning the attacker.)
 *
 * Q: Opponent moves a 2-Might unit into an OPEN battlefield (non-combat showdown). I respond with Ride the Wind to
 *    move my Stalwart Poro there from base. Second showdown? Does the opponent score, or does my Poro defend first?
 * A: The initial (non-combat) showdown completes without establishing control (opposing units present), so the
 *    opponent does NOT score. Then a COMBAT showdown begins with the opponent as attacker; the Poro defends (Shield
 *    applies) before any scoring.
 * Rules: 459–464 (showdowns; a move that would start combat during a showdown is staged), 464.2.c (attacker = who
 *        applied contested), 466 (control only established when one side remains), Shield.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const STALWART_PORO = "ogn-052-298";

/** P2's turn. bf1 is open (no controller, no units). P2: Scout (2) in base. P1: Stalwart Poro in base, Ride the Wind + [2][chaos]. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "base", STALWART_PORO, "poro")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .resources(P1, { energy: 2, power: { chaos: 1 } });
}

function stack(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

/** Scout moves into open bf1 (non-combat showdown, P2 has Focus); P2 passes Focus; P1 rides the Poro in; the spell resolves. */
async function scoutInThenPoroRidesIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("scout", "bf1");
  // A NON-combat showdown opened at bf1; P2 (who applied contested) has Focus first. No point yet.
  expect(stack(game)).toHaveLength(1);
  expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.points()).toBe(0);
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  // Ride the Wind is an Action — playable in a showdown even on the opponent's turn.
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "poro" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bf1");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Ride the Wind resolves
  expect(game.zoneOf("rtw")).toBe("trash");
  return game;
}

describe("Ruling 5cfd177dd933c567 — Ride the Wind into an open-battlefield showdown: no score for the mover; a combat follows with them attacking", () => {
  test("the Poro arrives at bf1 ready while the initial showdown is still unresolved: no combat has started mid-showdown, bf1 is still uncontrolled and P2 has NOT scored", async () => {
    const game = await scoutInThenPoroRidesIn();
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.state("poro").isReady).toBe(true);
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(stack(game)).toHaveLength(1); // still exactly one showdown open at bf1 — never two at once
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1" });
  });

  test("once the initial showdown completes (control NOT established — opposing units present), a COMBAT showdown opens at bf1: P2 is the attacker with Focus first, the Poro defends with Shield (3 Might); still no points", async () => {
    const game = await scoutInThenPoroRidesIn();
    // Pass until the open showdown at bf1 is the combat one.
    for (let i = 0; i < 6 && !(stack(game)[0]?.isCombatShowdown ?? false); i++) {
      await game.acting().pass();
    }
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true, attackingPlayer: P2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(null); // the non-combat showdown established no control
    expect(game.p2.points()).toBe(0);
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("poro").might).toBe(3); // Shield: +1 while defending
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("the combat then resolves before anyone scores bf1: Poro (3) kills Scout (2) and survives; P2 never scores — P1 ends up conquering bf1", async () => {
    const game = await scoutInThenPoroRidesIn();
    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro").might).toBe(2); // Shield gone once no longer a defender
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
