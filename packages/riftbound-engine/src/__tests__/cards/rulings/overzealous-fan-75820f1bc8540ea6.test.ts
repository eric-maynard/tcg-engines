/**
 * Ruling 75820f1bc8540ea6 — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · [2] · 2 Might
 *   "When I defend, you may kill me to move an attacking unit to its base."
 *
 * Q: If I trigger Overzealous Fan, can I still play an action?
 * A: Yes. A showdown does not end because a unit left the battlefield — it ends only when both players pass
 *    consecutively with Focus on an empty chain. So even though the Fan killed itself and bounced the
 *    attacker, the showdown is still running and its controller may keep playing [Action]/[Reaction] cards
 *    whenever they hold Focus.
 * Rules: 383.3.a (the "you may" is decided at finalization), 383.3.b / 204.3.a ("kill me to" is the base
 *        cost, paid up front), 348 (a showdown ends on two consecutive Focus passes with an empty chain),
 *        347 (Action speed inside a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const RIDE_THE_WIND = "ogn-173-298"; // an [Action] spell for P2 to play afterwards

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).at(-1);

/** P1's turn. P2 holds bf1 with the Fan and a Guard, keeps a Reserve at home, and has Ride the Wind in hand. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Reserve" }, "reserve")
    .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

/** Striker attacks bf1; P2 opts into the Fan (killing it) and names the Striker; the trigger then resolves. */
async function fanFires(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("striker", "bf1");
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d.seat).toBe(P2);
      expect(d.timing).toBe("FIN"); // the cost rides on the opt-in
      await game.p2.yes();
    } else if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options.find((o) => (o.card ?? o.key) === "striker")?.key ?? d.options[0]!.key);
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.zoneOf("fan")).toBe("trash"); // killed as the cost, before anything resolved
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  return game;
}

describe("Ruling 75820f1bc8540ea6 — the showdown survives the Fan killing itself and bouncing the attacker", () => {
  test("after the trigger resolves the attacker is home and the Fan is dead, yet the showdown at bf1 is STILL active", async () => {
    const game = await fanFires();
    expect(game.locationOf("striker")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("P2 can still play an [Action] spell once Focus reaches them — the window did not close", async () => {
    const game = await fanFires();
    expect(showdown(game)?.focusPlayer).toBe(P1);
    await game.p1.passFocus(); // Focus to the Fan's controller
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "rtw")).toBe(true);

    await game.p2.cast("rtw", { answers: ["battlefield-bf1"], targets: "reserve" });
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "action" && game.chain().length > 0) await game.acting().passPriority();
      else if (d?.kind === "pick") await game.seat(d.seat).pick(d.options.find((o) => (o.zone ?? o.key).includes("bf1"))?.key ?? d.options[0]!.key);
      else break;
    }
    expect(game.locationOf("reserve")).toBe("bf1");
    expect(game.state("reserve").isReady).toBe(true);
  });

  test("the showdown ends only on two consecutive Focus passes with an empty chain: bf1 stays P2's, nobody scores", async () => {
    const game = await fanFires();
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0); // the attacker was gone before any damage step
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
