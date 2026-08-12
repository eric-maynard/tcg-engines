/**
 * Ruling f99efd9603b6dba8 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · [Action] · Chaos · [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: A unit moves to an EMPTY battlefield; during the resulting showdown the opponent Ride-the-Winds a unit
 *    in. Who is the attacker and who is the defender?
 * A: The player who moved in first — the one who applied Contested — is the ATTACKER. The opponent who
 *    arrived afterwards is the DEFENDER. If that defender survives the combat they conquer the battlefield
 *    and score, even though it is the attacker's turn.
 * Rules: 344.2 / 464.2 (moving to a battlefield you don't control applies Contested; the contesting player
 *        becomes the attacker when combat begins), 460 (combat needs both sides present),
 *        467 / 471.2 (the winner conquers and scores, whoever's turn it is).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. bf1 is empty and uncontrolled. P1 has a Scout; P2 has a big Bruiser in base and Ride the Wind. */
function board(p2Might: number) {
  return scenario()
    .victoryScore(20)
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: p2Might, name: "Bruiser" }, "bruiser")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

/** P1's Scout walks onto empty bf1 (non-combat showdown, P1 holds Focus), then P2 rides the Bruiser in. */
async function bothArrive(game: Game): Promise<void> {
  await game.p1.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1 });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("rtw", { targets: "bruiser" });
  for (let i = 0; i < 10 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options.find((o) => (o.zone ?? o.key).includes("bf1"))?.key ?? d.options[0]!.key);
    } else if (d?.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.locationOf("bruiser")).toBe("bf1");
}

describe("Ruling f99efd9603b6dba8 — the player who applied Contested is the attacker, the late arrival is the defender", () => {
  test("premise: walking onto the EMPTY battlefield contests it for P1 and opens a showdown with P1 on Focus", async () => {
    const game = await board(5).build();
    await game.p1.move("scout", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 });
  });

  test("ruling: after P2 rides in, P1's Scout is the ATTACKER and P2's Bruiser the DEFENDER", async () => {
    const game = await board(5).build();
    await bothArrive(game);
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("bruiser").combatRole).toBe("defender");
    expect(game.turnPlayer()).toBe(P1);
  });

  test("…and when the defender survives, P2 conquers and scores DURING P1's turn", async () => {
    const game = await board(5).build();
    await bothArrive(game);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash"); // 5 kills the 2-Might Scout
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("mirror: if the attacker wins instead, P1 conquers — the roles are unchanged, only the outcome differs", async () => {
    const game = await board(1).build();
    await bothArrive(game);
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("bruiser").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
