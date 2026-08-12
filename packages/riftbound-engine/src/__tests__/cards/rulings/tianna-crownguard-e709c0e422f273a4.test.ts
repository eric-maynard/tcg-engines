/**
 * Ruling e709c0e422f273a4 — Tianna Crownguard (SFD-060 → sfd-060-221) · 4 Might
 *   "[Deflect] / While I'm at a battlefield, opponents can't gain points."
 *
 * Q: Tianna stops me gaining my holding point; I then kill her and re-enter that battlefield with
 *    another unit — do I score a conquest point?
 * A: No. Tianna's errata denies the POINT, not the Score itself: holding still performed the Score, so
 *    the battlefield is marked scored for the turn. A battlefield can only be scored once a turn, so
 *    the later conquer scores nothing. Had you never held it (no unit there at the start of turn),
 *    killing Tianna and moving in would conquer for a point normally.
 * Rules: 054.1 (an effect can deny the point gain), 465 (a battlefield is scored at most once a turn),
 *        471.2.c (a Score that is not allowed to happen is not a conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIANNA = "sfd-060-221";
/** P1's removal, cheap enough to leave room for Tianna's [Deflect] surcharge. */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Execute",
} as const;

/** `holdBf1` decides whether P1 has a unit at bf1 when their turn begins. */
function board(opts: { holdBf1: boolean }) {
  let s = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: opts.holdBf1 ? P1 : null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Spare" }, "spare")
    .unit(P2, "bf2", TIANNA, "tianna")
    .hand(P1, EXECUTE, "exec");
  if (opts.holdBf1) {
    s = s.unit(P1, "bf1", { might: 3, name: "Holder" }, "holder");
  }
  return s;
}

/** Give P1 the Energy and the [Deflect] Power, then kill Tianna. */
async function killTianna(game: Game): Promise<void> {
  await game.p1.tapRunes(1);
  await game.p1.do("addResources", { power: { rainbow: 1 } });
  await game.p1.cast("exec", { targets: "tianna" });
  await game.settle();
  expect(game.zoneOf("tianna")).toBe("trash");
}

describe("Ruling e709c0e422f273a4 — Tianna denies the point but the hold still Scored the battlefield, so a later conquer scores nothing", () => {
  test("the hold happens and is recorded even though no point is gained", async () => {
    const game = await board({ holdBf1: true }).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0); // Tianna denied the point
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]); // …but bf1 was Scored
  });

  test("THE RULING: kill Tianna, let bf1 empty and re-enter it — the conquer happens but no point is scored", async () => {
    const game = await board({ holdBf1: true }).build();
    await game.advanceTurn();
    await killTianna(game);
    await game.p1.move("holder", "base");
    expect(game.gameState.battlefields.bf1.controller).toBeNull(); // control lapsed with the last unit
    await game.p1.move("spare", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1 }); // conquered again
    expect(game.p1.points()).toBe(0); // …for nothing: bf1 was already scored this turn
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: with no unit at bf1 at the start of the turn there was no hold, so killing Tianna and moving in DOES score", async () => {
    const game = await board({ holdBf1: false }).build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]); // nothing was scored — no hold attempt
    await killTianna(game);
    await game.p1.move("spare", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    expect(game.violations()).toEqual([]);
  });

  test("with Tianna still alive the same conquer gains nothing — the denial itself is real", async () => {
    const game = await board({ holdBf1: false }).build();
    await game.advanceTurn();
    await game.p1.move("spare", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(0);
  });
});
