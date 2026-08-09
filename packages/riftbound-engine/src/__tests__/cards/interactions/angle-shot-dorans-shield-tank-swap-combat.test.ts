/**
 * Interaction: Angle Shot (sfd-011-221, Fury Reaction spell, 2)
 *     "Choose a unit and an Equipment with the same controller. Attach that Equipment to that unit
 *      or detach that Equipment from that unit. Draw 1."
 *   × Doran's Shield (sfd-033-221, Calm Equipment, +1 Might, Effect Text: [Tank])
 *   with two inline defenders A (2 Might, wearing the Shield) and B (4 Might, bare) at P1's bf1 and
 *   an inline 5-Might Raider attacking for P2.
 *
 * Question: P2 attacks bf1.
 *   (a) Before any reaction, how must P2 assign the Raider's 5 combat damage?
 *   (b) During the combat showdown P1 Angle-Shots (B, Doran's Shield) — ATTACH mode. What are A and B
 *       now, and how must P2 assign at the damage step?
 *   (c) Instead P1 Angle-Shots (A, Doran's Shield) — DETACH mode. Does anyone have Tank, and where is
 *       the Shield afterwards?
 *
 * Rules: 815.1.b / 465.2.c.6 (Tank: lethal damage to me before any same-side non-Tank unit),
 * 465.2.c.3 / 465.2.c.4 (lethal in full to one unit before the next; no overkill while another unit is
 * unassigned), 434.1.f (attaching to a new unit detaches from the old one), 435.1.d / 435.1.e (the old
 * wearer loses the Effect Text keyword and the Might bonus), 718.3 / 718.4 (the new wearer gains them),
 * 435.4 / 435.4.a / 457.1 / 323.7 (a detached Equipment is at its former wearer's location and is
 * Recalled to its controller's base at the next Cleanup — not destroyed), 724 (Effect Text is Inactive
 * while unattached), 319.5 (a Cleanup follows the spell leaving the chain).
 *
 * Expected: (a) A = 3 with Tank → forced {A: 3 lethal, B: 2}: A dies, B lives (healed), the defenders'
 * 7 kill the Raider. (b) Angle Shot resolves mid-showdown: Shield hops to B; A = 2 no Tank, B = 5 with
 * Tank; P1 draws 1; the assignment flips to {B: 5, A: 0}: B dies, A untouched, Raider still dies to 7.
 * (c) Nobody has Tank; A = 2, B = 4 (total 6, Raider still dies); P2 now has a genuine choice of which
 * defender takes lethal first; the Shield is unattached, still P1's, on the board in P1's base (recalled
 * by the cleanup after the spell resolved), never in the trash.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANGLE_SHOT = "sfd-011-221";
const DORANS_SHIELD = "sfd-033-221";

/** P2's turn. P1 holds bf1 with A (2, wearing Doran's Shield) and B (4). P2's 5-Might Raider in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2 }) // exactly Angle Shot
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Unit A" }, "A", { equippedWith: ["shield"] } as Record<string, unknown>)
    .card("shield", { def: DORANS_SHIELD, meta: { attachedTo: "A" } as Record<string, unknown>, owner: P1, zone: "bf1" })
    .unit(P1, "bf1", { might: 4, name: "Unit B" }, "B")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, ANGLE_SHOT, "shot");
}

/** Combat damage records dealt to `target` (public damageLog). */
function dealt(game: Game, target: string) {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target);
}

/** Pass focus/priority for whoever holds it until a non-pass decision (distribute) or the open main phase. */
async function toAssignmentOrEnd(game: Game) {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return d;
    }
    await game.acting().pass();
  }
  return game.decision();
}

/** P2 attacks, passes Focus; P1 casts Angle Shot on (unit, shield) and both pass so it resolves mid-showdown. */
async function attackAndAngleShot(game: Game, unit: "A" | "B"): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.p1.can("cast", "shot")).toBe(true);
  await game.p1.cast("shot", { targets: [unit, "shield"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shot", controller: P1, targets: [unit, "shield"] })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("shot")).toBe("trash");
  expect(game.chain()).toHaveLength(0);
}

describe("Angle Shot × Doran's Shield — swapping [Tank] between defenders mid-combat", () => {
  test("setup: A wears the Shield at bf1 → 3 Might with Tank; B is a bare 4; the Shield is at bf1 with A (434.4)", async () => {
    const game = await board().build();
    expect(game.state("A")).toMatchObject({ attachments: ["shield"], baseMight: 2, might: 3 });
    expect(game.state("A").keywords).toContain("Tank");
    expect(game.state("B")).toMatchObject({ attachments: [], might: 4 });
    expect(game.state("B").keywords).not.toContain("Tank");
    expect(game.state("shield").attachedTo).toBe("A");
    expect(game.locationOf("shield")).toBe("bf1");
  });

  test("(a) no reaction: Tank forces {A: 3 lethal first, B: 2} (815.1.b/465.2.c.6) — either no choice is offered or {B: 4, A: 1} is refused; A dies, B survives healed, the 7 back kills the Raider", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    const d = await toAssignmentOrEnd(game);
    if (d?.kind === "distribute" && d.seat === P2) {
      expect(d.total).toBe(5);
      expect(d.buckets.find((b) => b.key === "A")?.lethal).toBe(3);
      expect((await game.p2.try((p) => p.distribute({ A: 1, B: 4 }))).ok).toBe(false); // B before the Tank
      expect((await game.p2.try((p) => p.distribute({ A: 5, B: 0 }))).ok).toBe(false); // overkill on A while B unassigned
      await game.p2.distribute({ A: 3, B: 2 });
    } else {
      expect(d?.kind === "distribute" && d.seat === P2).toBe(false);
    }
    await game.settle();
    expect(dealt(game, "A").reduce((s, r) => s + r.amount, 0)).toBe(3);
    expect(dealt(game, "B").reduce((s, r) => s + r.amount, 0)).toBe(2);
    expect(dealt(game, "raider").reduce((s, r) => s + r.amount, 0)).toBe(7); // 3 + 4
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("B")).toBe("battlefield-bf1");
    expect(game.state("B").damage).toBe(0);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // A died wearing the Shield → it detaches and is recalled to P1's base, not trashed (457.1).
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.state("shield")).toMatchObject({ attachedTo: undefined, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) Angle Shot only offers same-controller pairs: (A, Shield) and (B, Shield) — never the enemy Raider with P1's Shield", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    const field = game.p1.option("cast", "shot")?.fields.find((f) => f.name === "targets");
    const pairs = (field?.options ?? []).map((o) => (o as string[]).join("+")).sort();
    expect(pairs).toEqual(["A+shield", "B+shield"]);
    await expect(game.p1.cast("shot", { targets: ["raider", "shield"] })).rejects.toThrow();
  });

  test("(b) attach mode on (B, Shield) resolves mid-showdown: the Shield hops A → B (434.1.f); A = 2 without Tank (435.1.d/e), B = 5 with Tank (718.3/718.4); P1 drew 1 and spent 2", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length; // includes Angle Shot
    await attackAndAngleShot(game, "B");
    expect(game.state("shield").attachedTo).toBe("B");
    expect(game.locationOf("shield")).toBe("bf1");
    expect(game.state("A")).toMatchObject({ attachments: [], might: 2 });
    expect(game.state("A").keywords).not.toContain("Tank");
    expect(game.state("B")).toMatchObject({ attachments: ["shield"], baseMight: 4, might: 5 });
    expect(game.state("B").keywords).toContain("Tank");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
    expect(game.p1.energy()).toBe(0);
    // Still in the combat showdown — no damage has been dealt yet.
    expect(dealt(game, "A")).toEqual([]);
    expect(dealt(game, "B")).toEqual([]);
    expect(game.state("raider").combatRole).toBe("attacker");
  });

  test("(b) at the damage step Tank is re-evaluated: forced {B: 5 lethal first, A: 0} — B dies, A is untouched, the defenders' 2 + 5 = 7 still kills the Raider; the Shield is recalled to base", async () => {
    const game = await board().build();
    await attackAndAngleShot(game, "B");
    const d = await toAssignmentOrEnd(game);
    if (d?.kind === "distribute" && d.seat === P2) {
      expect(d.total).toBe(5);
      expect(d.buckets.find((b) => b.key === "B")?.lethal).toBe(5);
      expect((await game.p2.try((p) => p.distribute({ A: 2, B: 3 }))).ok).toBe(false); // A before the (new) Tank
      expect((await game.p2.try((p) => p.distribute({ A: 3, B: 2 }))).ok).toBe(false);
      await game.p2.distribute({ A: 0, B: 5 });
    } else {
      expect(d?.kind === "distribute" && d.seat === P2).toBe(false);
    }
    await game.settle();
    expect(dealt(game, "B").reduce((s, r) => s + r.amount, 0)).toBe(5);
    expect(dealt(game, "A").reduce((s, r) => s + r.amount, 0)).toBe(0);
    expect(dealt(game, "raider").reduce((s, r) => s + r.amount, 0)).toBe(7);
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.state("A")).toMatchObject({ damage: 0, might: 2 });
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.state("shield")).toMatchObject({ attachedTo: undefined, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) detach mode on (A, Shield): nobody has Tank — A = 2, B = 4; the Shield is unattached, still P1's, on the board (recalled to P1's base by the post-resolution Cleanup, 435.4.a/457.1/319.5) and NOT in the trash", async () => {
    const game = await board().build();
    await attackAndAngleShot(game, "A");
    expect(game.state("shield")).toMatchObject({ attachedTo: undefined, controller: P1, owner: P1 });
    expect(game.zoneOf("shield")).not.toBe("trash");
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.locationOf("shield")).toBe("base");
    expect(game.state("A")).toMatchObject({ attachments: [], might: 2 });
    expect(game.state("B")).toMatchObject({ attachments: [], might: 4 });
    expect(game.state("A").keywords).not.toContain("Tank");
    expect(game.state("B").keywords).not.toContain("Tank");
    expect(game.state("raider").keywords).not.toContain("Tank");
    // 724: unattached, its [Tank] Effect Text is inactive — the Shield itself carries only [Equip].
    expect(game.state("shield").keywords).toEqual(["Equip"]);
    expect(game.p1.hand()).toHaveLength(1); // drew 1
  });

  test("(c) with no Tank P2 gets a real assignment choice (lethal A: 2, B: 4); choosing {B: 4, A: 1} is legal → B dies, A survives healed; 2 + 4 = 6 still kills the Raider; the Shield stays in P1's base after combat", async () => {
    const game = await board().build();
    await attackAndAngleShot(game, "A");
    const d = await toAssignmentOrEnd(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 5 });
    if (d?.kind !== "distribute") {
      return;
    }
    expect(d.buckets.map((b) => [b.key, b.lethal]).sort()).toEqual([
      ["A", 2],
      ["B", 4],
    ]);
    expect((await game.p2.try((p) => p.distribute({ A: 1, B: 1 }))).ok).toBe(false); // 465.2.c.3: nobody lethal
    await game.p2.distribute({ A: 1, B: 4 }); // B first is now fine — no Tank anywhere
    await game.settle();
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.state("A").damage).toBe(0);
    expect(dealt(game, "raider").reduce((s, r) => s + r.amount, 0)).toBe(6);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.state("shield")).toMatchObject({ attachedTo: undefined, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) the other order {A: 2, B: 3} is equally legal without Tank → A dies, B survives", async () => {
    const game = await board().build();
    await attackAndAngleShot(game, "A");
    const d = await toAssignmentOrEnd(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P2 });
    await game.p2.distribute({ A: 2, B: 3 });
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("B")).toBe("battlefield-bf1");
    expect(game.state("B").damage).toBe(0);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("shield")).toBe("base");
  });
});
