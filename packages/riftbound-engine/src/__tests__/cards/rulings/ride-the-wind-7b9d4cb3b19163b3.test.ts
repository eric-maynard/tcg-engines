/**
 * Ruling 7b9d4cb3b19163b3 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · [Action]
 *     "Move a friendly unit and ready it."
 *
 * Q: P1 is on 7 points holding battlefield A; on P2's turn P2 moves a unit into A. Can P1 Ride the Wind over to the
 *    other battlefield and win?
 * A: No — P1 does not win. P2's showdown at A resolves first and hands A to P2; P1 is then left controlling only the
 *    other battlefield, never both at once, so the 8th point is not scored.
 * Rules: 348.2.a / 466.5 (control is established when the showdown closes), 467 (scoring), 190.4.b (the defender keeps
 *        A only while the showdown there is ongoing), 610 (a player wins on reaching the victory score).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn. P1 is on 7 points and holds bf1 ("A") with an exhausted Holder; bf2 ("B") is uncontrolled and empty. */
function board() {
  return scenario()
    .active(P2)
    .points(P1, 7)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder", { exhausted: true })
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2 attacks bf1; P2 passes Focus so P1 may act inside the showdown. */
async function raidOnA(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
  if (game.decision()?.seat === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 7b9d4cb3b19163b3 — riding away from the attacked battlefield loses it, so the 8th point is not scored", () => {
  test("Ride the Wind is castable in the showdown and offers the Holder the two destinations it is not already at (base, bf2)", async () => {
    const game = await raidOnA();
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "holder" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual(["base", "battlefield-bf2"]);
  });

  test("ruling 7b9d4cb3b19163b3 — moving to B abandons A: P2 conquers A and scores it, P1 is left controlling only B and stays on 7 — no win", async () => {
    const game = await raidOnA();
    await game.p1.cast("rtw", { targets: "holder" });
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    await game.settle(); // the showdown P1's arrival staged at B then closes too
    expect(game.locationOf("holder")).toBe("bf2");
    expect(game.state("holder").isExhausted).toBe(false); // "and ready it"
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7); // never held both at once ⇒ no 8th point
    expect(game.p2.points()).toBe(1); // P2's conquer of A
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  test("control — the win condition itself works: on P1's own turn, conquering an open battlefield takes P1 from 7 to 8 and ends the game", async () => {
    const game = await scenario()
      .points(P1, 7)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3, name: "Holder" }, "holder")
      .build();
    await game.p1.move("holder", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
