/**
 * Ruling 4e25f752769d5ecd — Ride the Wind (OGN-173 → ogn-173-298) · [Action] "Move a friendly unit and ready it."
 *   × Overzealous Fan (SFD-128 → sfd-128-221) · 2 Might · "When I defend, you may kill me to move an attacking unit to its base."
 *
 * Q: My opponent starts a showdown on an empty battlefield. Can I Ride the Wind my Overzealous Fan in and use his
 *    ability to push the attacker back?
 * A: Yes. Ride the Wind (Action) is playable in the showdown; when it resolves the Fan arrives, gains the Defender
 *    designation at the following cleanup, his "When I defend" trigger goes on the chain (respondable), and on
 *    resolution you may kill him to send the attacking unit to its base.
 * Rules: 340 ff. (showdown, Focus/Action timing), 450–452 (late arrivals gain designations at cleanup), 383.4.f (defend
 *        triggers fire on first gaining Defender, even mid-showdown).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const OVERZEALOUS_FAN = "sfd-128-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P2's turn. bf1 is empty and uncontrolled. P1: Fan in base, Ride the Wind with exactly [2][chaos]. P2: Raider (3) in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", OVERZEALOUS_FAN, "fan")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2's Raider walks onto empty bf1 (showdown opens, P2 has Focus) and passes Focus to P1. */
async function raiderOpensShowdown(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
}

/** P1 Rides the Wind on the Fan into bf1 and lets the spell resolve (both pass). */
async function rideFanIn(game: Game): Promise<void> {
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "fan" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bf1");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  for (let i = 0; i < 4 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("battlefield-bf1");
    } else {
      await game.acting().passPriority();
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling 4e25f752769d5ecd — Ride the Wind an Overzealous Fan into an open showdown, then bounce the attacker", () => {
  test("during the showdown P1 casts Ride the Wind (Action): the Fan arrives at bf1 ready and becomes the DEFENDER; his 'When I defend' trigger is on the chain as P1's optional ability", async () => {
    const game = await board().build();
    await raiderOpensShowdown(game);
    await rideFanIn(game);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.state("fan").isReady).toBe(true);
    expect(game.state("fan").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fan" } });
  });

  test("accepting: the Fan is killed (the cost) and, once both pass on the trigger, the attacking Raider is moved to P2's base — bf1 ends up nobody's", async () => {
    const game = await board().build();
    await raiderOpensShowdown(game);
    await rideFanIn(game);
    await game.p1.yes();
    expect(game.zoneOf("fan")).toBe("trash"); // kill-me cost paid up front
    // Players may still respond to the trigger before it resolves.
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("raider");
      } else {
        await game.acting().passPriority();
      }
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("raider");
    }
    expect(game.zoneOf("raider")).toBe("base");
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("declining: the Fan stays and it becomes a real fight — Raider 3 vs Fan 2, the Fan dies and P2 conquers bf1", async () => {
    const game = await board().build();
    await raiderOpensShowdown(game);
    await rideFanIn(game);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
