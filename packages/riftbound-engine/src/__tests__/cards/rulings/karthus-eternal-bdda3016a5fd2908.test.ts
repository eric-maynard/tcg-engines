/**
 * Ruling bdda3016a5fd2908 — Karthus, Eternal (OGN-236 → ogn-236-298) · Unit · Order · 3 · 3 Might
 *     "Your [Deathknell] effects trigger an additional time."  (a PASSIVE ability)
 *   × Viktor, Leader (OGN-246 → ogn-246-298) · 4 Might "When another non-Recruit unit you control dies, play a 1 Might
 *     Recruit unit token into your base." (a TRIGGERED ability — the contrast case)
 *   Deathknell unit: Watchful Sentry (ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *
 * Q: Does Karthus still double other units' Deathknells when he dies in the same damage instance as them?
 * A: Yes. His ability is passive and still applies at the moment of the simultaneous deaths, so the other unit's
 *    Deathknell triggers one extra time. Unlike Viktor, Leader, whose triggered ability does not fire if he dies at the
 *    same time.
 * Rules: 365 / 370.1.a.2 (passives apply through simultaneous leave-play), 383.2.c.2 (triggered abilities must be on
 *        the board to trigger), 808.1.d.2 (Deathknell), 465 (combat damage is one simultaneous instance).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS_ETERNAL = "ogn-236-298";
const VIKTOR_LEADER = "ogn-246-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P2's turn. P1 holds bf1 with Watchful Sentry (1) + `partner`; P2's 8-Might Juggernaut attacks — enough to kill both defenders in one combat damage step. */
function board(partner: string | { might: number; name: string }) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "bf1", partner, "partner")
    .unit(P2, "base", { might: 8, name: "Juggernaut" }, "jugg")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

async function juggernautWipesBf1(game: Game): Promise<void> {
  await game.p2.move("jugg", "bf1");
  await game.settle();
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.zoneOf("partner")).toBe("trash"); // died in the SAME combat damage step
  expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1, zone: "base" });

describe("Ruling bdda3016a5fd2908 — Karthus dying alongside a Deathknell unit still doubles its Deathknell", () => {
  test("Karthus (3) and Watchful Sentry (1) both die to one combat damage assignment: the Sentry's Deathknell triggers TWICE — P1 draws d1 and d2", async () => {
    const game = await board(KARTHUS_ETERNAL).build();
    expect(game.p1.hand()).toEqual([]);
    await juggernautWipesBf1(game);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.violations()).toEqual([]);
  });

  test("reference — a vanilla 3-Might partner instead of Karthus: the same combat gives ONE Deathknell (P1 draws only d1)", async () => {
    const game = await board({ might: 3, name: "Vanilla" }).build();
    await juggernautWipesBf1(game);
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("contrast — Viktor, Leader (a TRIGGERED 'when another unit you control dies') dying in the same combat as the Sentry does NOT trigger: no Recruit token; the Sentry's single Deathknell draws d1", async () => {
    const game = await board(VIKTOR_LEADER).build();
    await juggernautWipesBf1(game);
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });
});
