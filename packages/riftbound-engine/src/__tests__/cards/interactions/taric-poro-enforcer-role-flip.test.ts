/**
 * Interaction: Taric, Protector (ogn-074-298) × Stalwart Poro (ogn-052-298) × Chemtech Enforcer (ogn-003-298)
 *
 *   Taric, Protector — Unit · Calm · 4 Might · "[Shield] [Tank] Other friendly units here have [Shield]."
 *   Stalwart Poro    — Unit · Calm · 2 Might · "[Shield]"
 *   Chemtech Enforcer — Unit · Fury · 2 Might · "[Assault 2] When you play me, discard 1."
 *
 * Question: Taric + Poro share a battlefield; Enforcer is the opposing unit.
 *  (a) P2's Enforcer attacks INTO P1's Taric+Poro: Mights? How must Enforcer's damage be assigned? Result?
 *  (b) Role flip — P1 group-moves Taric+Poro into a battlefield P2 holds with Enforcer: any Shield?
 *      Assault for Enforcer? Does Tank still dictate P2's assignment? Result?
 *
 * Expected (rules):
 *  (a) Defending: Poro = 2 + Shield 1 (printed) + Shield 1 (Taric) = 4 (814.2 sums Shield); Taric = 4+1 = 5
 *      ("other" — no self-buff). Enforcer attacking = 2 + Assault 2 = 4 (807.1.c). Enforcer's 4 must go to
 *      Taric first (Tank, 815.1.b); 4 < lethal 5 so nothing may spill to Poro (465.2.c.3, 815.1.c.2).
 *      Defenders' 9 kills Enforcer. Taric is healed in the combat cleanup (466.1.a.1); P1 keeps bf1, no score change.
 *  (b) Attacking: Shield is inactive for attackers (814.1.d.1) → Poro 2, Taric 4; Enforcer defending gets no
 *      Assault (807.1.d.1) → 2. Tank is role-agnostic → Enforcer's 2 goes to Taric (non-lethal), 0 to Poro.
 *      6 kills Enforcer (excess stays on the lone defender, 465.2.c.4); no defenders remain → attackers are
 *      not recalled (466.1.a.2); P1 wins the combat and conquers bf1 (466.3.a, 466.5.d) for 1 point.
 *  Same three cards, opposite keyword activations purely from who is Attacker/Defender (464.2.c.1–3).
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TARIC = "ogn-074-298";
const PORO = "ogn-052-298";
const ENFORCER = "ogn-003-298";

/** (a) P2's turn. P1 holds bf1 with Poro (listed first — absent Tank it would soak damage first) + Taric; Enforcer in P2's base. */
function defendBoard() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", PORO, "poro")
    .unit(P1, "bf1", TARIC, "taric")
    .unit(P2, "base", ENFORCER, "enf");
}

/** (b) P1's turn. P2 holds bf1 with Enforcer; Poro + Taric in P1's base. */
function attackBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", ENFORCER, "enf")
    .unit(P1, "base", PORO, "poro")
    .unit(P1, "base", TARIC, "taric");
}

describe("(a) Enforcer attacks into Taric + Poro", () => {
  test("designations: Enforcer is the Attacker, Taric and Poro are Defenders; a showdown opens with P2 holding Focus", async () => {
    const game = await defendBoard().build();
    await game.p2.move("enf", "bf1");
    const d = game.decision() as ActionDecision;
    expect(d.context).toBe("showdown");
    expect(d.seat).toBe(P2);
    expect(game.state("enf").combatRole).toBe("attacker");
    expect(game.state("taric").combatRole).toBe("defender");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  // Expected: Taric's static "Other friendly units here have [Shield]" applies continuously to Poro (a
  // second Shield source on top of the printed one, 814.2), and not to Taric himself. Actual: the grant
  // is only stamped when Taric is PLAYED to the battlefield; units that are simply there with him get nothing.
  test.failing("BUG: Poro at Taric's battlefield carries a Taric-granted Shield in addition to its printed Shield; Taric grants himself nothing ('other')", async () => {
    const game = await defendBoard().build();
    await game.p2.move("enf", "bf1"); // a real engine step has run; statics must be (re)computed by now
    expect(game.state("poro").keywords).toContain("Shield"); // printed
    expect(game.state("poro").grantedKeywords.map((k) => k.keyword)).toContain("Shield"); // from Taric
    expect(game.state("taric").grantedKeywords.filter((k) => k.keyword === "Shield")).toEqual([]);
  });

  // Expected: while designated, Assault/Shield ARE Might (807.1.c / 814.1.c): Enforcer 4, Taric 5, Poro 4.
  // Actual: the engine's effective-Might (used for targeting/might checks) ignores combat keywords and only
  // folds them in inside the combat resolver — Enforcer reads 2, Taric 4, Poro 2 during the showdown.
  test.failing("BUG: Mights during the showdown — Enforcer 4 (Assault 2), Taric 5 (Shield), Poro 4 (Shield ×2)", async () => {
    const game = await defendBoard().build();
    await game.p2.move("enf", "bf1");
    expect(game.state("enf").might).toBe(4);
    expect(game.state("taric").might).toBe(5);
    expect(game.state("poro").might).toBe(4);
  });

  test("result: Enforcer's 4 all lands on Taric (Tank first, non-lethal vs 5) so Poro is untouched; defenders kill Enforcer; Taric healed; P1 keeps bf1; nobody scores", async () => {
    const game = await defendBoard().build();
    await game.p2.move("enf", "bf1");
    await game.settle();
    expect(game.zoneOf("enf")).toBe("trash");
    // Had any of the 4 been assigned to Poro first (lethal ≤ 4) it would be dead — Tank forced it all onto Taric.
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.locationOf("taric")).toBe("bf1");
    expect(game.state("taric").damage).toBe(0); // 4 marked, then healed in the combat cleanup (466.1.a.1)
    expect(game.state("poro").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    // Combat roles are cleared afterwards.
    expect(game.state("taric").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2, context: "main" });
  });
});

describe("(b) role flip — Taric + Poro attack into Enforcer", () => {
  test("designations flip: Taric and Poro are Attackers, Enforcer is the Defender; P1 (attacker) holds Focus", async () => {
    const game = await attackBoard().build();
    await game.p1.move(["taric", "poro"], "bf1");
    const d = game.decision() as ActionDecision;
    expect(d.context).toBe("showdown");
    expect(d.seat).toBe(P1);
    expect(game.state("taric").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("attacker");
    expect(game.state("enf").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("Mights during the showdown: no Shield for attackers (Poro 2, Taric 4 — 814.1.d.1), no Assault for the defending Enforcer (2 — 807.1.d.1)", async () => {
    const game = await attackBoard().build();
    await game.p1.move(["taric", "poro"], "bf1");
    expect(game.state("poro").might).toBe(2);
    expect(game.state("taric").might).toBe(4);
    expect(game.state("enf").might).toBe(2);
  });

  test("result: Tank is role-agnostic — Enforcer's 2 goes to Taric (non-lethal), Poro (lethal 2) survives; Enforcer dies; attackers stay and P1 conquers bf1 for 1 point", async () => {
    const game = await attackBoard().build();
    await game.p1.move(["taric", "poro"], "bf1");
    await game.settle();
    expect(game.zoneOf("enf")).toBe("trash"); // 6 ≥ 2; excess piles on the only defender (465.2.c.4)
    // If P2 could have put the 2 on Poro (exactly lethal with Shield inactive) it would be dead — Tank forbade it.
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.locationOf("taric")).toBe("bf1"); // not recalled: no defenders remain (466.1.a.2)
    expect(game.state("taric").damage).toBe(0); // healed in combat cleanup
    expect(game.state("poro").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // 466.3.a / 466.5.d conquer
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
  });

  test("same three cards, opposite outcome driver: as defenders Taric+Poro merely HOLD (no point), as attackers they CONQUER (+1) — control never changes hands in (a), does in (b)", async () => {
    const a = await defendBoard().build();
    await a.p2.move("enf", "bf1");
    await a.settle();
    const b = await attackBoard().build();
    await b.p1.move(["taric", "poro"], "bf1");
    await b.settle();
    expect([a.gameState.battlefields.bf1?.controller, a.p1.points()]).toEqual([P1, 0]);
    expect([b.gameState.battlefields.bf1?.controller, b.p1.points()]).toEqual([P1, 1]);
    expect(a.violations()).toEqual([]);
    expect(b.violations()).toEqual([]);
  });
});
