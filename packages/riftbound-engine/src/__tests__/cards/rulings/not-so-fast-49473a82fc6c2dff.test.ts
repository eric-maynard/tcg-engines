/**
 * Ruling 49473a82fc6c2dff — Not So Fast (SFD-045 → sfd-045-221) · Reaction · [2][calm]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Rebuke (OGN-172 → ogn-172-298) · Action · [2][chaos][chaos] · "Return a unit at a battlefield to its owner's hand."
 *   × Bullet Time (OGN-268 → ogn-268-298) · Action · [1] · "Pay any amount of [rainbow] to deal that much damage to all
 *     enemy units at a battlefield."
 *   × Overzealous Fan (SFD-128 → sfd-128-221) · 2 Might · "When I defend, you may kill me to move an attacking unit to
 *     its base."
 *
 * Q: Does Not So Fast cancel Rebuke when it targets my defending unit?
 * A: Yes — Rebuke chooses a unit you control. Nuances: NSF cannot counter a spell that targets a BATTLEFIELD (Bullet
 *    Time), even yours — units merely affected are not targets. When NSF counters a triggered ability whose cost is
 *    paid on resolution (Overzealous Fan), the cost is not paid and the effect does not happen.
 * Rules: 355 (targets = chosen objects), 425.1 (countered → no effect), 383.3.b / 158.1 (resolution-time payments).
 *    RULING-CONFLICT on the Fan nuance: the ruling predates the Unleashed CR. CR 204.3.a names this very card — "In order to
 *    finalize the ability to the chain, its controller must kill Overzealous Fan" (383.3.b / 740.4.a.2: a "[kill me] TO [move …]"
 *    right after the leading "you may" is the BASE COST, paid at finalization) — and 425.1.c: countering refunds no cost. So the
 *    Fan is already dead when NSF can even be played; countering stops the move, it cannot save the Fan (Unleashed-era rulings
 *    347a9365bc85ec43 / a6a4e61cf7a5ceee say exactly this: "previously the Fan would survive"). Engine follows the CR.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const REBUKE = "ogn-172-298";
const BULLET_TIME = "ogn-268-298";
const OVERZEALOUS_FAN = "sfd-128-221";

const nsfTargets = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  (game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

/** P2's turn. P1's Defender (4) holds P1's bf1; P1 has NSF with exactly [2][calm]. P2 holds Rebuke + Bullet Time. */
function spellBoard() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Defender" }, "defender")
    .hand(P1, NOT_SO_FAST, "nsf")
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .hand(P2, REBUKE, "rebuke")
    .hand(P2, BULLET_TIME, "bt")
    .resources(P2, { energy: 3, power: { chaos: 2, rainbow: 2 } });
}

describe("Ruling 49473a82fc6c2dff — Not So Fast vs Rebuke (yes), Bullet Time (no), Overzealous Fan (yes: no cost, no effect)", () => {
  test("Rebuke aimed at my Defender on my battlefield: NSF is legal against it, resolves first and counters it — the Defender stays put, both spells to trash", async () => {
    const game = await spellBoard().build();
    await game.p2.cast("rebuke", { targets: "defender" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rebuke", controller: P2, targets: ["defender"] })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(nsfTargets(game)).toEqual(["rebuke"]);
    await game.p1.cast("nsf", { targets: "rebuke" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defender")).toBe("battlefield-bf1");
    expect(game.p1.hand()).not.toContain("defender");
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Bullet Time targets the BATTLEFIELD (bf1), not my unit: with it on the chain NSF has no legal object and cannot be cast — my Defender just takes the damage", async () => {
    const game = await spellBoard().build();
    const btField = game.p2.option("cast", "bt")?.fields.find((f) => f.name === "targets");
    expect((btField?.options ?? []).flat()).toEqual(["bf1"]); // its chosen object is a battlefield
    await game.p2.cast("bt", { targets: "bf1", x: 2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", targets: ["bf1"] })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(nsfTargets(game)).toEqual([]);
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf", { targets: "bt" }));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.state("defender").damage).toBe(2); // affected ≠ targeted
  });

  /** Raider attacks the Fan's battlefield; P2 opts into the Fan's trigger; P1 counters it with NSF; the initial chain drains. */
  async function fanCounteredByNsf() {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, NOT_SO_FAST, "nsf")
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .build();
    await game.p1.move("raider", "bf1");
    // The Fan's "When I defend" goes on the initial chain; P2 opts in.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "fan" } });
    await game.p2.yes();
    const fanZoneAfterOptIn = game.zoneOf("fan");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, targets: ["raider"], triggered: true })]);
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(nsfTargets(game)).toEqual(["fan"]); // the ability chooses MY attacking unit → counterable
    await game.p1.cast("nsf", { targets: "fan" });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P2) {
        throw new Error("a countered ability must not ask for its resolution cost");
      }
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    return { fanZoneAfterOptIn, game };
  }

  test("Overzealous Fan: its defend trigger (it chooses my attacking Raider) is a legal NSF object; countered, its effect does not happen — the Raider is NOT sent home and keeps attacking", async () => {
    const { game } = await fanCounteredByNsf();
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.p1.hand()).not.toContain("raider");
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 49473a82fc6c2dff (pre-Unleashed) says the Fan's "kill me" is paid as the ability RESOLVES, so
  // a countered trigger never pays it and the Fan survives. CR 204.3.a (its own Overzealous Fan example) / 383.3.b.1 / 404.1:
  // "kill me" is the trigger's BASE COST, paid to FINALIZE it — before anyone holds priority — and 425.1.c: countering refunds
  // no cost. Engine follows the CR: the Fan is in the trash from the opt-in on, and NSF only stops the move.
  test("CR 204.3.a / 425.1.c (contra ruling 49473a82fc6c2dff) — the Fan dies AT OPT-IN (its kill is the finalization cost); countering the ability afterwards does not bring it back — only the move is stopped", async () => {
    const { fanZoneAfterOptIn, game } = await fanCounteredByNsf();
    expect(fanZoneAfterOptIn).toBe("trash"); // paid while it merely sits on the chain
    expect(game.zoneOf("fan")).toBe("trash"); // countered → cost NOT refunded
    expect(game.locationOf("raider")).toBe("bf1"); // … and the effect did not happen
  });

  test("control — un-countered Fan: P2 kills the Fan (at opt-in) and on resolution the Raider is moved back to P1's base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    await game.p2.yes();
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P2) {
        await game.p2.yes();
      } else if (d?.kind === "action" && d.passKey && d.context === "chain") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.locationOf("raider")).toBe("base");
  });
});
