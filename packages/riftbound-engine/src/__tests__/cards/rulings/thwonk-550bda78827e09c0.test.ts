/**
 * Ruling 550bda78827e09c0 — Thwonk! (SFD-040 → sfd-040-221) · Spell · Calm · [2] · [Action] [Repeat][2]
 *   "Stun an attacking unit. (It doesn't deal combat damage this turn.)"
 *
 * Q: Can I Thwonk! a unit that is moving into an EMPTY battlefield?
 * A: No. Moving to an unoccupied battlefield opens a non-combat showdown; attacker/defender designations only exist in
 *    combat, so that unit is not an "attacking unit" and Thwonk! has no legal target. Combat (and attackers) only happen
 *    when moving to an occupied battlefield.
 * Rules: 340–348 (non-combat showdown), 464.2 (Attacker/Defender designations exist only in combat), 355.8 (no legal
 *        target ⇒ the spell can't be played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const THWONK = "sfd-040-221";

/** P2's turn. bf1 is empty/uncontrolled; P1 holds bf2 with a Guard (4). P2's Raider (3) is in base. P1 has Thwonk! and [2]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, THWONK, "thwonk");
}

describe("Ruling 550bda78827e09c0 — Thwonk! needs an ATTACKING unit; a unit walking onto an empty battlefield isn't one", () => {
  test("Raider moves onto the empty bf1: a NON-combat showdown opens, the Raider has no Attacker designation, and even with Focus P1 cannot cast Thwonk! (no legal target)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("raider").combatRole).not.toBe("attacker");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // P1 holds Focus: Action timing is fine …
    expect(game.p1.can("cast", "thwonk")).toBe(false); // … but there is nothing to stun
    const r = await game.p1.try((p) => p.cast("thwonk", { targets: "raider" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("thwonk")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
    await game.p1.passFocus();
    await game.settle();
    expect(game.state("raider").isStunned).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // it simply conquers the empty battlefield
    expect(game.p2.points()).toBe(1);
  });

  test("contrast — the same Raider moving onto P1's OCCUPIED bf2 is an attacker in a combat: with Focus P1 Thwonks it, it is stunned, deals no combat damage and dies to the Guard", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf2");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P2, defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "thwonk")).toBe(true);
    const targets = (game.p1.option("cast", "thwonk")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(targets.flat()).toEqual(["raider"]); // the Guard (a defender) is not offered
    await game.p1.cast("thwonk", { targets: "raider" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("thwonk")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash"); // 4 from the Guard, dealt nothing back
    expect(game.state("guard")).toMatchObject({ damage: 0, location: "bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
