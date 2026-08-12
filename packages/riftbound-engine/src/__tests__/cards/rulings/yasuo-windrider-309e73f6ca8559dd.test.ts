/**
 * Ruling 309e73f6ca8559dd — Yasuo, Windrider (OGN-205 → ogn-205-298) · 5 + [chaos] · 4 Might
 *   "[Ganking] — The third time I move in a turn, you score 1 point."
 *   × Ride the Wind (OGN-173 → ogn-173-298) "Move a friendly unit and ready it."
 *
 * Q: Does playing Yasuo, Windrider from hand count as a movement?
 * A: No. Moving means relocating a unit between two locations already on the board; entering the
 *    board from hand is a play, not a move. So the play does not advance his "third time I move"
 *    counter — three real moves are still needed.
 * Rules: 144 / 350 (a move relocates a unit between locations), 419 (playing a card puts it into a
 *        zone; it is not a move), 383.3.e ("the third time … in a turn" counts move events).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO_WINDRIDER = "ogn-205-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn with a fat pool (5 + [chaos] for Yasuo, then 2 + [chaos] per Ride the Wind).
 * Two open battlefields to shuttle between; `inHand` decides whether Yasuo starts in hand or in base.
 */
function board(inHand: boolean) {
  const s = scenario()
    .victoryScore(20)
    .resources(P1, { energy: 20, power: { chaos: 8 } })
    // Both battlefields are already P1's and stay held by their own units, so no move can conquer:
    // every point in this file comes from Yasuo's third-move ability.
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder 1" }, "h1")
    .unit(P1, "bf2", { might: 2, name: "Holder 2" }, "h2")
    .hand(P1, RIDE_THE_WIND, "rtw1")
    .hand(P1, RIDE_THE_WIND, "rtw2")
    .hand(P1, RIDE_THE_WIND, "rtw3");
  return inHand ? s.hand(P1, YASUO_WINDRIDER, "yasuo") : s.unit(P1, "base", YASUO_WINDRIDER, "yasuo");
}

/** Ride the Wind on Yasuo, sending him to `to`; also readies him for the next one. */
async function ride(game: Game, spell: string, to: string): Promise<void> {
  await game.p1.cast(spell, { targets: "yasuo" });
  for (let i = 0; i < 10; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const key = d.options.find((o) => o.key === to || o.key === `battlefield-${to}`)?.key;
      await game.p1.pick(key ?? to);
      continue;
    }
    if (d?.kind === "action" && d.context === "showdown") {
      await game.seat(d.seat).passFocus();
      continue;
    }
    break;
  }
  expect(game.zoneOf(spell)).toBe("trash");
}

describe("Ruling 309e73f6ca8559dd — playing Yasuo, Windrider from hand is not one of his three moves", () => {
  test("premise: three genuine moves DO score — Yasuo starting on the board scores on the third Ride the Wind", async () => {
    const game = await board(false).build();
    expect(game.p1.points()).toBe(0);
    await ride(game, "rtw1", "bf1");
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.p1.points()).toBe(0); // move 1
    await ride(game, "rtw2", "base");
    expect(game.locationOf("yasuo")).toBe("base");
    expect(game.p1.points()).toBe(0); // move 2
    await ride(game, "rtw3", "bf2");
    expect(game.locationOf("yasuo")).toBe("bf2");
    expect(game.p1.points()).toBe(1); // move 3 — the ability fires
  });

  test("ruling: playing Yasuo from hand does not count — after the play plus TWO moves he has still scored nothing", async () => {
    const game = await board(true).build();
    expect(game.zoneOf("yasuo")).toBe("hand");
    await game.p1.play("yasuo");
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.p1.points()).toBe(0);
    await ride(game, "rtw1", "bf1"); // move 1
    expect(game.p1.points()).toBe(0);
    await ride(game, "rtw2", "base"); // move 2 — would be the third "relocation" if the play counted
    expect(game.p1.points()).toBe(0);
  });

  test("…and the third real move after the play is what finally scores", async () => {
    const game = await board(true).build();
    await game.p1.play("yasuo");
    await game.settle();
    await ride(game, "rtw1", "bf1");
    await ride(game, "rtw2", "base");
    expect(game.p1.points()).toBe(0);
    await ride(game, "rtw3", "bf2");
    expect(game.locationOf("yasuo")).toBe("bf2");
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("the counter is per turn: after a fresh turn two more moves are again not enough", async () => {
    const game = await board(false).build();
    await ride(game, "rtw1", "bf1");
    await ride(game, "rtw2", "base");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    const banked = game.p1.points(); // holding bf1 + bf2 pays out at the new Beginning Phase
    await game.p1.do("addResources", { energy: 2, power: { chaos: 1 } });
    await ride(game, "rtw3", "bf2"); // the first move of the NEW turn
    expect(game.p1.points()).toBe(banked);
    expect(game.violations()).toEqual([]);
  });
});
