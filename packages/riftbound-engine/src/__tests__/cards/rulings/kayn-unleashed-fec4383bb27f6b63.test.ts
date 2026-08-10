/**
 * Ruling fec4383bb27f6b63 — Kayn, Unleashed (OGN-189 → ogn-189-298) · Unit · Chaos · 6+[chaos] · 6 Might
 *   "[Ganking] If I have moved twice this turn, I don't take damage."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] "Move a friendly unit and ready it."
 *
 * Q: Kayn moves to an empty battlefield and conquers; Ride the Wind then moves him (readied) into a contested battlefield;
 *    he fights, can't conquer and is pushed back to base. Is he still ready, able to move out again?
 * A: Yes. Only the Standard Move exhausts; a move by effect (Ride the Wind) doesn't, and neither does the recall after a
 *    lost combat. Kayn is ready in base and may move again.
 * Rules: 144.2 (Standard Move exhausts), 446 (moves by effect don't), 458.1 / 466.1.a.2 (recall keeps ready state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. bf1 empty & uncontrolled; P2 holds bf2 with a 7-Might Wall (survives Kayn's 6). Kayn ready in base; RtW + 2+[chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 7, name: "Wall" }, "wall")
    .unit(P1, "base", KAYN, "kayn")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Step 1: Standard Move to the empty bf1 → (showdown, all pass) → P1 conquers bf1; Kayn is exhausted by the move. */
async function conquerBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("kayn", "bf1");
  await game.settle();
  expect(game.locationOf("kayn")).toBe("bf1");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(game.state("kayn").isExhausted).toBe(true); // 144.2
  return game;
}

/** Step 2: Ride the Wind Kayn → bf2 (readied), resolve; the staged combat at bf2 opens. */
async function rideToBf2(game: Game): Promise<void> {
  await game.p1.cast("rtw", { targets: "kayn", answers: ["bf2"] });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("bf2");
  }
  for (let i = 0; i < 8; i++) {
    const x = game.decision();
    if (x?.kind === "action" && x.context === "chain") {
      await game.seat(x.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("kayn")).toBe("bf2");
}

describe("Ruling fec4383bb27f6b63 — Kayn readied by Ride the Wind stays ready through a lost combat's recall", () => {
  test("Ride the Wind moves the exhausted Kayn from bf1 into bf2 and READIES him; he is the attacker there", async () => {
    const game = await conquerBf1();
    await rideToBf2(game);
    expect(game.state("kayn")).toMatchObject({ combatRole: "attacker", isReady: true, location: "bf2" });
    expect(game.gameState.battlefields.bf2?.contested).toBe(true);
  });

  test("the combat: Kayn (moved twice → takes no damage) can't kill the 7-Might Wall, so he doesn't conquer and is RECALLED to base — still READY", async () => {
    const game = await conquerBf1();
    await rideToBf2(game);
    await game.settle();
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf2" }); // took 6 < 7, healed
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(1); // no second conquer
    expect(game.locationOf("kayn")).toBe("base");
    expect(game.state("kayn")).toMatchObject({ damage: 0, isExhausted: false, isReady: true });
    expect(game.violations()).toEqual([]);
  });

  test("…so Kayn can take the Standard Move AGAIN this turn (which does exhaust him)", async () => {
    const game = await conquerBf1();
    await rideToBf2(game);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(true);
    await game.p1.move("kayn", "bf1");
    expect(game.locationOf("kayn")).toBe("bf1");
    expect(game.state("kayn").isExhausted).toBe(true);
  });
});
