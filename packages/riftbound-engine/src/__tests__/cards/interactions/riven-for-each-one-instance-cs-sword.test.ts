/**
 * Interaction: Riven, Shattered (ven-041-166) · Champion Unit · Calm · 3+[calm] · 3 Might
 *     "[Weaponmaster] … When I attack, choose an enemy unit here. Deal 2 to it for each Equipment attached to me."
 *   × Long Sword (sfd-022-221) · Equipment · Fury · 2+[fury] · +2 Might
 *     "[Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.) [Equip] [fury]"
 *   × Counter Strike (sfd-194-221) · Spell · Calm/Body · 2+[rainbow] · Reaction
 *     "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *
 * Question. P1's Riven (3) has one Long Sword attached (5) and P1 holds a second Long Sword with exactly [2]+[fury].
 * P2's vanilla V (6) holds bf1. Riven attacks bf1; "When I attack" goes on the chain choosing V.
 *   (a) Before it resolves P1 Quick-Draws the second Long Sword onto Riven: is the Equipment count read when the
 *       trigger was put on the chain (1 → 2 damage) or when it resolves (2 → 4)? Is "Deal 2 for each Equipment"
 *       ONE instance of 2N or N instances of 2? Combat result?
 *   (b) Variant: Riven already carries two Long Swords; P2 responds with ONE Counter Strike on V — does it prevent
 *       only "the first 2" or the whole 4? Combat result? (Contrast: a Counter Strike NOT spent by the trigger blanks
 *       V's whole simultaneous combat damage instead.)
 *
 * Rules: 359.3.f.2 (referent information — "for each Equipment attached to me" — is read when the instruction
 * EXECUTES; the target was fixed at finalization), 715.4 ("Deal X … for each" is one deal action with one total,
 * cf. Teemo, Strategist), 437.1.b.2 / 437.4 / 437.7 (Prevent applies to the NEXT damage instance, all of it; fully
 * prevented damage was never dealt; a single-instance Prevent is then spent), 465.2.c / 465.2.c.1.a (combat damage
 * is assigned then dealt simultaneously), 428.5.c.2 (combat-cleanup kills are attributed to the combat damage
 * sources), 819 (Quick-Draw: [Reaction] gear, attaches on play with no chain item of its own).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIVEN = "ven-041-166";
const LONG_SWORD = "sfd-022-221";
const COUNTER_STRIKE = "sfd-194-221";

/** (a) P1 to act: Riven + one attached Long Sword in base, a second Long Sword in hand with exactly [2]+[fury]; V (6) at P2's bf1. */
function oneSwordBoard() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RIVEN, "riven", { equippedWith: ["sword1"] })
    .card("sword1", { def: LONG_SWORD, meta: { attachedTo: "riven" }, owner: P1, zone: "base" })
    .hand(P1, LONG_SWORD, "sword2")
    .unit(P2, "bf1", { might: 6, name: "Vanilla V" }, "v")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander");
}

/** (b) Riven already carries two Long Swords (7); P2 holds Counter Strike with exactly [2]+1 power. */
function twoSwordBoard() {
  return scenario()
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RIVEN, "riven", { equippedWith: ["sword1", "sword2"] })
    .card("sword1", { def: LONG_SWORD, meta: { attachedTo: "riven" }, owner: P1, zone: "base" })
    .card("sword2", { def: LONG_SWORD, meta: { attachedTo: "riven" }, owner: P1, zone: "base" })
    .unit(P2, "bf1", { might: 6, name: "Vanilla V" }, "v")
    .hand(P2, COUNTER_STRIKE, "cs");
}

/** Pass priority around until the chain is empty. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.acting().pass();
  }
}

describe("Riven, Shattered — 'Deal 2 for each Equipment' is ONE instance counted at resolution (× Quick-Draw Long Sword, × Counter Strike)", () => {
  // ── (a) Quick-Draw a second sword in response to Riven's own attack trigger ─────────────────────

  test("(a) setup + attack: Riven is 3+2 = 5 with one sword; moving into bf1 puts 'When I attack' on the chain already naming V (the only enemy unit here) and the attached sword travels with her", async () => {
    const game = await oneSwordBoard().build();
    expect(game.state("riven")).toMatchObject({ attachments: ["sword1"], might: 5 });
    await game.p1.move("riven", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "riven", controller: P1, targets: ["v"], triggered: true })]);
    expect(game.zoneOf("sword1")).toBe("battlefield-bf1");
    expect(game.state("sword1").attachedTo).toBe("riven");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) with the trigger pending P1 may play the second Long Sword at Reaction speed (Quick-Draw): it costs [2]+[fury], attaches to Riven at once (7 Might, two attachments) and adds nothing to the chain", async () => {
    const game = await oneSwordBoard().build();
    await game.p1.move("riven", "bf1");
    expect(game.p1.can("play", "sword2")).toBe(true);
    await game.p1.play("sword2", { answers: ["riven"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("riven");
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("sword2").attachedTo).toBe("riven");
    expect(game.state("riven")).toMatchObject({ attachments: ["sword1", "sword2"], might: 7 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["riven"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(a) the Equipment count is read when the trigger RESOLVES (359.3.f.2): with the second sword attached in response V is dealt 4, not 2 — nothing else is touched", async () => {
    const game = await oneSwordBoard().build();
    await game.p1.move("riven", "bf1");
    await game.p1.play("sword2", { answers: ["riven"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("riven");
    }
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("v")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.state("bystander").damage).toBe(0);
    expect(game.state("riven").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(a) control: WITHOUT the response the same trigger deals only 2 (one Equipment at resolution)", async () => {
    const game = await oneSwordBoard().build();
    await game.p1.move("riven", "bf1");
    await drainChain(game);
    expect(game.state("v").damage).toBe(2);
  });

  test("(a) combat: Riven 7 vs V 6 (already 4/6) — V dies in the combat Cleanup, the 7-Might Riven takes 6 and survives, P1 conquers bf1 (+1 point)", async () => {
    const game = await oneSwordBoard().build();
    await game.p1.move("riven", "bf1");
    await game.p1.play("sword2", { answers: ["riven"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("riven");
    }
    await drainChain(game);
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.zoneOf("riven")).toBe("battlefield-bf1");
    expect(game.state("riven")).toMatchObject({ attachments: ["sword1", "sword2"], might: 7 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) one Counter Strike vs "Deal 2 for each Equipment" with two swords ────────────────────────

  test("(b) P2 responds to the trigger with Counter Strike on V ([2]+1 power); it resolves first (LIFO): P2 draws 1 and V carries a next-instance prevention", async () => {
    const game = await twoSwordBoard().build();
    expect(game.state("riven").might).toBe(7);
    await game.p1.move("riven", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "riven", targets: ["v"], triggered: true })]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "cs")).toBe(true);
    const hand0 = game.p2.hand().length; // includes cs
    await game.p2.cast("cs", { targets: "v" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["riven", "cs"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Counter Strike resolves
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["riven"]);
    expect(game.state("v").meta).toMatchObject({ preventNextDamageInstance: true });
  });

  test("(b) 'Deal 2 for each Equipment' is ONE damage instance of 4: the single Counter Strike prevents ALL of it (437.1.b.2 / 437.4) — V takes 0, not 2 — and the prevention is spent", async () => {
    const game = await twoSwordBoard().build();
    await game.p1.move("riven", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("cs", { targets: "v" });
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("v")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("v").meta).toMatchObject({ preventNextDamageInstance: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("(b) combat with the Counter Strike already spent: V (0/6) is dealt Riven's 7 and dies; Riven takes 6 < 7 and survives; P1 conquers bf1 (+1)", async () => {
    const game = await twoSwordBoard().build();
    await game.p1.move("riven", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("cs", { targets: "v" });
    await drainChain(game);
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.zoneOf("riven")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast — Counter Strike cast on V only AFTER the trigger resolved (V at 4/6): the unspent prevention blanks V's whole simultaneous combat damage (7 → 0), V holds, Riven takes 6 < 7, survives and is recalled; no conquer, no point", async () => {
    const game = await twoSwordBoard().build();
    await game.p1.move("riven", "bf1");
    await drainChain(game); // trigger resolves unopposed
    expect(game.state("v").damage).toBe(4);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("cs", { targets: "v" });
    await drainChain(game);
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("v")).toBe("battlefield-bf1");
    expect(game.zoneOf("riven")).toBe("base");
    expect(game.state("riven")).toMatchObject({ attachments: ["sword1", "sword2"], might: 7 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
