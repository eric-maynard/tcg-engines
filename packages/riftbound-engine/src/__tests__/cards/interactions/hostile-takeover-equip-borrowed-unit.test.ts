/**
 * Interaction: Hostile Takeover (sfd-202-221) "Take control of an enemy unit at a battlefield. Ready it. …
 *   Lose control of that unit and recall it at end of turn."
 *   × Trinity Force (sfd-115-221) Equipment · +2 · "[Equip] [body] (Attach this to a unit you control.)
 *     When I hold, score 1 point."
 *   × Angle Shot (sfd-011-221) "Choose a unit and an Equipment with the same controller. Attach that
 *     Equipment to that unit or detach that Equipment from that unit. Draw 1."
 *
 * Question. P1's turn. P2's lone 3-Might unit X sits at bf1 (P2's). P1 Hostile-Takeovers X (control,
 * ready, conquer) and then Equips Trinity Force choosing X.
 *   (a) Is X a legal Equip target although P1 does not OWN it? — YES: Equip wants "a unit you control"
 *       (818.1.c.2, target per 818.1.b.1); ownership is irrelevant. X becomes the Top-Most card: 3+2 = 5
 *       with the hold text appended (718.3 / 718.4).
 *   (b) End of turn: P1 loses control of X and X is recalled. — X goes to P2's base; the recall is a
 *       change of LOCATION, not board→non-board, so Trinity Force stays attached and travels with it
 *       (719.3.a, 718.1; 719.5 does not apply). Control of the Top-Most card changing does not change
 *       control of the attachment (718.5.e/f): P2 controls X, P1 still controls Trinity Force, and X is
 *       still 5 Might with the hold text for P2 (718.5.g).
 *   (c) Later turns: P1's printed [Equip] on Trinity Force is Inactive while attached (718.2 / 721.2) →
 *       cannot re-equip it that way. Angle Shot (Y, Trinity Force) with P1's own Y: legal (both P1's —
 *       "same controller"); attaching to Y detaches it from X (434.1.f) → X back to 3 without the text
 *       (435.1.d/e), Y 2+2 = 4. Angle Shot (X, Trinity Force): NOT a legal pair for either player (X is
 *       P2's, the Force is P1's).
 *   (d) P2 moves X (still wearing the Force) to a battlefield and holds: P2 scores the extra point —
 *       the appended ability is part of X's rules text (136.2.c / 719.1), its controller is X's
 *       controller (191.4.a), and X is P2's holding unit (383.4.d.2.a). P1 controlling the Equipment
 *       card itself is irrelevant.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const TRINITY_FORCE = "sfd-115-221";
const ANGLE_SHOT = "sfd-011-221";

/**
 * P1's turn. bf1 is P2's with P2's lone Xerxes (3). P1: Yeoman (2) in base, Trinity Force lying in
 * base, Hostile Takeover + Angle Shot in hand, 7 energy + 2 order + 1 body. P2 holds an Angle Shot too.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Xerxes" }, "x")
    .unit(P1, "base", { might: 2, name: "Yeoman" }, "y")
    .gear(P1, TRINITY_FORCE, "tf")
    .hand(P1, HOSTILE_TAKEOVER, "ht")
    .hand(P1, ANGLE_SHOT, "shotP1")
    .hand(P2, ANGLE_SHOT, "shotP2");
}

/**
 * The position right after (b), seeded directly (so the 719.3.a travel bug below cannot mask later
 * facets): P2's Xerxes in P2's base wearing P1's Trinity Force; bf1 uncontrolled and empty.
 */
function afterRecall(active: string) {
  return scenario()
    .active(active)
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 3, name: "Xerxes" }, "x", { equippedWith: ["tf"] })
    .card("tf", { controller: P1, def: TRINITY_FORCE, meta: { attachedTo: "x" }, owner: P1, zone: "base" })
    .unit(P1, "base", { might: 2, name: "Yeoman" }, "y")
    .hand(P1, ANGLE_SHOT, "shotP1")
    .hand(P2, ANGLE_SHOT, "shotP2");
}

const equipTargets = (game: Game, seat: "p1" | "p2" = "p1", equipment = "tf") =>
  game[seat]
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants)
    .filter((v) => v.params.equipmentId === equipment)
    .map((v) => v.params.unitId as string);

/** Flatten the `targets` tuples Angle Shot offers to a seat into "unit+equipment" strings. */
const angleShotPairs = (game: Game, seat: "p1" | "p2", alias: string) =>
  (game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets")?.options ?? []).map((v) => (v as string[]).join("+"));

/** Hostile Takeover on X, through the handed-back Non-Combat Showdown, to P1's open main phase (bf1 conquered). */
async function steal(game: Game): Promise<void> {
  await game.p1.cast("ht", { targets: "x" });
  await game.settle(); // resolves; the unopposed steal opens a Non-Combat Showdown (handed back once)
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.settle(); // Focus passes → P1 conquers bf1
  expect(game.state("x")).toMatchObject({ controller: P1, owner: P2, zone: "battlefield-bf1" });
}

async function stealAndEquip(game: Game): Promise<void> {
  await steal(game);
  await game.p1.choose("equipCard", { params: { equipmentId: "tf", unitId: "x" } });
  await game.settle();
  expect(game.state("tf").attachedTo).toBe("x");
}

describe("Hostile Takeover × Trinity Force × Angle Shot — equipping a borrowed unit", () => {
  // ── (a) ────────────────────────────────────────────────────────────────────────────────────────
  test("(a) after the steal, [Equip] offers the borrowed Xerxes (controlled, not owned) alongside P1's own Yeoman (818.1.c.2)", async () => {
    const game = await board().build();
    expect(equipTargets(game).sort()).toEqual(["y"]); // before: X is an enemy unit, never offered
    await steal(game);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(equipTargets(game).sort()).toEqual(["x", "y"]);
  });

  test("(a) equipping X: pays [body], resolves, X is the Top-Most card at 3+2 = 5 — controller P1, owner still P2; the Force is P1's and sits with X at bf1", async () => {
    const game = await board().build();
    await steal(game);
    await game.p1.choose("equipCard", { params: { equipmentId: "tf", unitId: "x" } });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tf", controller: P1 })]);
    await game.settle();
    expect(game.state("x")).toMatchObject({ attachments: ["tf"], baseMight: 3, controller: P1, might: 5, owner: P2, zone: "battlefield-bf1" });
    expect(game.state("tf")).toMatchObject({ attachedTo: "x", controller: P1, location: "bf1", owner: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) ────────────────────────────────────────────────────────────────────────────────────────
  test("(b) end of turn: X is recalled to P2's base under P2's control, STILL wearing the Force — 5 Might for P2; the Force itself is still controlled (and owned) by P1 (718.5.e/f/g)", async () => {
    const game = await board().build();
    await stealAndEquip(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("x")).toMatchObject({ attachments: ["tf"], controller: P2, location: "base", might: 5, owner: P2, zone: "base" });
    expect(game.p2.units("base")).toContain("x");
    expect(game.p1.units("base")).not.toContain("x");
    expect(game.state("tf")).toMatchObject({ attachedTo: "x", controller: P1, owner: P1 });
    expect(game.p1.points()).toBe(1); // the conquer point stays
  });

  test("(b) the attached Force must travel with X to base (719.3.a — a recall is a location change, not 719.5) and bf1, now empty, becomes uncontrolled; the engine leaves the Force in battlefield-bf1 and keeps bf1 under P1", async () => {
    // Expected: tf zone/location "base" (with its Top-Most card), bf1.controller null (323.6 — no units left).
    // Actual: tf.zone === "battlefield-bf1", location "bf1", and that stray gear keeps bf1.controller === P1.
    const game = await board().build();
    await stealAndEquip(game);
    await game.advanceTurn();
    expect(game.state("x").zone).toBe("base");
    expect(game.zoneOf("tf")).toBe("base");
    expect(game.locationOf("tf")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  // ── (c) ────────────────────────────────────────────────────────────────────────────────────────
  test("(c) on P1's next turn the Force's printed [Equip] is Inactive while attached (718.2 / 721.2): with [body] in pool no Equip is offered and forcing it is rejected", async () => {
    const game = await board().build();
    await stealAndEquip(game);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 2, power: { body: 1 } });
    expect(game.p1.power("body")).toBe(1);
    expect(equipTargets(game)).toEqual([]);
    expect((await game.p1.try((p) => p.choose("equipCard", { params: { equipmentId: "tf", unitId: "y" } }))).ok).toBe(false);
    expect(game.state("tf").attachedTo).toBe("x");
  });

  test("(c) Angle Shot (Yeoman, Force) IS legal for P1 — both are P1's; attaching to Y detaches it from X (434.1.f): Y 2+2 = 4, X back to 3 with nothing attached (435.1.d/e); P1 draws 1", async () => {
    const game = await board().build();
    await stealAndEquip(game);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 2 });
    expect(angleShotPairs(game, "p1", "shotP1")).toContain("y+tf");
    const hand = game.p1.hand().length;
    await game.p1.cast("shotP1", { targets: ["y", "tf"] });
    await game.settle();
    expect(game.state("tf")).toMatchObject({ attachedTo: "y", controller: P1, zone: "base" });
    expect(game.state("y")).toMatchObject({ attachments: ["tf"], might: 4 });
    expect(game.state("x")).toMatchObject({ attachments: [], controller: P2, might: 3 });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.zoneOf("shotP1")).toBe("trash");
  });

  test("(c) Angle Shot (Xerxes, Force) is NOT a legal pair for either player — X is P2's, the Force is P1's ('same controller' fails)", async () => {
    // P2, on P2's turn (right after the recall).
    const game = await board().build();
    await stealAndEquip(game);
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 2 });
    expect(angleShotPairs(game, "p2", "shotP2")).not.toContain("x+tf");
    expect((await game.p2.try((p) => p.cast("shotP2", { targets: ["x", "tf"] }))).ok).toBe(false);
    // (P2 may still aim it at P1's own pair — "same controller", not "friendly".)
    expect(angleShotPairs(game, "p2", "shotP2")).toEqual(["y+tf"]);
    // P1, on P1's following turn.
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 2 });
    expect(angleShotPairs(game, "p1", "shotP1")).not.toContain("x+tf");
    await expect(game.p1.cast("shotP1", { targets: ["x", "tf"] })).rejects.toThrow();
    expect(game.state("tf").attachedTo).toBe("x");
  });

  test("(c) same answers from the cleanly seeded post-recall position: no printed Equip for P1, (Y, Force) offered, (X, Force) offered to nobody", async () => {
    const p2Turn = await afterRecall(P2).resources(P2, { energy: 2, power: { body: 1 } }).build();
    expect(p2Turn.state("x")).toMatchObject({ attachments: ["tf"], controller: P2, might: 5 });
    expect(angleShotPairs(p2Turn, "p2", "shotP2")).toEqual(["y+tf"]);
    expect(equipTargets(p2Turn, "p2")).toEqual([]); // P2 does not control the Force at all
    const p1Turn = await afterRecall(P1).resources(P1, { energy: 2, power: { body: 1 } }).build();
    expect(equipTargets(p1Turn, "p1")).toEqual([]);
    expect(angleShotPairs(p1Turn, "p1", "shotP1")).toEqual(["y+tf"]);
  });

  // ── (d) ────────────────────────────────────────────────────────────────────────────────────────
  test("(d) P2 walks X (wearing P1's Force) onto the empty, uncontrolled bf1 → P2 conquers it (+1); an attached gear controlled by the opponent is not a unit and cannot contest (the engine treats bf1 as shared and awards nothing)", async () => {
    // Expected: bf1.controller P2, P2 1 point, X (5) and the Force both at bf1. Actual: bf1.controller stays
    // null, P2 scores 0, and P1 is later offered "contestBattlefield:bf1" on the strength of the gear alone.
    // (Control: the same walk with no Force, or with a P2-controlled Force, conquers normally.)
    const game = await afterRecall(P2).build();
    await game.p2.move("x", "bf1");
    await game.settle();
    await game.settle();
    expect(game.state("x")).toMatchObject({ location: "bf1", might: 5 });
    expect(game.state("tf")).toMatchObject({ attachedTo: "x", controller: P1, location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  test("(d) P2 HOLDS bf1 with X wearing P1's Force: at P2's Beginning Phase P2 scores 2 (the Hold + X's appended 'When I hold, score 1 point'), P1 scores nothing (136.2.c / 191.4.a / 383.4.d.2.a)", async () => {
    // Seeded one step further: X already sits at bf1, which P2 controls; P1 is finishing their turn.
    const holding = () =>
      scenario()
        .active(P1)
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { might: 3, name: "Xerxes" }, "x", { equippedWith: ["tf"] })
        .card("tf", { controller: P1, def: TRINITY_FORCE, meta: { attachedTo: "x" }, owner: P1, zone: "bf1" })
        .unit(P1, "base", { might: 2, name: "Yeoman" }, "y");
    const game = await holding().build();
    expect(game.state("x")).toMatchObject({ controller: P2, might: 5 });
    expect(game.state("tf")).toMatchObject({ attachedTo: "x", controller: P1, owner: P1 });
    await game.advanceTurn(); // P1 ends → P2's Beginning Phase: Hold, then X's hold trigger
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.p2.points()).toBe(2);
    expect(game.p1.points()).toBe(0);

    // Control: the same hold with a bare X is worth exactly 1 — the second point really is the Force's text.
    const bare = await scenario().active(P1).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3, name: "Xerxes" }, "x").build();
    await bare.advanceTurn();
    expect(bare.p2.points()).toBe(1);
  });
});
