/**
 * Ruling 517fad5061b35b1b — Miss Fortune, Buccaneer (OGN-193 → ogn-193-298) "…Friendly units may be played to open battlefields."
 *   × Get Excited! (OGN-008 → ogn-008-298) · Action · [2][fury] "Discard 1. Deal its Energy cost as damage to a unit at a battlefield."
 *   × Flame Chompers (OGN-006 → ogn-006-298) · [3] · 3 Might "When you discard me, you may pay [fury] to play me."
 *
 * Q: Opponent moves onto an OPEN battlefield (showdown). With Miss Fortune out, can I Get Excited (discard Chompers) to kill their
 *    unit, then play Chompers into that open battlefield and conquer?
 * A: Yes — all inside the same NON-combat showdown: Get Excited kills their unit (3 = Chompers' cost), Chompers' discard trigger
 *    plays it to the now-open battlefield, the opponent still gets to respond, and when the showdown ends Chompers is the only
 *    unit there and conquers. No second showdown.
 * Rules: 344/345 (non-combat showdown at an open battlefield; whoever remains takes control), 383.3.b (Chompers' paid trigger),
 *        358 (a play via an ability ignores normal timing), MF's static play permission.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MISS_FORTUNE = "ogn-193-298";
const GET_EXCITED = "ogn-008-298";
const FLAME_CHOMPERS = "ogn-006-298";

/**
 * P2's turn. bf1 is open (uncontrolled, empty). P1: Miss Fortune in base, Get Excited + Flame Chompers in hand, exactly
 * [2] + 2 fury (GE's pip + Chompers' [fury]). P2: 3-Might Scout in base.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", MISS_FORTUNE, "mf")
    .unit(P2, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, FLAME_CHOMPERS, "chomp");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
type Pick = Extract<Decision, { kind: "pick" }>;

/** Scout → bf1 (non-combat showdown); P2 passes focus; P1 Get Excited @ Scout; resolves; discard Chompers; YES to [fury]. Stops at the destination prompt. */
async function toChompersDestination(): Promise<{ game: Game; dest: Pick }> {
  const game = await board().build();
  await game.p2.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
  expect(showdown(game)?.isCombatShowdown ?? false).toBe(false);
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "ge")).toBe(true);
  await game.p1.cast("ge", { targets: "scout" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("chomp");
  expect(game.zoneOf("chomp")).toBe("trash");
  expect(game.zoneOf("scout")).toBe("trash"); // 3 damage (Chompers' Energy cost) on a 3-Might unit
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "chomp" } });
  await game.p1.yes();
  for (let i = 0; i < 6 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  return { dest: d as Pick, game };
}

describe("Ruling 517fad5061b35b1b — Get Excited → Flame Chompers into the open battlefield, all in the opponent's showdown, then conquer", () => {
  test("inside P2's non-combat showdown P1 kills the Scout with Get Excited/Chompers and — thanks to Miss Fortune — the open bf1 is offered as Chompers' destination", async () => {
    const { game, dest } = await toChompersDestination();
    expect(dest.options.map((o) => o.key)).toContain("battlefield-bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" }); // still the same showdown
    expect(game.turnPlayer()).toBe(P2);
  });

  test("Chompers is played to bf1 ([fury] paid); the SAME showdown continues and P2 gets a chance to respond before it ends", async () => {
    const { game } = await toChompersDestination();
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("chomp")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(showdown(game)?.isCombatShowdown ?? false).toBe(false);
    // P2 will hold Focus (now or after P1 passes) before the showdown can end.
    let p2HadFocus = game.actingSeat() === P2;
    if (!p2HadFocus) {
      await game.p1.passFocus();
      p2HadFocus = game.actingSeat() === P2 && game.decision()?.kind === "action";
    }
    expect(p2HadFocus).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull(); // nothing conquered before the showdown ends
  });

  test("everyone passes → the showdown ends with Chompers the only unit there: P1 conquers bf1 and scores 1; no second showdown, back to P2's main phase", async () => {
    const { game } = await toChompersDestination();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("chomp")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
