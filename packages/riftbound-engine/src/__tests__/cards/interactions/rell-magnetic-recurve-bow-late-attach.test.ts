/**
 * Interaction: Rell, Magnetic (sfd-024-221) 4 Might · [Tank] · "When I attack, you may play an Equipment
 *              with Energy cost no more than [2], ignoring its cost. If you do, then do this: Attach it to me."
 *            × Recurve Bow   (sfd-016-221) Equipment · 2 energy · +0 · Effect Text "When I attack or defend,
 *              deal 2 to an enemy unit here."
 *            (× Angle Shot sfd-011-221 Reaction "…detach that Equipment from that unit. Draw 1." for (d);
 *             × Doran's Blade sfd-095-221 +2 Equipment as the non-zero-bonus control for (b))
 *
 * Question: Rell attacks a battlefield held by P2's 3-Might unit; her attack trigger plays Recurve Bow from
 * hand for free and attaches it to her.
 *   (a) Does the Bow's "When I attack" deal 2 in THIS combat?
 *   (b) Does Rell get the Bow's Might bonus for this combat's damage step?
 *   (c) In a LATER combat (Rell attacks again, or defends) does the deal-2 fire, who picks, and what is
 *       "an enemy unit here"?
 *   (d) If the Bow is detached (Angle Shot) in response while that later trigger is on the chain, does the
 *       2 damage still happen?
 *
 * Rules: 383.2.c (trigger conditions are evaluated right after the inciting event) + 383.4.e/383.4.e.2.a
 * (the attack trigger fires once, when the Attacker designation is gained — before the Bow was attached);
 * 718.3/136.2.c (attached Effect Text is appended to Rell's rules text: "I" is Rell); 718.4/137.3.a (the
 * Might bonus applies continuously from attachment); 434.4/434.4.a (Attach relocates the Bow to Rell's
 * battlefield — not a Move); 191.4.a (Rell's controller controls the conferred trigger and chooses its
 * target); 740.1.b ("enemy" is relative to the controller); "here" = Rell's battlefield; 435.1.d (detaching
 * removes the appended text going forward only — a triggered ability already on the chain still resolves).
 *
 * Expected: (a) No — no Bow trigger this combat. (b) Yes (Bow is +0 so Rell stays 4; Doran's Blade the same
 * way makes her swing at 6). (c) Yes — on attack AND on defend; P1 chooses among ENEMY units AT RELL'S
 * BATTLEFIELD only. (d) Yes — the pending trigger still deals 2 although the Bow is already off.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELL = "sfd-024-221";
const RECURVE_BOW = "sfd-016-221";
const ANGLE_SHOT = "sfd-011-221";
const DORANS_BLADE = "sfd-095-221";

/**
 * bf1: P2's `foe` (the first defender). bf2: P2's s1/s2 (for the later re-attack). P2 base: r1/r2 (later
 * raiders) and `camper` (never "here"). P1: Rell in base, Bow + Angle Shot in hand, two fury runes.
 */
function board(foeMight = 3) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe")
    .unit(P2, "bf2", { might: 2, name: "Scout One" }, "s1")
    .unit(P2, "bf2", { might: 2, name: "Scout Two" }, "s2")
    .unit(P2, "base", { might: 2, name: "Raider One" }, "r1")
    .unit(P2, "base", { might: 2, name: "Raider Two" }, "r2")
    .unit(P2, "base", { might: 1, name: "Camper" }, "camper")
    .unit(P1, "base", RELL, "rell")
    .hand(P1, RECURVE_BOW, "bow")
    .hand(P1, ANGLE_SHOT, "shot")
    .runes(P1, "fury", 2);
}

/**
 * Rell attacks bf1; accept her trigger, let it resolve, pick `equipment` from hand. Returns with the
 * Equipment attached, the chain empty and P1 holding Focus in the showdown — i.e. BEFORE combat damage.
 */
async function attackAndFetch(game: Game, equipment = "bow"): Promise<void> {
  await game.p1.move("rell", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rell", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  await game.p1.passPriority();
  await game.p2.passPriority(); // Rell's trigger resolves → choose the Equipment to play
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain(equipment);
  await game.p1.pick(equipment);
  expect(game.state(equipment).attachedTo).toBe("rell");
}

/**
 * Step through whatever is on the chain: decline Rell's own optional "you may play an Equipment"
 * (irrelevant to the later combats), answer target picks with `pick`, otherwise pass priority.
 */
async function drainChain(game: Game, pick: (options: string[]) => string): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d) {
      return;
    }
    const seat = d.seat === P1 ? game.p1 : game.p2;
    if (d.kind === "yes-no") {
      await seat.no();
    } else if (d.kind === "pick") {
      await seat.pick(pick(d.options.map((o) => (o.card ?? o.key) as string)));
    } else if (d.kind === "action" && d.context === "chain") {
      await seat.passPriority();
    } else {
      return;
    }
  }
}

describe("Rell, Magnetic × Recurve Bow — Equipment attached mid-combat by Rell's own attack trigger", () => {
  // ---------------------------------------------------------------- (a) no Bow trigger this combat

  test("(a) the Bow attached AFTER Rell became the attacker raises no 'When I attack' this combat: chain empty, Foe undamaged before the damage step (383.2.c / 383.4.e.2.a)", async () => {
    const game = await board(3).build();
    await attackAndFetch(game);
    expect(game.zoneOf("bow")).toBe("battlefield-bf1"); // relocated by Attach (434.4), not a Move
    expect(game.chain()).toEqual([]); // no deal-2 item was created by the attach
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("foe").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 4 ≥ 3 from combat alone
    expect(game.locationOf("rell")).toBe("bf1"); // took 3 < 4
    expect(game.state("rell").attachments).toEqual(["bow"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played "ignoring its cost"
    expect(game.violations()).toEqual([]);
  });

  test("(a) discriminating line: into a 5-Might Foe the late Bow adds no 2 — Foe survives (takes only 4) and Rell dies; the Bow is recalled to base", async () => {
    // Had the Bow's trigger fired, Foe would take 2 + 4 = 6 ≥ 5 and die.
    const game = await board(5).build();
    await attackAndFetch(game);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.zoneOf("rell")).toBe("trash"); // took 5 ≥ 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("bow")).toBe("base"); // 719.5 + 457.1
    expect(game.state("bow").attachedTo).toBeUndefined();
  });

  // ---------------------------------------------------------------- (b) Might bonus applies at once

  test("(b) the Might bonus applies from the moment of attachment (718.4): Bow is +0 so Rell swings at 4; Doran's Blade fetched the same way makes her 6 and kills a 5-Might Foe", async () => {
    const bow = await board(3).build();
    await attackAndFetch(bow, "bow");
    expect(bow.state("rell")).toMatchObject({ attachments: ["bow"], baseMight: 4, might: 4 });

    const blade = await board(5).hand(P1, DORANS_BLADE, "blade").build();
    await attackAndFetch(blade, "blade");
    expect(blade.state("rell")).toMatchObject({ attachments: ["blade"], might: 6 });
    await blade.settle();
    expect(blade.zoneOf("foe")).toBe("trash"); // 6 ≥ 5 — the bonus counted at the damage step
    expect(blade.locationOf("rell")).toBe("bf1"); // took 5 < 6
    expect(blade.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  // ---------------------------------------------------------------- (c) later combats

  test("(c) DEFEND next turn: two raiders attack Rell → ONE deal-2 trigger sourced from Rell, controlled by P1; P1 is asked and offered exactly the enemy units HERE (not Camper in P2's base, not Rell)", async () => {
    const game = await board(3).build();
    await attackAndFetch(game);
    await game.settle(); // Rell conquers bf1 wearing the Bow
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move(["r1", "r2"], "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rell", controller: P1, triggered: true })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["r1", "r2"]);
  });

  test("(c) DEFEND next turn: P1 picks Raider One → it takes 2 and dies before combat damage; Rell (4) then kills Raider Two and holds", async () => {
    const game = await board(3).build();
    await attackAndFetch(game);
    await game.settle();
    await game.advanceTurn();
    await game.p2.move(["r1", "r2"], "bf1");
    await drainChain(game, () => "r1");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("r1")).toBe("trash"); // 2 ≥ 2 from the Bow's effect text alone
    expect(game.state("camper").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("r2")).toBe("trash"); // 4 ≥ 2 in combat
    expect(game.locationOf("rell")).toBe("bf1"); // took 2 < 4
    expect(game.state("rell").attachments).toEqual(["bow"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(c) ATTACK again two turns later (recall to base, then into bf2): now BOTH Rell's printed trigger and the Bow's conferred 'When I attack' go on the chain; P1 picks among the enemy units at bf2 and the pick takes 2", async () => {
    const game = await board(3).build();
    await attackAndFetch(game);
    await game.settle();
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    await game.p1.move("rell", "base"); // walk home still wearing the Bow (719.3.a)
    await game.settle();
    expect(game.locationOf("rell")).toBe("base");
    expect(game.state("bow").attachedTo).toBe("rell");
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);

    await game.p1.move("rell", "bf2");
    const items = game.chain();
    expect(items).toHaveLength(2); // Rell's own "you may play an Equipment" + the Bow's deal-2
    expect(items.every((i) => i.cardId === "rell" && i.controller === P1 && i.triggered)).toBe(true);
    let offered: string[] = [];
    await drainChain(game, (opts) => {
      offered = opts.toSorted();
      return "s1";
    });
    expect(offered).toEqual(["s1", "s2"]); // "enemy unit here" = at bf2; foe is dead, camper/r1/r2 are in P2's base
    expect(game.zoneOf("s1")).toBe("trash"); // 2 ≥ 2 before combat damage
    expect(game.state("camper").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("s2")).toBe("trash"); // 4 ≥ 2
    expect(game.locationOf("rell")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  // ---------------------------------------------------------------- (d) detach in response

  test("(d) Angle Shot detaches the Bow in response to the pending defend trigger: Bow off (base, unattached), P1 drew 1 — yet the trigger STILL resolves and Raider One takes 2 and dies (435.1.d is forward-only)", async () => {
    const game = await board(3).build();
    await attackAndFetch(game);
    await game.settle();
    await game.advanceTurn();
    await game.p2.move(["r1", "r2"], "bf1");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("r1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rell", targets: ["r1"], triggered: true })]);

    // P1 responds: two fury runes → 2 energy → Angle Shot choosing (Rell, Bow) = detach.
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    await game.p1.tapRunes(2);
    expect(game.p1.can("cast", "shot")).toBe(true);
    const handBefore = game.p1.hand().length; // includes Angle Shot itself
    await game.p1.cast("shot", { targets: ["rell", "bow"] });
    expect(game.chain().map((i) => i.cardId)).toEqual(["rell", "shot"]); // the spell sits on top of the trigger

    await drainChain(game, () => "r1");
    expect(game.chain()).toEqual([]);
    // Angle Shot resolved first (LIFO): Bow detached and no longer confers anything; P1 drew 1.
    expect(game.state("bow").attachedTo).toBeUndefined();
    expect(game.state("rell").attachments).toEqual([]);
    expect(game.zoneOf("shot")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
    // ...and the already-pending trigger resolved anyway.
    expect(game.zoneOf("r1")).toBe("trash");

    await game.settle();
    expect(game.zoneOf("bow")).toBe("base"); // unattached gear at a battlefield → recalled (457.1)
    expect(game.zoneOf("r2")).toBe("trash"); // bare Rell is still 4 ≥ 2
    expect(game.locationOf("rell")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("(d) control: with the Bow detached, a LATER attack on Rell raises no deal-2 trigger at all", async () => {
    const game = await board(3).unit(P2, "base", { might: 1, name: "Straggler" }, "straggler").build();
    await attackAndFetch(game);
    await game.settle();
    await game.advanceTurn();
    await game.p2.move(["r1", "r2"], "bf1");
    await game.p1.pick("r1");
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.tapRunes(2);
    await game.p1.cast("shot", { targets: ["rell", "bow"] });
    await drainChain(game, () => "r1");
    await game.settle(); // combat: r2 dies, Rell holds, Bow recalled to base
    expect(game.state("rell").attachments).toEqual([]);

    await game.advanceTurn();
    await game.advanceToTurnOf(P2); // a full round later P2 attacks the now bare Rell
    await game.p2.move("straggler", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("pick");
    await game.settle();
    expect(game.zoneOf("straggler")).toBe("trash"); // 4 ≥ 1, combat only
    expect(game.locationOf("rell")).toBe("bf1");
  });
});
