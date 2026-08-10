/**
 * Ruling 00740964cd67bd80 — Maddened Marauder (OGN-191 → ogn-191-298)
 *   "[Tank] When you play me, move a unit from a battlefield to its base."
 *   × Possession (OGN-203 → ogn-203-298) "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *
 * Q: An opponent plays Maddened Marauder and picks a unit I control via Possession (I control it, they
 *    own it). Does it move to MY base (controller) or THEIR base (owner)?
 * A: The controller's base. For a base location only the controller matters; a unit controlled by one
 *    player can never end up in another player's base.
 * Rules: 108.2 (a permanent belongs to its controller's side of the board), 127.1 (owner ≠ controller),
 *        446.1 ("its base" = the base of the unit's controller).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MARAUDER = "ogn-191-298";
const POSSESSION = "ogn-203-298";

/**
 * P1's turn. P2's Victim (4) stands at P2's bf1; bf2 is empty and uncontrolled. P1 holds Possession with
 * exactly 8 + [chaos]×3. P2 holds the Marauder (5) for P2's next turn.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 1, name: "Bystander" }, "bystander")
    .hand(P1, POSSESSION, "pos")
    .hand(P2, MARAUDER, "mm");
}

/** P1 Possesses the Victim (→ P1's base, P1 control), walks it onto empty bf2, then passes the turn to P2. */
async function possessedAtBf2(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pos", { targets: "victim" });
  await game.settle();
  expect(game.state("victim")).toMatchObject({ controller: P1, location: "base", owner: P2 });
  await game.p1.move("victim", "bf2");
  await game.settle();
  expect(game.state("victim")).toMatchObject({ controller: P1, location: "bf2", owner: P2 });
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  // Still P1's (Possession has no duration).
  expect(game.state("victim")).toMatchObject({ controller: P1, location: "bf2", owner: P2 });
  return game;
}

describe("Ruling 00740964cd67bd80 — Marauder moves a Possessed unit to its CONTROLLER's base", () => {
  test("setup: after Possession + a move, the Victim is owned by P2, controlled by P1, standing at bf2 on P2's turn", async () => {
    const game = await possessedAtBf2();
    expect(game.p1.units("bf2")).toEqual(["victim"]);
    expect(game.p2.units("bf2")).toEqual([]);
  });

  test("P2 plays the Marauder; its play trigger asks P2 to pick a unit at a battlefield and the Possessed Victim is offered", async () => {
    const game = await possessedAtBf2();
    await game.p2.do("addResources", { energy: 5 });
    await game.p2.play("mm", { to: "base" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).toContain("victim");
  });

  test("ruling 00740964cd67bd80 — picking the Victim sends it to P1's base (its controller's), never to P2's (its owner's); control does not change", async () => {
    const game = await possessedAtBf2();
    await game.p2.do("addResources", { energy: 5 });
    await game.p2.play("mm", { to: "base" });
    await game.settle();
    await game.p2.pick("victim");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ controller: P1, location: "base", owner: P2 });
    // On P1's side of the board, not P2's.
    expect(game.p1.units("base")).toContain("victim");
    expect(game.p2.units("base")).not.toContain("victim");
    expect(game.p2.units("base")).toContain("mm");
    expect(game.cardsAt("battlefield-bf2")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
