/**
 * Ruling 56be78ee33a4ce72 — Dauntless Vanguard (SFD-093 → sfd-093-221) · Unit · Body · 4 + [body] · 4 Might
 *     "You may play me to an occupied enemy battlefield."
 *   × B.F. Sword (sfd-161-221) · Equipment · +3 — "[Equip] [order] ([order]: Attach this to a unit you control.)"
 *
 * Q: With Equipment already sitting in my base from a previous turn, can I equip it onto Dauntless Vanguard when I play
 *    it from hand straight into an occupied enemy battlefield?
 * A: No. Equip is a base-speed (plain activated) action; playing the Vanguard into an occupied enemy battlefield opens a
 *    combat showdown at once, and no base-speed action can be taken during it — for the same reason you can't then
 *    Standard-Move another unit there from base.
 * Rules: 716 / 343.1.b (Equip = activated ability without Action/Reaction → Neutral Open only), 344 (showdown states),
 *        450 / 464 (arriving at an enemy battlefield applies Contested and begins combat), 141 (Standard Move timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VANGUARD = "sfd-093-221";
const BF_SWORD = "sfd-161-221";

/** P1's turn: 4 energy + [body] (the Vanguard) + [order] (the Equip); B.F. Sword already in base (from an earlier turn); Buddy (2) ready in base; P2 holds bf1 with Wall (5). */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .gear(P1, BF_SWORD, "sword")
    .hand(P1, VANGUARD, "dv");
}

/** Units the [Equip] activation of the Sword is currently offered for (empty = not activatable now). */
const equipTargets = (game: Game): string[] =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants)
    .filter((v) => v.params.equipmentId === "sword")
    .map((v) => String(v.params.unitId));

describe("Ruling 56be78ee33a4ce72 — no equipping Dauntless Vanguard as it drops into an enemy battlefield", () => {
  test("baseline (Neutral Open, before the play): the Sword's Equip IS available — onto Buddy in base", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(equipTargets(game)).toEqual(["buddy"]);
  });

  test("playing the Vanguard to P2's occupied bf1 immediately opens a COMBAT showdown there (Vanguard = attacker, Wall = defender) with P1 holding Focus", async () => {
    const game = await board().build();
    await game.p1.play("dv", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 1 } });
    expect(game.zoneOf("dv")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    expect(game.state("dv").combatRole).toBe("attacker");
    expect(game.state("wall").combatRole).toBe("defender");
  });

  test("ruling: during that showdown the Equip is NOT offered for the Vanguard (nor for anyone) and forcing it is rejected — the Sword stays unattached in base, the [order] unspent", async () => {
    const game = await board().build();
    await game.p1.play("dv", { to: "bf1" });
    expect(equipTargets(game)).toEqual([]);
    const forced = await game.p1.try((p) => p.do("equipCard", { equipmentId: "sword", unitId: "dv" }));
    expect(forced.ok).toBe(false);
    expect(game.state("dv").attachments).toEqual([]);
    expect(game.state("sword")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.power("order")).toBe(1);
    expect(game.state("dv").might).toBe(4);
  });

  test("same reason, same answer for a Standard Move: Buddy cannot be walked from base into bf1 while that showdown is open", async () => {
    const game = await board().build();
    await game.p1.play("dv", { to: "bf1" });
    expect(game.p1.can("move", "buddy")).toBe(false);
    expect((await game.p1.try((p) => p.move("buddy", "bf1"))).ok).toBe(false);
    expect(game.locationOf("buddy")).toBe("base");
  });

  test("the combat then resolves with an un-equipped 4-Might Vanguard: it dies to the Wall (5), which survives with P2 keeping bf1; back in Neutral Open the Equip is offered again (Buddy)", async () => {
    const game = await board().build();
    await game.p1.play("dv", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("dv")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(equipTargets(game)).toEqual(["buddy"]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — played to BASE instead (no showdown), the Vanguard can be equipped right away: Sword attached, 4 + 3 = 7 Might", async () => {
    const game = await board().build();
    await game.p1.play("dv", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(equipTargets(game).sort()).toEqual(["buddy", "dv"]);
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "dv" });
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("dv");
    expect(game.state("dv")).toMatchObject({ attachments: ["sword"], might: 7 });
    expect(game.p1.power("order")).toBe(0);
  });
});
