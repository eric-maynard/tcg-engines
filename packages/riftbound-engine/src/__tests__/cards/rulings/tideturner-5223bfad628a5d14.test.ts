/**
 * Ruling 5223bfad628a5d14 — Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · [2] · 2 Might · [Hidden]
 *   "When you play me, you may choose a unit you control at another location. Move me to its location and it to
 *    my original location."
 *   × Overzealous Fan (SFD-128 → sfd-128-221) · 2 Might · "When I defend, you may kill me to move an attacking
 *     unit to its base."
 *
 * Q: An opponent attacks my battlefield; I play Tideturner from Hidden there and swap in Overzealous Fan from
 *    elsewhere — can I still use the Fan's ability?
 * A: Yes. Tideturner (a Reaction from hidden) resolves and swaps; the Fan arrives at the contested battlefield,
 *    gains the Defender designation, its "When I defend" triggers, and since it is on the board it can pay its
 *    own "kill me" cost to send the attacker home.
 * Rules: 811 (hidden ⇒ Reaction play at that battlefield), combat designations gained on arrival (cleanup),
 *        383 (defend trigger), 356 (paying a kill-self cost requires the permanent on the board).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const OVERZEALOUS_FAN = "sfd-128-221";

/**
 * P2's turn. P1 holds bf1 with a 3-Might Guard and Tideturner facedown there; Overzealous Fan and a 1-Might
 * Bystander sit in P1's base. P2's 4-Might Raider attacks bf1.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .facedown(P1, "bf1", TIDETURNER, "tide")
    .unit(P1, "base", OVERZEALOUS_FAN, "fan")
    .unit(P1, "base", { might: 1, name: "Bystander" }, "bystander")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

/** Raider attacks; P2 passes Focus; P1 plays Tideturner from hidden, opts into the swap and picks the Fan; it resolves. */
async function swapFanIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "tide")).toBe(true);
  await game.p1.reveal("tide");
  expect(game.locationOf("tide")).toBe("bf1"); // enters where it was hidden
  // "you MAY choose a unit you control at another location" — opt-in, then the choice (Fan or Bystander; not Guard, who is here).
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
  expect(offered).toEqual(["bystander", "fan"]);
  await game.p1.pick("fan");
  await game.p1.passPriority();
  await game.p2.passPriority(); // Tideturner's trigger resolves: the swap
  return game;
}

describe("Ruling 5223bfad628a5d14 — Fan swapped into the defense by a hidden Tideturner still gets to 'kill me' the attacker home", () => {
  test("Tideturner resolves: Tideturner is now in base, the Fan is at the contested bf1 and has gained the Defender designation — its 'When I defend' trigger is on the chain", async () => {
    const game = await swapFanIn();
    expect(game.locationOf("tide")).toBe("base");
    expect(game.locationOf("fan")).toBe("bf1");
    expect(game.state("fan").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P1, triggered: true })]);
    // The optional "kill me" cost is payable: the Fan is on the board.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.kind === "yes-no" ? d.canAccept : undefined).not.toBe(false);
  });

  test("P1 pays 'kill me': the Fan dies, and on resolution the attacking Raider is moved to P2's base — the attack is over with bf1 still P1's and no points for P2", async () => {
    const game = await swapFanIn();
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("raider");
    }
    expect(game.zoneOf("fan")).toBe("trash"); // cost paid up front
    await game.p1.passPriority();
    await game.p2.passPriority(); // the Fan's ability resolves (no whiff — its target was locked, the Fan merely died as the cost)
    expect(game.locationOf("raider")).toBe("base");
    expect(game.state("raider").owner).toBe(P2);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("tide")).toBe("base");
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("declining the Fan's option instead: the Fan simply defends alongside the Guard (2 + 3 vs 4) and the Raider dies in combat", async () => {
    const game = await swapFanIn();
    await game.p1.no();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
