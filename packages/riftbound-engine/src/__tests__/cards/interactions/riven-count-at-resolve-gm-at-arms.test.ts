/**
 * Interaction: Riven, Shattered (ven-041-166) · Champion Unit · Calm · 3 + [calm] · 3 Might
 *     "[Weaponmaster] … When I attack, choose an enemy unit here. Deal 2 to it for each Equipment attached to me."
 *   × Grandmaster at Arms (sfd-193-221) · Legend · Calm/Body
 *     "[1], [Exhaust]: Attach a detached Equipment you control to a unit you control.
 *      [Exhaust]: Attach an attached Equipment you control to a unit you control."
 *   × B.F. Sword (sfd-161-221) · Equipment · Order · 4 + [order] · +3 Might
 *     "[Equip] [order]" — no Effect Text at all.
 *   × Shipyard Skulker (ogn-175-298) · vanilla 3-Might defender.
 *
 * Question. P1's legend is a READY Grandmaster at Arms. P1 attacks a P2-held bf1 (lone 3-Might
 * Skulker defending) with Riven wearing one B.F. Sword; a second B.F. Sword is attached to another
 * friendly unit of P1's.
 *   (a) What is locked when Riven's attack trigger is FINALIZED, and what is read when it RESOLVES?
 *   (b) Can P1 use Grandmaster's second ability to move the other Sword onto Riven while the trigger
 *       is still on the chain? What does the chain look like and what resolves first?
 *   (c) How much damage does the trigger deal, and does the Skulker die?
 *   (d) Is the attach a Move, and does it re-trigger anything of Riven's?
 *   (e) Does the newly attached Sword's Might bonus apply in this combat's damage step?
 *
 * Answers. (a) The TARGET ("an enemy unit here") is chosen as the trigger is finalized and cannot be
 * changed afterwards (355.5, 355.15, 402.2); with a lone legal enemy it is auto-bound. The MULTIPLIER
 * ("for each Equipment attached to me") is not a target — it is counted off Riven's state when the
 * ability RESOLVES (359.3.f.2).
 *   (b) NOT with this legend. Both of Grandmaster's abilities are printed without [Action]/[Reaction],
 * so they are standard-timed: rule 338.1.a.1/338.1.a.2 bar them from a Closed State (an item pending
 * on the chain) and rules 343.1.a-b / 308.1.a / 313.1.a bar them from a Showdown State. The only
 * window is P1's own open Main Phase, i.e. BEFORE the attack. There the chain is
 * [Grandmaster ability (P1)] alone, P1 keeps priority (337.4), then P2 may respond (406.4).
 * See the `// DESIGN:` facet below: the "respond to my own attack trigger" seam the question posits
 * needs a [Reaction]-timed attach (Quick-Draw — see riven-for-each-one-instance-cs-sword.test.ts),
 * not the Grandmaster.
 *   (c) With both Swords on Riven the trigger deals 2 × 2 = 4 to the 3-Might Skulker and kills it
 * before combat damage; with only one it deals 2 and the Skulker survives at 3 Might with 2 damage.
 *   (d) No. Attach relocates the Equipment to its new Top-Most Card's location and is explicitly NOT
 * a Move (434.4, 434.4.a). Riven's attack trigger fires once per combat, when the Attacker
 * designation is gained (383.4.e.2, 383.4.e.2.a) — re-gearing never re-triggers it. (B.F. Sword has
 * no Effect Text; had it carried a "When I attack or defend" ability, 719.1 would append that text
 * only from the moment of attachment, so it would not trigger in a combat already underway.)
 *   (e) Yes — the Might bonus modulates the Top-Most Card continuously while attached (718.4), so
 * Riven swings 3 + 3 + 3 = 9 in the damage step.
 *
 * Rules: 383.4.e.2 / .a, 355.5, 355.15, 401.1, 337.1 / .a / .b, 337.4, 340.1, 406.4, 434.4 / .a,
 * 718.4, 719.1, 464.2.g, plus the timing rules 338.1.a.1-.2, 343.1.a-b, 308.1.a, 313.1.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIVEN = "ven-041-166";
const GRANDMASTER = "sfd-193-221";
const BF_SWORD = "sfd-161-221";
const SKULKER = "ogn-175-298";

/** Ability index of "[Exhaust]: Attach an ATTACHED Equipment you control to a unit you control". */
const MOVE_ATTACHED = 1;

/**
 * P1's open Main Phase. Riven in base wearing Sword #1, a Squire in base wearing Sword #2, the ready
 * Grandmaster in the legend zone, and P2 holding bf1 with `defender`.
 */
function board(defender: { might: number; name: string } | string = SKULKER) {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 2, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .legend(P1, GRANDMASTER, "gm")
    .unit(P1, "base", RIVEN, "riven", { equippedWith: ["sword1"] })
    .card("sword1", { def: BF_SWORD, meta: { attachedTo: "riven" }, owner: P1, zone: "base" })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["sword2"] })
    .card("sword2", { def: BF_SWORD, meta: { attachedTo: "squire" }, owner: P1, zone: "base" })
    .unit(P2, "bf1", defender, "foe");
}

/** Move Sword #2 from the Squire onto Riven with Grandmaster's second ability (open Main Phase only). */
async function regearRiven(game: Game): Promise<void> {
  await game.p1.activate("gm", MOVE_ATTACHED);
  await game.p1.passPriority();
  await game.p2.passPriority();
  await game.p1.pick("sword2"); // which Equipment
  await game.p1.pick("riven"); // onto which unit
}

/** Pass priority around until the chain is empty (or a non-chain decision appears). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.acting().pass();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) what is locked at finalization, what is read at resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("(a) Riven's attack trigger: the target is locked at finalization, the multiplier is not", () => {
  test("355.5 / 402.2 — with two enemy units at bf1 the target is a FINALIZATION pick bound to the trigger, offering exactly the enemy units there", async () => {
    const game = await board({ might: 8, name: "Wall" }).unit(P2, "bf1", SKULKER, "skulker").build();
    await game.p1.move("riven", "bf1");

    const d = game.decision();
    expect(d).toMatchObject({
      kind: "pick",
      max: 1,
      min: 1,
      seat: P1,
      source: { battlefieldId: "bf1", cardId: "riven", pendingChoiceType: "choose-target" },
      timing: "FIN",
    });
    const offered = (d as { options: readonly { card?: string }[] }).options.map((o) => o.card);
    expect(new Set(offered)).toEqual(new Set(["foe", "skulker"]));
    expect(offered).not.toContain("riven"); // "an ENEMY unit here"
  });

  test("355.15 — the chosen target rides on the chain item and nothing else is asked: the 'for each Equipment' multiplier is not a target", async () => {
    const game = await board({ might: 8, name: "Wall" }).unit(P2, "bf1", SKULKER, "skulker").build();
    await game.p1.move("riven", "bf1");
    await game.p1.pick("skulker");

    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "riven", controller: P1, targets: ["skulker"], triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("402.2 — with a lone legal enemy the target is auto-bound as the trigger is finalized; exactly ONE item goes on the chain", async () => {
    const game = await board().build();
    await game.p1.move("riven", "bf1");

    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "riven", controller: P1, targets: ["foe"], triggered: true }),
    ]);
  });

  test("359.3.f.2 — the multiplier is counted off Riven's Equipment when the ability RESOLVES: 0 / 1 / 2 Swords ⇒ 0 / 2 / 4 damage", async () => {
    const dealt: number[] = [];
    for (const swords of [0, 1, 2]) {
      const b = scenario()
        .resources(P1, { energy: 5 })
        .battlefield("bf1", { controller: P2 })
        .unit(P1, "base", RIVEN, "riven", {
          equippedWith: Array.from({ length: swords }, (_, i) => `sw${i}`),
        })
        .unit(P2, "bf1", { might: 20, name: "Wall" }, "wall");
      for (let i = 0; i < swords; i++) {
        b.card(`sw${i}`, { def: BF_SWORD, meta: { attachedTo: "riven" }, owner: P1, zone: "base" });
      }
      const game = await b.build();
      await game.p1.move("riven", "bf1");
      await drainChain(game);
      dealt.push(game.state("wall").damage);
    }
    expect(dealt).toEqual([0, 2, 4]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) when Grandmaster may actually be used
// ─────────────────────────────────────────────────────────────────────────────

describe("(b) Grandmaster's untagged abilities are standard-timed", () => {
  // DESIGN / RULING-CONFLICT: the question posits activating Grandmaster in response to Riven's own
  // attack trigger. Neither printed ability carries [Action] or [Reaction], so rule 338.1.a.1
  // ("Cards and Activated Abilities, by default, cannot be played during a Closed State") and
  // 338.1.a.2 (a legally timed ability is one with Reaction) forbid it while an item is pending, and
  // 343.1.b / 308.1.a / 313.1.a ("A player with Focus may not … activate abilities that don't have
  // the Action or Reaction keywords") forbid it for the whole Showdown State that follows. The engine
  // follows the Core Rules here — an untagged ability is neutral-open-only.
  test("DESIGN: while Riven's attack trigger is on the chain the state is CLOSED — Grandmaster cannot be activated (338.1.a.1)", async () => {
    const game = await board().build();
    await game.p1.move("riven", "bf1");

    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "gm")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("activate");
    await expect(game.p1.activate("gm", MOVE_ATTACHED)).rejects.toThrow();
  });

  test("DESIGN: after the trigger resolves the turn is in a SHOWDOWN State — Grandmaster still cannot be activated (343.1.b / 308.1.a / 313.1.a)", async () => {
    const game = await board().build();
    await game.p1.move("riven", "bf1");
    await drainChain(game);

    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "gm")).toBe(false);
    await expect(game.p1.activate("gm", MOVE_ATTACHED)).rejects.toThrow();
  });

  test("the only window is P1's open Main Phase: the activation is a Pending Item creating a Closed State (401.1), P1 keeps priority (337.4) and P2 may respond (406.4)", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "gm")).toBe(true);

    await game.p1.activate("gm", MOVE_ATTACHED);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "gm", controller: P1, triggered: false }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });

    await game.p2.passPriority(); // nothing added ⇒ 340.1 resolves the newest item
    await game.p1.pick("sword2");
    await game.p1.pick("riven");
    expect(game.chain()).toEqual([]);
    expect(game.state("riven").attachments).toEqual(["sword1", "sword2"]);
    expect(game.state("gm").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 5, power: { calm: 2, order: 2 } }); // the 2nd ability costs only [Exhaust]
  });

  test("the FIRST ability is not offered while every Equipment is attached — it needs a DETACHED one", async () => {
    const game = await board().build();
    const keys = game.p1.legal().map((o) => o.key);
    expect(keys).toContain(`activateAbility:gm#${MOVE_ATTACHED}`);
    expect(keys).not.toContain("activateAbility:gm#0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) how much damage, and does the Skulker die
// ─────────────────────────────────────────────────────────────────────────────

describe("(c) the damage the trigger deals", () => {
  test("with only Sword #1 on the board the trigger deals 2: the 3-Might Skulker SURVIVES at 3 Might with 2 damage", async () => {
    // Sword #2 deliberately absent — with it on the Squire the engine miscounts (see the BUG facet).
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", RIVEN, "riven", { equippedWith: ["sword1"] })
      .card("sword1", { def: BF_SWORD, meta: { attachedTo: "riven" }, owner: P1, zone: "base" })
      .unit(P2, "bf1", SKULKER, "foe")
      .build();
    await game.p1.move("riven", "bf1");
    await drainChain(game);

    expect(game.state("foe")).toMatchObject({ damage: 2, might: 3, zone: "battlefield-bf1" });
  });

  test("re-geared first (Grandmaster in the open Main Phase), Riven has 2 Equipment at resolution: the trigger deals 4 and the Skulker DIES before combat damage", async () => {
    const game = await board().build();
    await regearRiven(game);
    expect(game.state("riven").attachments).toEqual(["sword1", "sword2"]);

    await game.p1.move("riven", "bf1");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "riven", targets: ["foe"], triggered: true }),
    ]);
    await drainChain(game);

    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("the whole combat: Riven (9) takes bf1 uncontested after the trigger cleared it, and P1 conquers for a point", async () => {
    const game = await board().build();
    await regearRiven(game);
    await game.p1.move("riven", "bf1");
    const s = await game.settle();

    expect(s.reason).toBe("open");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("riven")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test(
    "'for each Equipment attached to ME' counts only Riven's own Equipment (rule text of ven-041-166; 359.3.f.2 fixes only WHEN it is counted, not WHAT)",
    async () => {
      // Sword #2 is on the Squire, so Riven has ONE Equipment ⇒ 2 damage.
      const game = await board({ might: 20, name: "Wall" }).build();
      await game.p1.move("riven", "bf1");
      await drainChain(game);
      expect(game.state("foe").damage).toBe(2);
    },
  );

  test("an ENEMY unit's Equipment must not count either", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", RIVEN, "riven", { equippedWith: ["sword1"] })
      .card("sword1", { def: BF_SWORD, meta: { attachedTo: "riven" }, owner: P1, zone: "base" })
      .unit(P2, "bf1", { might: 20, name: "Wall" }, "wall", { equippedWith: ["theirSword"] })
      .card("theirSword", { def: BF_SWORD, meta: { attachedTo: "wall" }, owner: P2, zone: "base" })
      .build();
    await game.p1.move("riven", "bf1");
    await drainChain(game);
    expect(game.state("wall").damage).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (d) attach is not a Move, and nothing of Riven's re-triggers
// ─────────────────────────────────────────────────────────────────────────────

describe("(d) 434.4 / 434.4.a — Attach relocates the Equipment without moving anything", () => {
  test("the Sword's location becomes its new Top-Most Card's (bf1) while both units stay put, and no move/attack trigger is generated", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { calm: 2, order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .legend(P1, GRANDMASTER, "gm")
      .unit(P1, "bf1", RIVEN, "riven", { equippedWith: ["sword1"] })
      .card("sword1", { def: BF_SWORD, meta: { attachedTo: "riven" }, owner: P1, zone: "battlefield:bf1" })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["sword2"] })
      .card("sword2", { def: BF_SWORD, meta: { attachedTo: "squire" }, owner: P1, zone: "base" })
      .build();
    expect(game.locationOf("sword2")).toBe("base");

    await regearRiven(game);

    expect(game.state("sword2").attachedTo).toBe("riven");
    expect(game.locationOf("sword2")).toBe("bf1"); // 434.4 — follows the Top-Most Card
    expect(game.locationOf("riven")).toBe("bf1"); // nobody moved
    expect(game.locationOf("squire")).toBe("base");
    expect(game.state("squire").attachments).toEqual([]);
    expect(game.chain()).toEqual([]); // 434.4.a — not a Move, so no move trigger
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("383.4.e.2 / 383.4.e.2.a — the attack trigger fires exactly once, when the Attacker designation is gained; re-gearing beforehand does not add a second copy", async () => {
    const game = await board().build();
    await regearRiven(game);
    await game.p1.move("riven", "bf1");

    expect(game.chain().filter((c) => c.cardId === "riven")).toHaveLength(1);
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (e) the Might bonus in the damage step
// ─────────────────────────────────────────────────────────────────────────────

describe("(e) 718.4 — the Might bonus applies continuously from the moment of attachment", () => {
  test("Riven is 3 bare, 6 with one Sword and 9 with two — the Squire loses its +3 when its Sword leaves", async () => {
    const game = await board().build();
    expect(game.state("riven")).toMatchObject({ baseMight: 3, might: 6 });
    expect(game.state("squire").might).toBe(5); // 2 + 3

    await regearRiven(game);

    expect(game.state("riven").might).toBe(9);
    expect(game.state("squire").might).toBe(2);
  });

  test("she swings the full 9 in the damage step: an 8-Might defender is dealt 4 by the trigger and then 9 in combat and dies, while Riven survives the 8 she takes", async () => {
    const game = await board({ might: 8, name: "Wall" }).build();
    await regearRiven(game);
    await game.p1.move("riven", "bf1");
    await drainChain(game);
    expect(game.state("foe").damage).toBe(4);

    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("riven")).toBe("battlefield-bf1");
    // 143.3.b.2 / 466.1 — the 8 she took is healed in the Combat Cleanup; only 9 < 8 would have killed her.
    expect(game.state("riven")).toMatchObject({ attachments: ["sword1", "sword2"], damage: 0, might: 9 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
