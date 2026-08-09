/**
 * Interaction: is a "this turn" effect still live during the Ending Step?
 *
 *   × Imperial Decree   (ogn-221-298, Spell, order, 5 + [order][order]) "[Action] When any unit
 *                       takes damage this turn, kill it."
 *   × Blighted Battleaxe (unl-019-219, Equipment, fury, +4 Might) "[Equip] [1][fury] … At the
 *                       end of your turn, if I didn't conquer this turn, unattach this and deal 4
 *                       to me."  (Effect Text — conferred on the equipped unit, 136 / 718.3)
 *   × Playful Phantom   (ogn-049-298, Unit, calm, 5 Might, vanilla)
 *
 * Rules: 317.1.a (Ending Step: end-of-turn effects happen), 317.2.b/.c (Expiration Step: 3c
 * heal all units, THEN 3d all "this turn" effects expire), 319.5 (a Cleanup follows every chain
 * item leaving the chain), 323.7 (Cleanup step 5: unattached gear at a battlefield is recalled to
 * base), 142.4.b (lethal damage = non-zero and ≥ Might; 4 on a 5-Might unit is not lethal).
 *
 * Board: P1's Playful Phantom (5) wears Blighted Battleaxe (+4 = 9) at bf1, which P1 already
 * controls (so nothing is conquered this turn). P1 resolves Imperial Decree, then ends the turn.
 * Expected: 317.1 Battleaxe trigger → unattach (9 → 5) → deal 4 → the Phantom "takes damage this
 * turn" while Decree is still live (it only expires at 3d of 317.2) → killed, to trash; the loose
 * axe is recalled to P1's base. Contrast without Decree: 4 on 5 Might is not lethal, 3c heals it,
 * and the Phantom starts P2's turn at 5 Might undamaged with the axe back in base.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const BLIGHTED_BATTLEAXE = "unl-019-219";
const PLAYFUL_PHANTOM = "ogn-049-298";

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 2, rainbow: 2 } }) // Decree: 5 + [order][order]
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", PLAYFUL_PHANTOM, "phantom", { equippedWith: ["axe"] } as never)
    .card("axe", { def: BLIGHTED_BATTLEAXE, meta: { attachedTo: "phantom" }, owner: P1, zone: "bf1" })
    .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
    .hand(P1, IMPERIAL_DECREE, "decree");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

async function resolveDecree(game: Built): Promise<void> {
  await game.p1.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
}

describe("setup + Ending Step timing (317.1.a)", () => {
  test("board: the Phantom wears the Battleaxe at bf1 for 5 + 4 = 9 Might; Imperial Decree resolves to the trash without touching it", async () => {
    const game = await board().build();
    expect(game.state("phantom")).toMatchObject({ attachments: ["axe"], baseMight: 5, damage: 0, might: 9 });
    expect(game.state("axe")).toMatchObject({ attachedTo: "phantom", zone: "battlefield-bf1" });
    await resolveDecree(game);
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").might).toBe(9);
    expect(game.gameState.conqueredThisTurn[P1] ?? []).toEqual([]); // "if I didn't conquer this turn" holds
  });

  test("P1 ends the turn → in the ENDING phase the Battleaxe's end-of-turn ability (conferred on the Phantom) is put on the chain under P1's control, before anything has expired or healed", async () => {
    const game = await board().build();
    await resolveDecree(game);
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "phantom", controller: P1, triggered: true });
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.kind === "action" ? d.context : undefined).toBe("chain");
    expect(d?.seat).toBe(P1);
    // Still P1's turn: the +4 and the attachment are intact while the trigger waits.
    expect(game.state("phantom").might).toBe(9);
    expect(game.state("axe").attachedTo).toBe("phantom");
  });

  test("the same end-of-turn trigger is put on the chain with no Imperial Decree in the picture (the trigger belongs to the axe, not to Decree)", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "phantom", controller: P1, triggered: true });
  });
});

describe("WITH Imperial Decree: the 'this turn' kill-on-damage is still live in the Ending Step (expires only at 317.2 step 3d)", () => {
  test("Battleaxe's trigger unattaches it (9 → 5) and deals 4 to the Phantom, which 'takes damage this turn' under Decree and is KILLED (to P1's trash); the loose axe is recalled to P1's base unattached (323.7)", async () => {
      // Expected: phantom → trash; axe → base, attachedTo undefined; then P2's turn begins normally.
      // Actual: the chain item resolves as a no-op: phantom stays at bf1 with the axe attached (9 Might).
      const game = await board().build();
      await resolveDecree(game);
      await game.p1.endTurn();
      await game.settle();
      expect(game.turnPlayer()).toBe(P2);
      expect(game.phase()).toBe("main");
      expect(game.zoneOf("phantom")).toBe("trash");
      expect(game.zoneOf("axe")).toBe("base");
      expect(game.state("axe").attachedTo).toBeUndefined();
      expect(game.p1.units("bf1")).toEqual([]);
    },
  );

  test("after 3d the Decree HAS expired: on P2's turn a 1-Might attacker deals non-lethal combat damage to the Phantom and the Phantom is NOT killed (only the attacker dies)", async () => {
    // No axe here: with the Battleaxe attached the Ending-Step 4 damage lands
    // while the Decree is still live and the Phantom never survives to P2's
    // turn, which would hide what this test is about (the 3d expiry).
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 2, rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", PLAYFUL_PHANTOM, "phantom")
      .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
      .hand(P1, IMPERIAL_DECREE, "decree")
      .build();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    await game.p2.move("poker", "bf1");
    await game.settle();
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});

describe("WITHOUT Imperial Decree (contrast): 4 damage on a 5-Might Phantom is not lethal (142.4.b) and is healed at 3c", () => {
  test("the axe unattaches (→ 5 Might) and deals 4; the Phantom survives the Ending Step, is healed at 3c, and enters P2's turn at bf1 with 5 Might / 0 damage while the unattached axe sits in P1's base", async () => {
      // Expected: phantom at bf1, might 5, damage 0, attachments []; axe in base unattached.
      // Actual: phantom might 9 with attachments ["axe"]; axe still at battlefield-bf1 attached.
      const game = await board().build();
      await game.p1.endTurn();
      await game.settle();
      expect(game.turnPlayer()).toBe(P2);
      expect(game.phase()).toBe("main");
      expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
      expect(game.state("phantom")).toMatchObject({ attachments: [], damage: 0, might: 5 });
      expect(game.zoneOf("axe")).toBe("base");
      expect(game.state("axe").attachedTo).toBeUndefined();
      expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    },
  );

  test("what does hold either way: the Phantom is alive and undamaged on P2's turn, P1 still controls bf1, and no 'this turn' Decree lingers (Poker's 1 combat damage does not kill it)", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("decree")).toBe("hand");
    await game.p2.move("poker", "bf1");
    await game.settle();
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
  });
});
