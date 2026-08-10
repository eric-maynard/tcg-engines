/**
 * Ruling 96ab5b6facfb6c9c — Ride the Wind (OGN-173 → ogn-173-298) × Sprite Call (OGN-094 → ogn-094-298)
 *   (× Sprite token OGN-274; defend-trigger witness: Ahri, Inquisitive ogn-119-298 standing in for "e.g. Teemo")
 *
 *   Ride the Wind — Action 2+[chaos]: "Move a friendly unit and ready it."
 *   Sprite Call — [Hidden][Action] 3: "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *   Ahri, Inquisitive — 3 Might: "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1."
 *
 * Q: Opponent contests an EMPTY battlefield; during that showdown I Ride the Wind my unit there. Do I score if I win?
 *    Can I Sprite Call to that battlefield?
 * A: A combat follows with the opponent (who contested first) as Attacker and me as Defender; "when I defend" triggers
 *    fire; if I win with a unit still there and haven't scored that battlefield this turn I conquer it and score.
 *    Sprite Call cannot put the token at that battlefield — I don't control it.
 * Rules: 344/345 (showdown on an uncontrolled battlefield), 459–461 (attacker = contester), 466.5 (winner conquers),
 *        184/350 (tokens are played to your base or a battlefield you control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const SPRITE_CALL = "ogn-094-298";
const AHRI_INQUISITIVE = "ogn-119-298";

/**
 * P1's (the opponent's) turn. bf1 empty, uncontrolled. P1's Scout (2) in base. P2 (me): exhausted Ahri (3) in base,
 * Ride the Wind + Sprite Call in hand, 5 energy + chaos. Nobody has points; P2 controls no battlefield.
 */
function board() {
  return scenario()
    .victoryScore(8)
    .resources(P2, { energy: 5, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", AHRI_INQUISITIVE, "ahri", { exhausted: true })
    .hand(P2, RIDE_THE_WIND, "rtw")
    .hand(P2, SPRITE_CALL, "sprite");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Scout contests empty bf1; P1 passes Focus; P2 Ride-the-Winds Ahri to bf1 (resolves: arrives ready). */
async function contestThenRideIn(game: Game): Promise<void> {
  await game.p1.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
  expect(showdown(game)?.isCombatShowdown).not.toBe(true);
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "rtw")).toBe(true);
  await game.p2.cast("rtw", { targets: "ahri" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bf1");
  }
  await game.p2.passPriority();
  await game.p1.passPriority(); // Ride the Wind resolves
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("ahri")).toBe("bf1");
  expect(game.state("ahri").isReady).toBe(true);
}

describe("Ruling 96ab5b6facfb6c9c — Ride the Wind into a contested empty battlefield: I defend, and can conquer", () => {
  test("a combat showdown follows with the contester (P1) ATTACKING and me (P2) DEFENDING; nobody controls bf1 yet", async () => {
    const game = await board().build();
    await contestThenRideIn(game);
    for (let i = 0; i < 8 && showdown(game)?.isCombatShowdown !== true; i++) {
      await game.acting().pass();
    }
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("ahri").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("'when I defend' triggers happen: Ahri's defend trigger goes on the chain and shrinks the Scout 2 → 1", async () => {
    const game = await board().build();
    await contestThenRideIn(game);
    for (let i = 0; i < 8 && !game.chain().some((c) => c.cardId === "ahri"); i++) {
      await game.acting().pass();
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P2, triggered: true })]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("scout").might).toBe(1);
  });

  test("Sprite Call during that showdown cannot go to bf1 (I don't control it): no bf1 destination is offered and the token lands in my base", async () => {
    const game = await board().build();
    await contestThenRideIn(game);
    // Drain Ahri's trigger, then find P2's Focus with an empty chain.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "showdown" && d.seat === P2 && game.chain().length === 0) {
        break;
      }
      await game.acting().pass();
    }
    expect(game.p2.can("cast", "sprite")).toBe(true);
    const loc = game.p2.option("cast", "sprite")?.fields.find((f) => f.arg === "to" || f.name === "location");
    expect((loc?.options ?? []) as string[]).not.toContain("battlefield-bf1");
    const before = new Set(game.p2.units());
    await game.p2.cast("sprite");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        expect(d.options.map((o) => o.key)).not.toContain("battlefield-bf1");
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else {
        await game.acting().pass();
      }
    }
    const sprite = game.p2.units().find((u) => !before.has(u));
    expect(sprite).toBeDefined();
    expect(game.state(sprite as string)).toMatchObject({ isToken: true, might: 3, name: "Sprite" });
    expect(game.zoneOf(sprite as string)).toBe("base");
    expect(game.p2.units("bf1")).toEqual(["ahri"]);
  });

  test("winning as the defender with a unit still there: Ahri (3) kills the Scout (1), I CONQUER bf1 and score 1", async () => {
    const game = await board().build();
    await contestThenRideIn(game);
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
