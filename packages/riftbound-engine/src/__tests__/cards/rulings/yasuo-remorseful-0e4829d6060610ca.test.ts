/**
 * Ruling 0e4829d6060610ca — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Champion Unit · Calm · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Unforgiven (ogn-259-298) · Legend (Yasuo) "[2], [Exhaust]: Move a friendly unit to or from its base."
 *   × Relentless Pursuit (sfd-184-221) · [Action] "Move a friendly unit. …" — the opponent's way to arrive mid-showdown.
 *
 * Q: Does Yasuo's ability trigger when he arrives at an enemy battlefield via the legend ability, or only via unit movement?
 * A: It triggers whenever he becomes designated as an Attacker at a battlefield, however he got there (Standard Move or the
 *    legend's move). Usually that is the showdown's initial chain; it also happens mid-combat. Nuances: the battlefield need
 *    not be enemy-controlled when he arrives — if he moves onto an EMPTY battlefield and an enemy unit moves in during the
 *    showdown, Yasuo's side applied Contested first so he is the attacker, and the ability still triggers.
 * Rules: 383.4.e ("When I attack" = when I gain the Attacker designation), 464.2 (roles: the contesting player attacks),
 *        345 / 344.1 (a non-combat showdown becomes a combat when an opposing unit arrives), 421 (move by effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";
const UNFORGIVEN = "ogn-259-298";
const RELENTLESS_PURSUIT = "sfd-184-221";
// rule 355.7 / 355.9 (riftjudge 4283ca02526c0650) — the Equipment is named as the
// spell is played, so Relentless Pursuit needs one in play to be castable at all.
const RP_EQUIPMENT = "sfd-042-221";

/** P1's turn 3 with [2] for the legend. P2 holds bf1 with Guard (3). Yasuo (6) in P1's base. */
function enemyHeld() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2 })
    .legend(P1, UNFORGIVEN, "unforgiven")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo");
}

/** Activate Unforgiven on Yasuo → bf1 (destination answered if asked); both pass so the ability resolves. */
async function legendSendsYasuoToBf1(game: Game): Promise<void> {
  game.script(P1, [(d) => (d.kind === "pick" && d.semantics === "destination" ? "battlefield-bf1" : undefined)]);
  await game.p1.activate("unforgiven", 0, { targets: "yasuo" });
  expect(game.state("unforgiven").isExhausted).toBe(true);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "unforgiven", controller: P1 })]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // the move resolves
  expect(game.locationOf("yasuo")).toBe("bf1");
}

describe("Ruling 0e4829d6060610ca — Yasuo's 'When I attack' fires however he arrives, as soon as he is designated attacker", () => {
  test("baseline — Standard Move into the enemy bf1: showdown opens, Yasuo is the attacker, his trigger is on the initial chain aimed at Guard", async () => {
    const game = await enemyHeld().build();
    await game.p1.move("yasuo", "bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["guard"], triggered: true })]);
  });

  test("via the LEGEND ability: once Unforgiven's move resolves and the chain empties, the combat showdown begins at bf1 — Yasuo is designated attacker and the SAME trigger goes on that showdown's initial chain", async () => {
    const game = await enemyHeld().build();
    await legendSendsYasuoToBf1(game);
    expect(game.state("yasuo").isReady).toBe(true); // moved by an effect, not exhausted
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["guard"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("…and it resolves normally: 6 damage kills Guard (3); with no defender left Yasuo conquers bf1 for a point", async () => {
    const game = await enemyHeld().build();
    await legendSendsYasuoToBf1(game);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — the battlefield need not be enemy-held on arrival: legend-moved onto an EMPTY bf1 (non-combat showdown, no trigger yet); P2 then moves Guard in with an [Action] spell during the showdown → it becomes a combat with Yasuo (who contested first) as ATTACKER, and his trigger fires then", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 2, power: { body: 1, fury: 1 } })
      .legend(P1, UNFORGIVEN, "unforgiven")
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", { might: 3, name: "Guard" }, "guard")
      .gear(P2, RP_EQUIPMENT, "rpEquip")
      .hand(P2, RELENTLESS_PURSUIT, "pursuit")
      .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
      .build();
    await legendSendsYasuoToBf1(game);
    // a showdown at the uncontrolled bf1, contested by P1 — but no enemy there: not a combat, no attacker, no trigger
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("yasuo").combatRole).not.toBe("attacker");
    expect(game.chain()).toEqual([]);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "pursuit")).toBe(true);
    game.script(P2, [(d) => (d.kind === "pick" && d.semantics === "destination" ? "battlefield-bf1" : undefined)]);
    await game.p2.cast("pursuit", { targets: ["guard", "rpEquip"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Pursuit resolves: Guard arrives at bf1
    const attach = game.decision();
    if (attach?.seat === P2 && (attach.kind === "yes-no" || attach.kind === "pick")) {
      // Pursuit's Equipment is named at play time but attaching stays optional (355.13).
      await (attach.kind === "yes-no" ? game.p2.no() : game.p2.decline());
    }
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker"); // P1 applied Contested first
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["guard"], triggered: true })]);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
