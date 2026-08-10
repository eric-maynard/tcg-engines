/**
 * Ruling a9d5f88617275641 — Tideturner (OGN-199 → ogn-199-298) · 2 Might · "[Hidden] When you play me, you may choose a unit you control
 *   at another location. Move me to its location and it to my original location."
 *   × Overzealous Fan (SFD-128 → sfd-128-221) · 2 Might · "When I defend, you may kill me to move an attacking unit to its base."
 *
 * Q: If I Tideturner an Overzealous Fan into a showdown, can I use the Fan's effect?
 * A: Yes. Tideturner played from hidden (Reaction) at the attacked battlefield swaps with the Fan; the Fan arrives, gains the
 *    Defender designation at the following Cleanup, its "When I defend" triggers, and you may kill it to send an attacking unit
 *    to its base. The swap doesn't make anything whiff — the Fan is on the battlefield to pay "kill me".
 * Rules: 811.1.c/.d (play from facedown as a Reaction; Tideturner's partner may be anywhere else), 322–323 (Cleanup assigns
 *        Defender to units arriving at a combat), 383 + cost-within-instructions ("you may kill me" is the trigger's cost),
 *        440 (combat ends when no attackers remain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const OVERZEALOUS_FAN = "sfd-128-221";

/** Turn 3, P1's turn. P2's bf1: 2-Might Holder + Tideturner facedown. P2's base: Overzealous Fan. P1's 5-Might Attacker in base. */
function board() {
  return scenario()
    .turn(3)
    .points(P1, 0)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .facedown(P2, "bf1", TIDETURNER, "tt")
    .unit(P2, "base", OVERZEALOUS_FAN, "fan")
    .unit(P1, "base", { might: 5, name: "Attacker" }, "attacker");
}

/** Attacker → bf1 (combat showdown); P1 passes Focus; P2 reveals Tideturner and opts into the swap with the Fan (in base). */
async function swapFanIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("attacker", "bf1");
  await game.p1.passFocus();
  expect(game.p2.can("reveal", "tt")).toBe(true);
  await game.p2.reveal("tt");
  expect(game.state("tt")).toMatchObject({ combatRole: "defender", zone: "battlefield-bf1" });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "tt" } });
  await game.p2.yes();
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("fan");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tt", controller: P2, triggered: true })]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // the swap resolves
  return game;
}

describe("Ruling a9d5f88617275641 — Tideturner swaps Overzealous Fan into the defense; the Fan's ability works", () => {
  test("the swap: Tideturner goes to P2's base and the Fan lands at bf1, where it becomes a DEFENDER of the ongoing combat", async () => {
    const game = await swapFanIn();
    expect(game.state("tt")).toMatchObject({ combatRole: null, zone: "base" });
    expect(game.state("fan")).toMatchObject({ combatRole: "defender", zone: "battlefield-bf1" });
    expect(game.state("attacker")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
  });

  test("its 'When I defend' triggers: P2 is asked whether to pay 'kill me' (a real decision for P2, sourced from the Fan)", async () => {
    const game = await swapFanIn();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2, source: { cardId: "fan" } });
  });

  test("ruling: P2 accepts — the Fan is killed (cost), the ability resolves and the Attacker is moved to P1's base; combat ends with bf1 still P2's, nothing conquered", async () => {
    const game = await swapFanIn();
    await game.p2.yes();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("attacker"); // "an attacking unit" (only one)
    }
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("attacker")).toMatchObject({ combatRole: null, damage: 0, zone: "base" });
    expect(game.state("holder")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("tt")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P2 declines: the Fan stays and simply defends; combat resolves normally (5 vs 2 + 2: both defenders die, Attacker conquers)", async () => {
    const game = await swapFanIn();
    await game.p2.no();
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.state("attacker")).toMatchObject({ zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
