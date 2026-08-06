/**
 * Interaction: Fiora, Victorious (ogn-232-298) · Champion Unit · Order · 4 · 4 might
 *     "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]. (I'm Mighty while I have 5+ [Might].)"
 *   × Block (ogn-057-298) · Spell · Calm · 2 · Action
 *     "Give a unit [Shield 3] and [Tank] this turn."
 *   × Doran's Blade (sfd-095-221) · Equipment · Body · 2 · +2 Might · "[Equip] [body]"
 *
 * Question:
 *   (a) Unbuffed, unequipped Fiora DEFENDS; after the attacker passes Focus her controller casts
 *       Block on her. What Might does she fight at, does she have Tank/Deflect/Ganking, and what is
 *       she after combat?
 *   (b) Same Block but Fiora ATTACKS — does anything turn on?
 *   (c) Fiora wearing Doran's Blade, no Block: Mighty outside combat (Ganking bf→bf, Deflect)? Might
 *       when defending?
 *
 * Rules: 476–476.3 (layers re-applied until stable, each effect once — the Fiora example), 708/710
 * (Mighty = current Might ≥ 5), 814.1.c / 814.1.d.1 (Shield = +X Might only while a Defender),
 * 814.2 (Shield values sum), 815.1.b (Tank: assigned lethal damage first, any role), 810.1.b /
 * 144.4.c.1 (Ganking: standard move battlefield→battlefield), 464.2.d + 347.1 (attacker gets Focus
 * first; the defender may only act after Focus passes), 466.1.a.1 (heal all units in combat cleanup),
 * 466.7.a (designations removed when combat ends).
 *
 * Expected: (a) Block: Shield 3 + Tank → 7 as defender → now Mighty → gains Shield (1 more) → fights
 * at 8 with Tank + Deflect; after combat she is a healed 4-might unit with no conditional keywords.
 * (b) Attacking: Shield never applies → stays 4, never Mighty; Tank still orders damage onto her first.
 * (c) 4+2 = 6 always → Mighty on board → Ganking + Deflect; defending: +1 Shield → 7.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "ogn-232-298";
const BLOCK = "ogn-057-298";
const DORANS_BLADE = "sfd-095-221";

/** P2's 1-cost probe spell for Deflect: "Deal 1 to a unit." */
const ZAP = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Zap",
  timing: "action",
};

/** (a) P2's turn. P1 holds bf1 with a bare Fiora (+ optional 2-might buddy) and Block in hand; P2's attacker waits in base. */
function defence(attackerMight: number, withBuddy = false) {
  const s = scenario()
    .active(P2)
    .resources(P1, { energy: 2 }) // exactly Block
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", FIORA, "fiora");
  if (withBuddy) {
    s.unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy");
  }
  return s.unit(P2, "base", { might: attackerMight, name: "Attacker" }, "atk").hand(P1, BLOCK, "block");
}

/** (b) P1's turn. P2 holds bf1 with a lone defender; Fiora + buddy attack from base with Block in hand. */
function offence(defenderMight: number) {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: defenderMight, name: "Defender" }, "def")
    .unit(P1, "base", FIORA, "fiora")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .hand(P1, BLOCK, "block");
}

/** (c) Fiora at bf1 already wearing Doran's Blade (attached during setup). */
function equipped(active: typeof P1 | typeof P2 = P1) {
  return scenario()
    .active(active)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", FIORA, "fiora", { equippedWith: ["blade"] } as Record<string, unknown>)
    .gear(P1, DORANS_BLADE, "blade", { attachedTo: "fiora" } as Record<string, unknown>)
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "bf2", { might: 2, name: "Far Sentry" }, "sentry");
}

describe("Fiora, Victorious × Block × Doran's Blade — Mighty/Shield layering", () => {
  // ---- (a) Fiora DEFENDING with Block ----------------------------------------------------------

  test.failing("BUG: (a) the defender cannot cast Block until the attacker passes Focus (464.2.d, 347.1)", async () => {
    // Expected: right after the move opens the showdown P2 (attacker) holds Focus; P1's Action spell
    // is not legal yet. Actual: the engine offers P1's Block immediately.
    const game = await defence(7).build();
    await game.p2.move("atk", "bf1");
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "block")).toBe(false);
    await game.p2.passFocus();
    expect(game.p1.can("cast", "block")).toBe(true);
  });

  test("(a) after Focus passes, Block resolves on the defending Fiora: Shield 3 + Tank granted for the turn while she holds the Defender designation", async () => {
    const game = await defence(7).autoProcedures(false).build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("block", { targets: "fiora" });
    expect(game.p1.energy()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Block resolves; combat not yet resolved (autoProcedures off)
    const s = game.state("fiora");
    expect(s.combatRole).toBe("defender");
    expect(s.grantedKeywords).toEqual([
      { duration: "turn", keyword: "Shield", value: 3 },
      { duration: "turn", keyword: "Tank" },
    ]);
    expect(game.zoneOf("block")).toBe("trash");
  });

  test.failing("BUG: (a) layered Might — Blocked defending Fiora fights at 8 (4 +3 Shield → Mighty → +1 own Shield): she survives a 7-might attacker and trades with an 8-might one (476.3, 814.1.c, 814.2)", async () => {
    // Expected: 7-might attacker deals 7 < 8 → Fiora lives, attacker takes 8 → dies; an 8-might
    // attacker kills her but also takes 8 → dies. Actual: Fiora's "While I'm Mighty … Shield" is
    // never derived (equipment/Shield Might is ignored by the while-mighty check), so she fights at
    // most at 7: she does not survive the 7-might attacker and the 8-might attacker is left alive.
    const vs7 = await defence(7).build();
    await vs7.p2.move("atk", "bf1");
    await vs7.p2.passFocus();
    await vs7.p1.cast("block", { targets: "fiora" });
    await vs7.settle();
    expect(vs7.zoneOf("atk")).toBe("trash");
    expect(vs7.zoneOf("fiora")).toBe("battlefield-bf1");
    expect(vs7.gameState.battlefields.bf1?.controller).toBe(P1);

    const vs8 = await defence(8).build();
    await vs8.p2.move("atk", "bf1");
    await vs8.p2.passFocus();
    await vs8.p1.cast("block", { targets: "fiora" });
    await vs8.settle();
    expect(vs8.zoneOf("fiora")).toBe("trash"); // 8 ≥ 8: she is exactly 8, not more
    expect(vs8.zoneOf("atk")).toBe("trash"); // and she dealt 8 back
  });

  test("(a) Tank while defending: the 7-might attacker must put lethal on Fiora first — the 2-might buddy beside her takes nothing and survives; the attacker dies (815.1.b)", async () => {
    const game = await defence(7, true).build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("block", { targets: "fiora" });
    await game.settle();
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    expect(game.state("buddy").damage).toBe(0);
    expect(game.zoneOf("atk")).toBe("trash"); // Fiora (≥7) + buddy 2 ≥ 7
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(a) after combat ends she is a plain 4-might unit again: Defender designation gone, damage healed, only Block's turn-long grants remain; next turn she cannot Ganking-move (466.7.a, 466.1.a.1, 476.3)", async () => {
    const game = await defence(3).battlefield("bf2", { controller: P2 }).build(); // 3 < 4: she survives no matter how her combat Might is computed
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("block", { targets: "fiora" });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    const s = game.state("fiora");
    expect(s.zone).toBe("battlefield-bf1");
    expect(s.combatRole).toBeNull();
    expect(s.damage).toBe(0);
    expect(s.might).toBe(4);
    expect(s.grantedKeywords).toEqual([
      { duration: "turn", keyword: "Shield", value: 3 },
      { duration: "turn", keyword: "Tank" },
    ]);
    await game.advanceTurn(); // → P1's turn: Block's grants expired, 4 might, not Mighty
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("fiora").grantedKeywords).toEqual([]);
    expect(game.state("fiora").might).toBe(4);
    expect(game.p1.can("gank", "fiora")).toBe(false);
    const r = await game.p1.try((p) => p.move("fiora", "bf2"));
    expect(r.ok).toBe(false);
  });

  // ---- (b) Fiora ATTACKING with Block ------------------------------------------------------------

  test("(b) attacking Fiora with Block: Shield does not apply to an attacker — she fights at 4, so a 4-might defender's damage (Tank: onto her first) is exactly lethal; the buddy is untouched and the defender dies to 4+2 (814.1.d.1, 815.1.b)", async () => {
    const game = await offence(4).build();
    await game.p1.move(["fiora", "buddy"], "bf1");
    expect(game.actingSeat()).toBe(P1); // the attacker holds Focus first and may cast Block at once
    await game.p1.cast("block", { targets: "fiora" });
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash"); // took 4 (Fiora, no Shield bonus) + 2
    expect(game.zoneOf("fiora")).toBe("trash"); // 4 is lethal only because she is still 4 (would survive at 7+)
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    expect(game.state("buddy").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // attackers won → conquered
  });

  test("(b) Tank works for an attacker too: a 3-might defender must put all 3 on Fiora (not lethal) instead of killing the 2-might buddy (815.1.b)", async () => {
    // (Without Tank the defending player would be free to kill the buddy instead — a choice, so no
    // engine-default control is asserted here.)
    const game = await offence(3).build();
    await game.p1.move(["fiora", "buddy"], "bf1");
    await game.p1.cast("block", { targets: "fiora" });
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("battlefield-bf1"); // 3 < 4, healed afterwards
    expect(game.state("fiora").damage).toBe(0);
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1"); // nothing left over for the buddy
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  // ---- (c) Fiora wearing Doran's Blade -----------------------------------------------------------

  test("(c) Doran's Blade is always-on arithmetic: equipped Fiora is 6 Might on the board, outside combat (710)", async () => {
    const game = await equipped().build();
    const s = game.state("fiora");
    expect(s.attachments).toEqual(["blade"]);
    expect(game.state("blade").attachedTo).toBe("fiora");
    expect(s.baseMight).toBe(4);
    expect(s.might).toBe(6);
    expect(s.combatRole).toBeNull();
  });

  test.failing("BUG: (c) equipped Fiora (6) is Mighty → has Ganking: she may standard-move battlefield→battlefield (810.1.b, 144.4.c.1)", async () => {
    // Expected: bf1→bf2 is a legal move for her (and not for the 2-might buddy). Actual: the
    // "While I'm Mighty" grant ignores equipment Might; no ganking move is offered.
    const game = await equipped().build();
    expect(game.p1.can("gank", "fiora")).toBe(true);
    expect(game.p1.can("gank", "buddy")).toBe(false);
    await game.p1.gank("fiora", "bf2");
    expect(game.locationOf("fiora")).toBe("bf2");
  });

  test.failing("BUG: (c) equipped Fiora (6) is Mighty → has Deflect: an enemy spell must pay an extra [rainbow] to choose her (476.3)", async () => {
    // Expected: with exactly Zap's [1] P2 may target the buddy but not Fiora; with 1 spare power
    // Fiora becomes targetable and the power is spent. Actual: no Deflect — Fiora is offered for [1].
    const offered = (g: Awaited<ReturnType<ReturnType<typeof equipped>["build"]>>) =>
      (g.p2.option("cast", "zap")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];

    const poor = await equipped(P2).rune(P2, "fury").hand(P2, ZAP, "zap").build();
    await poor.p2.tapRune(); // 1 energy, 0 power — also forces a static re-evaluation
    expect(offered(poor)).toContain("buddy");
    expect(offered(poor)).not.toContain("fiora");

    const rich = await equipped(P2).rune(P2, "fury").resources(P2, { power: { fury: 1 } }).hand(P2, ZAP, "zap").build();
    await rich.p2.tapRune();
    expect(offered(rich)).toContain("fiora");
    await rich.p2.cast("zap", { targets: "fiora" });
    expect(rich.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // Deflect surcharge paid
  });

  test.failing("BUG: (c) equipped Fiora defending without Block fights at 7 (6 + her own Shield 1): a 6-might attacker dies and she survives (814.1.c, 476.3)", async () => {
    // Expected: 6 < 7 → Fiora lives; attacker takes 7 ≥ 6 → dies; P1 keeps bf1. Actual: no Shield
    // is derived from being Mighty, she fights at 6 and trades with the attacker.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", FIORA, "fiora", { equippedWith: ["blade"] } as Record<string, unknown>)
      .gear(P1, DORANS_BLADE, "blade", { attachedTo: "fiora" } as Record<string, unknown>)
      .unit(P2, "base", { might: 6, name: "Attacker" }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("battlefield-bf1");
    expect(game.state("fiora").damage).toBe(0); // healed in combat cleanup
    expect(game.state("fiora").might).toBe(6); // back to board Might once the Defender designation drops
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
