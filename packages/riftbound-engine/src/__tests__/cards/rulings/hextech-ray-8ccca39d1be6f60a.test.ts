/**
 * Ruling 8ccca39d1be6f60a — Hextech Ray (OGN-009 → ogn-009-298) · Spell · Fury · [1][fury] · [Action]
 *   "Deal 3 to a unit at a battlefield."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an
 *     enemy unit here." (an attack trigger that must NOT fire)
 *
 * Q: Conquering an unoccupied battlefield — is there a showdown, and are attacker/defender assigned?
 * A: There is a Showdown, so both players may respond (this is where Hextech Ray gets played). It is NOT a combat:
 *    nobody is designated attacker or defender, "when I attack/defend" triggers do not fire, and combat-only
 *    passives such as [Assault] do not apply.
 * Rules: 344.2 (Contested with no opposing units ⇒ Showdown opens), 445 (attacker/defender designations belong to
 *        a combat), 740.2 ([Assault] applies while a unit is an ATTACKER), 466 (the Steps of Combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const YASUO_REMORSEFUL = "ogn-076-298";
const ASSAULT_SCOUT = {
  abilities: [{ keyword: "Assault", type: "keyword", value: 3 }],
  cardType: "unit",
  might: 2,
  name: "Assault Scout",
} as const;

/** P1's turn with exactly [1][fury]. bf1 is empty and uncontrolled; P2 has a body parked at its own bf2. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 5, name: "Bystander" }, "bystander")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .unit(P1, "base", ASSAULT_SCOUT, "scout")
    .hand(P1, HEXTECH_RAY, "ray");
}

async function moveIn(who: string): Promise<Game> {
  const game = await board().build();
  await game.p1.move(who, "bf1");
  return game;
}

describe("Ruling 8ccca39d1be6f60a — conquering an empty battlefield opens a Showdown, but it is not a combat", () => {
  test("a Showdown IS open — the decision is a showdown one and players may respond", async () => {
    const game = await moveIn("yasuo");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.locationOf("yasuo")).toBe("bf1");
  });

  test("no attacker or defender is designated — nobody is in a combat role", async () => {
    const game = await moveIn("yasuo");
    expect(game.state("yasuo").combatRole).toBeNull();
    expect(game.state("bystander").combatRole).toBeNull();
  });

  test("'when I attack' does not fire: the chain is empty although Yasuo just moved in", async () => {
    const game = await moveIn("yasuo");
    expect(game.chain()).toEqual([]);
    expect(game.state("bystander").damage).toBe(0);
  });

  test("[Assault] does not apply either — the Scout stays on its printed 2 Might", async () => {
    const game = await moveIn("scout");
    expect(game.state("scout")).toMatchObject({ baseMight: 2, combatRole: null, might: 2 });
  });

  test("responses are still legal inside that Showdown: Hextech Ray is playable and burns a unit elsewhere", async () => {
    const game = await moveIn("yasuo");
    expect(game.p1.can("cast", "ray")).toBe(true);
    await game.p1.cast("ray", { targets: "bystander" });
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("bystander").damage).toBe(3);
    expect(game.zoneOf("ray")).toBe("trash");
  });

  test("and the Showdown closes as a Conquer: P1 takes bf1 and scores", async () => {
    const game = await moveIn("yasuo");
    for (let i = 0; i < 8; i++) {
      await game.settle();
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "showdown") {
        break;
      }
      await game.seat(d.seat).passFocus();
    }
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
