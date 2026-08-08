/**
 * Interaction: Zenith Blade (ogn-262-298) "[Action] Stun an enemy unit at a battlefield. You may move a friendly unit to
 *   that enemy unit's battlefield."
 *   × Sunlit Guardian (ogn-054-298) 3 Might · [Shield] (+1 while defender) · [Tank]
 *   × Chemtech Enforcer (ogn-003-298) 2 Might · [Assault 2] (+2 while attacker)
 *
 * Question — which designation does the unit Zenith Blade drops into a battlefield receive?
 *   (A — mid-combat, P2's turn) Enforcer Standard-Moves onto P1's bfA (vanilla 2-Might Sentinel defending). Combat opens,
 *       P2 passes Focus, P1 plays Zenith Blade: stun Enforcer, move Guardian base→bfA. bfA is already Contested with a
 *       Combat in progress → nothing new is applied or staged (190.3.a.1 / 190.3.b). Guardian arrives undesignated and
 *       in the following Cleanup gains the designation "appropriate for its controller" = DEFENDER (464.2.c.3.a /
 *       323.2.a) — moving in does not make you an attacker. Shield live (4), Tank live. Focus passes to P2. Damage:
 *       stunned Enforcer contributes 0 (423.1.b); defenders deal 2+4 ≥ 4 → Enforcer dies; P1 holds bfA.
 *   (B — Neutral Open, P1's turn) Enforcer sits on P2's bfB. Zenith Blade: stun Enforcer, move Guardian base→bfB.
 *       Guardian's controller doesn't control bfB → P1 applies Contested (450 / 190.3.a); Cleanup stages Combat and it
 *       begins (323.9 / 323.13): P1 = Attacker with Focus, Guardian = attacker → Shield OFF (3); Enforcer = defender →
 *       Assault OFF (2) and, stunned, deals 0. 3 ≥ 2 kills Enforcer; P1 Conquers bfB, +1 (466.5.d).
 *   PARITY for (B): a Standard Move base→bfB yields the same Contested/attacker/Focus picture — but exhausts Guardian
 *       and leaves Enforcer unstunned.
 *   Lesson: the same card makes the same unit a Defender (A) or an Attacker (B) purely by who applied Contested.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";
const SUNLIT_GUARDIAN = "ogn-054-298";
const CHEMTECH_ENFORCER = "ogn-003-298";

/** (A) P2's turn. P1 holds bfA with a vanilla Sentinel; Guardian waits in P1's base; Enforcer ready in P2's base. */
function boardA() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { calm: 1, order: 1 } })
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "bfA", { might: 2, name: "Sentinel" }, "sentinel")
    .unit(P1, "base", SUNLIT_GUARDIAN, "guardian")
    .unit(P2, "base", CHEMTECH_ENFORCER, "enforcer")
    .hand(P1, ZENITH_BLADE, "zb");
}

/** (B) P1's turn, Neutral Open. Enforcer alone on P2's bfB; Guardian in P1's base. */
function boardB() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1, order: 1 } })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "base", SUNLIT_GUARDIAN, "guardian")
    .unit(P2, "bfB", CHEMTECH_ENFORCER, "enforcer")
    .hand(P1, ZENITH_BLADE, "zb");
}

/** Cast Zenith Blade [stun enforcer, move guardian], let it resolve, and take the (only) destination when asked. */
async function zenithBlade(game: Game, destination: string) {
  await game.p1.cast("zb", { targets: ["enforcer", "guardian"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.key)).toEqual([`battlefield-${destination}`]); // "that enemy unit's battlefield" only
    await game.p1.pick(`battlefield-${destination}`);
  }
}

describe("Zenith Blade × Sunlit Guardian × Chemtech Enforcer — designation follows who applied Contested", () => {
  // ================================================================ (A) mid-combat reinforcement
  test("(A) P1 may play the [Action] Zenith Blade with Focus inside the combat showdown; the attacking Enforcer is the only stun target", async () => {
    const game = await boardA().build();
    await game.p2.move("enforcer", "bfA");
    expect(game.state("enforcer")).toMatchObject({ combatRole: "attacker", might: 4 }); // Assault 2 live
    expect(game.state("sentinel").combatRole).toBe("defender");
    expect(game.p1.can("cast", "zb")).toBe(false); // P2 (attacker) holds Focus first
    await game.p2.passFocus();
    expect(game.p1.can("cast", "zb")).toBe(true);
    const tuples = (game.p1.option("cast", "zb")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect([...new Set(tuples.map((t) => t[0]))]).toEqual(["enforcer"]);
    expect(new Set(tuples.map((t) => t[1]))).toEqual(new Set(["guardian", "sentinel"])); // any friendly unit may be moved
    await game.p1.cast("zb", { targets: ["enforcer", "guardian"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zb", targets: ["enforcer", "guardian"] })]);
  });

  test("(A) on resolution: Enforcer Stunned; Guardian arrives at bfA by effect (not exhausted); bfA stays Contested BY P2 — no new Contested, no second showdown staged (190.3.a.1 / 190.3.b)", async () => {
    const game = await boardA().build();
    await game.p2.move("enforcer", "bfA");
    await game.p2.passFocus();
    await zenithBlade(game, "bfA");
    expect(game.state("enforcer").isStunned).toBe(true);
    expect(game.locationOf("guardian")).toBe("bfA");
    expect(game.state("guardian").isExhausted).toBe(false);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    const stack = game.gameState.interaction?.showdownStack ?? [];
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.zoneOf("zb")).toBe("trash");
  });

  test("(A) Guardian joins THIS combat as a DEFENDER (464.2.c.3.a / 323.2.a) — Shield live (4 Might), Tank live — and Focus passes to P2", async () => {
    const game = await boardA().build();
    await game.p2.move("enforcer", "bfA");
    await game.p2.passFocus();
    await zenithBlade(game, "bfA");
    expect(game.state("guardian")).toMatchObject({ combatRole: "defender", might: 4 });
    expect(game.state("guardian").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    expect(game.state("sentinel")).toMatchObject({ combatRole: "defender", might: 2 });
    expect(game.state("enforcer")).toMatchObject({ combatRole: "attacker", isStunned: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("(A) result: stunned Enforcer contributes 0 (423.1.b), defenders deal 6 ≥ 4 → Enforcer dies; P1 keeps bfA as Defender, nobody scores, Guardian stays (back to 3 Might)", async () => {
    const game = await boardA().build();
    await game.p2.move("enforcer", "bfA");
    await game.p2.passFocus();
    await zenithBlade(game, "bfA");
    await game.settle();
    expect(game.zoneOf("enforcer")).toBe("trash");
    expect(game.state("sentinel")).toMatchObject({ damage: 0, location: "bfA" });
    expect(game.state("guardian")).toMatchObject({ combatRole: null, damage: 0, location: "bfA", might: 3 });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0); // holding as defender is not a conquer
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ================================================================ (B) Neutral Open → P1 attacks
  test("(B) on resolution P1's Guardian applies Contested to bfB (450) and the Cleanup begins a Combat with P1 as ATTACKER holding Focus (323.9 / 323.13 / 464.2.c.1)", async () => {
    const game = await boardB().build();
    await zenithBlade(game, "bfB");
    expect(game.locationOf("guardian")).toBe("bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    const stack = game.gameState.interaction?.showdownStack ?? [];
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ attackingPlayer: P1, battlefieldId: "bfB", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(B) designations flip the keywords: Guardian = attacker → Shield OFF (3 Might), not exhausted; Enforcer = defender → Assault OFF (2 Might) and Stunned", async () => {
    const game = await boardB().build();
    await zenithBlade(game, "bfB");
    expect(game.state("guardian")).toMatchObject({ combatRole: "attacker", isExhausted: false, might: 3 });
    expect(game.state("enforcer")).toMatchObject({ combatRole: "defender", isStunned: true, might: 2 });
  });

  test("(B) result: Guardian 3 ≥ 2 kills the Enforcer, the stunned defender deals 0 → Guardian undamaged; P1 Conquers bfB for 1 point (466.5.d)", async () => {
    const game = await boardB().build();
    await zenithBlade(game, "bfB");
    await game.settle();
    expect(game.zoneOf("enforcer")).toBe("trash");
    expect(game.state("guardian")).toMatchObject({ damage: 0, isExhausted: false, location: "bfB", might: 3 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ================================================================ PARITY for (B)
  test("PARITY (B): a Standard Move base→bfB gives the identical Contested/Attacker/Focus picture — except Guardian is exhausted and the Enforcer is not stunned", async () => {
    const game = await boardB().build();
    await game.p1.move("guardian", "bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.interaction?.showdownStack?.[0]).toMatchObject({ attackingPlayer: P1, defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("guardian")).toMatchObject({ combatRole: "attacker", isExhausted: true, might: 3 }); // Shield off here too
    expect(game.state("enforcer")).toMatchObject({ combatRole: "defender", isStunned: false, might: 2 }); // Assault off here too
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.settle();
    // Unstunned Enforcer deals 2 < 3 → Guardian survives; Guardian deals 3 ≥ 2 → Enforcer dies; same conquer.
    expect(game.zoneOf("enforcer")).toBe("trash");
    expect(game.state("guardian")).toMatchObject({ damage: 0, isExhausted: true, location: "bfB" });
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("LESSON: same card, same unit — Defender in (A), Attacker in (B); the direction of travel (base → battlefield both times) is irrelevant", async () => {
    const a = await boardA().build();
    await a.p2.move("enforcer", "bfA");
    await a.p2.passFocus();
    await zenithBlade(a, "bfA");
    const b = await boardB().build();
    await zenithBlade(b, "bfB");
    expect([a.state("guardian").combatRole, b.state("guardian").combatRole]).toEqual(["defender", "attacker"]);
    expect([a.state("guardian").might, b.state("guardian").might]).toEqual([4, 3]);
    expect([a.gameState.battlefields.bfA?.contestedBy, b.gameState.battlefields.bfB?.contestedBy]).toEqual([P2, P1]);
  });
});
