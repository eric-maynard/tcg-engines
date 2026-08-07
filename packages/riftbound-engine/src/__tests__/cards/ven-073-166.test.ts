/**
 * Jagged Cutlass — ven-073-166 · Gear (Equipment) · Body · 3 energy · Might bonus +2
 *
 *   Equip [body] ([body]: Attach this to a unit you control.)
 *
 * Head-judge checklist for this card:
 *  - Two separate payments: [3] energy to PLAY the gear (it lands in base, ready, unattached — playing
 *    it attaches nothing), then the [Equip] activated ability (818) for exactly one [body] POWER (no
 *    energy, no other domain) to attach it to a unit YOU control (818.1.b.1: that unit is a target;
 *    enemy units are never legal). Activated ⇒ your turn, Open state only (381).
 *  - While attached the +2 Might bonus modulates the holder (718.4) everywhere it goes (719.3.a) and
 *    counts in combat; a non-Weaponmaster unit holds at most one Equipment.
 *  - When the holder dies the Cutlass DETACHES and stays on the board (719.5), then is recalled to its
 *    controller's base at the next Cleanup (457.1) — unattached, bonus gone, re-equippable later.
 *  - Weaponmaster (821, e.g. Armed Assailant sfd-002-221) must recognise it as Equipment and offer to
 *    attach it on play for its Equip cost minus [rainbow] — i.e. for free.
 *  - Engine status: the printed line "Equip [body]" (no brackets around the keyword) was not parsed,
 *    so the registry has NO abilities for this card and the engine treats it as a plain,
 *    un-attachable gear. Everything past "play it for 3" is therefore a BUG test today.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-073-166";
const ARMED_ASSAILANT = "sfd-002-221"; // 6+[fury] unit with [Weaponmaster]

/** P1's turn: Cutlass on the board, a 2-Might ally in base, 1 body power; P2 holds bf1 with a 3-Might guard and has a base unit. */
function board(power: Record<string, number> = { body: 1 }) {
  return scenario()
    .resources(P1, { energy: 0, power })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, CARD, "cutlass")
    .unit(P1, "base", { might: 2, name: "Deckhand" }, "deckhand")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 1, name: "Their Swab" }, "swab");
}

const equipOption = (game: Game) => game.p1.legal().find((o) => o.moveId === "equipCard");
async function equip(game: Game, unitId: string): Promise<void> {
  expect(equipOption(game)?.fields.find((f) => f.name === "equipmentId")?.options ?? []).toContain("cutlass");
  await game.p1.choose("equipCard:-", { params: { equipmentId: "cutlass", unitId } });
  await game.settle();
}

describe("Jagged Cutlass (ven-073-166)", () => {
  test("registry payload (printed frame): a 3-energy Body gear with a +2 Might bonus and no power cost to play", async () => {
    const game = await scenario().hand(P1, CARD, "cutlass").build();
    expect(game.state("cutlass")).toMatchObject({ cardType: "gear", domains: ["body"], energyCost: 3, name: "Jagged Cutlass", powerCost: [] });
    expect(peekDefaultCardPool()?.get(CARD)).toMatchObject({ mightBonus: 2 });
  });

  test("registry payload should carry the [Equip] keyword with cost [body] (the unbracketed 'Equip [body]' line was not parsed at all)", async () => {
    // Expected (same shape as Pendulum Blade ven-011-166): [{ cost: { power: ["body"] }, keyword: "Equip", type: "keyword" }].
    // Actual: `abilities` is absent.
    await scenario().build();
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([{ cost: { power: ["body"] }, keyword: "Equip", type: "keyword" }]);
  });

  test("play cost: 3 energy and no power; it enters the base READY and unattached — playing it attaches nothing and the ally stays at 2; 2 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { body: 1 } }).unit(P1, "base", { might: 2 }, "deckhand").hand(P1, CARD, "cutlass").build();
    await game.p1.play("cutlass");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } }); // the [body] is the EQUIP cost, untouched by the play
    await game.settle();
    expect(game.state("cutlass")).toMatchObject({ attachedTo: undefined, isReady: true, zone: "base" });
    expect(game.state("deckhand")).toMatchObject({ attachments: [], might: 2 });
    expect((await scenario().resources(P1, { energy: 2, power: { body: 3 } }).hand(P1, CARD, "c").build()).p1.can("play", "c")).toBe(false);
  });

  test("[Equip] — with a [body] power and a unit you control, the attach action is offered, naming only YOUR unit (never the enemy's)", async () => {
    // Expected: an equipCard option {equipmentId: [cutlass], unitId: [deckhand]}. Actual: no option (not recognised as Equipment).
    const game = await board().build();
    const opt = equipOption(game);
    expect(opt).toBeDefined();
    expect(opt?.fields.find((f) => f.name === "equipmentId")?.options).toEqual(["cutlass"]);
    expect(opt?.fields.find((f) => f.name === "unitId")?.options).toEqual(["deckhand"]);
  });

  test("[Equip] pays exactly one [body] (energy untouched), attaches the Cutlass and the holder gains +2 Might (2 → 4)", async () => {
    const game = await board({ body: 2 }).resources(P1, { energy: 5 }).build();
    await equip(game, "deckhand");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 1 } });
    expect(game.state("cutlass").attachedTo).toBe("deckhand");
    expect(game.state("deckhand")).toMatchObject({ attachments: ["cutlass"], might: 4 });
  });

  test("negative space: without a [body] power (energy alone, or power of another domain) no attach is possible; never on the opponent's turn; the enemy can never equip your Cutlass", async () => {
    expect(equipOption(await board({}).resources(P1, { energy: 9 }).build())).toBeUndefined();
    expect(equipOption(await board({ mind: 2 }).build())).toBeUndefined();
    const opp = await board().active(P2).resources(P2, { power: { body: 2 } }).build();
    expect(equipOption(opp)).toBeUndefined();
    expect(opp.p2.legal().some((o) => o.moveId === "equipCard")).toBe(false);
    expect((await opp.p2.try((p) => p.do("equipCard", { equipmentId: "cutlass", unitId: "swab" }))).ok).toBe(false);
    expect(opp.state("cutlass").attachedTo).toBeUndefined();
  });

  test("the +2 rides into combat — the equipped 2-Might Deckhand (4) attacks the 3-Might Guard, kills it, survives, conquers; the Cutlass travels with it (719.3.a)", async () => {
    const game = await board().build();
    await equip(game, "deckhand");
    await game.p1.move("deckhand", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("deckhand")).toMatchObject({ might: 4, zone: "battlefield-bf1" });
    expect(game.state("cutlass")).toMatchObject({ attachedTo: "deckhand", zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative control: the same attack WITHOUT the Cutlass loses (2 into 3) — Deckhand dies, no conquer", async () => {
    const game = await board().build();
    await game.p1.move("deckhand", "bf1");
    await game.settle();
    expect(game.zoneOf("deckhand")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(0);
  });

  test("when the holder dies the Cutlass detaches (719.5) and is recalled to P1's base at Cleanup (457.1) — on the board, unattached, ready to be equipped again", async () => {
    const game = await board({ body: 2 }).unit(P2, "bf1", { might: 6, name: "Brute" }, "brute").build();
    await equip(game, "deckhand");
    expect(game.state("cutlass").attachedTo).toBe("deckhand");
    await game.p1.move("deckhand", "bf1"); // 4 into 3+6: dies
    await game.settle();
    expect(game.zoneOf("deckhand")).toBe("trash");
    expect(game.state("cutlass")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.trash()).not.toContain("cutlass");
  });

  test("Weaponmaster (Armed Assailant) should offer the Cutlass on play and attach it for [body] − [rainbow] = free → 6 + 2 = 8 Might", async () => {
    // Expected: the Weaponmaster prompt lists the Cutlass; picking it costs nothing and attaches it.
    // Actual: no prompt at all — the Cutlass is not seen as Equipment.
    const game = await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).gear(P1, CARD, "cutlass").hand(P1, ARMED_ASSAILANT, "assailant").build();
    await game.p1.play("assailant");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("cutlass");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("cutlass").attachedTo).toBe("assailant");
    expect(game.state("assailant").might).toBe(8);
  });

  test("one Equipment per non-Weaponmaster unit — after the Cutlass is on Deckhand, a second Cutlass may only go to the OTHER unit", async () => {
    const game = await board({ body: 3 }).gear(P1, CARD, "cutlass2").unit(P1, "base", { might: 1, name: "Cabin Boy" }, "boy").build();
    await equip(game, "deckhand");
    expect(game.state("deckhand").might).toBe(4);
    const opt = equipOption(game);
    expect(opt?.fields.find((f) => f.name === "equipmentId")?.options).toEqual(["cutlass2"]); // the attached one's Equip text is inactive (718.2)
    expect(opt?.fields.find((f) => f.name === "unitId")?.options).toEqual(["boy"]);
  });
});
