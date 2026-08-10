/**
 * Ruling 07c4083aee2eb44a — Rune Prison (OGN-050 → ogn-050-298) · [Action] · 2+[calm] · "Stun a unit. (It doesn't deal combat damage this turn.)"
 *
 * Q: When is an attacker recalled, and how is combat damage resolved against several defenders?
 * A: An attacker is recalled only when it SURVIVES but fails to clear the defenders — typically because something (a stun such as Rune Prison)
 *    stopped it dealing combat damage. Against several defenders its damage is assigned sequentially: lethal to one defender, the remainder to
 *    the next, until defenders or Might run out. Kill them all and survive → take the battlefield; Might exactly equal to the defenders' total →
 *    everything dies; kill some but die to the return damage → simply dead (recall is not about "leftover Might").
 * Rules: 465.2.c (assignment: lethal before moving on), 466.1.a.2 (defenders remain → surviving attackers recalled), 466.5 (control), 423.1.b
 *        (stunned units deal no combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUNE_PRISON = "ogn-050-298";

/** P1's Attacker (`atk` Might) in base; P2 holds bf1 with defenders of the given Mights (d0, d1, …). */
function board(atk: number, defenders: readonly number[]) {
  let b = scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: atk, name: "Attacker" }, "atk");
  defenders.forEach((m, i) => {
    b = b.unit(P2, "bf1", { might: m, name: `Defender ${i}` }, `d${i}`);
  });
  return b;
}

/** Attack bf1, both pass Focus, and resolve combat — answering P1's damage assignment (if asked) with `alloc`, else the engine default. Returns the assignment prompt if one appeared. */
async function attack(game: Game, alloc?: Record<string, number>): Promise<Extract<Decision, { kind: "distribute" }> | undefined> {
  await game.p1.move("atk", "bf1");
  let dist: Extract<Decision, { kind: "distribute" }> | undefined;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.context === "showdown") {
      await game.seat(d.seat).passFocus();
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "distribute") {
      dist = d;
      await game.seat(d.seat).distribute(alloc ?? (d.defaultAllocation as Record<string, number>));
    } else {
      break;
    }
  }
  await game.settle();
  return dist;
}

describe("Ruling 07c4083aee2eb44a — recall vs death, and sequential damage through multiple defenders", () => {
  test("Attacker 4 into 3 + 3: P1 (the attacker) assigns its 4 — lethal 3 to the first defender, the 1 left over carries to the next; one defender dies, the other takes 1; the 6 coming back KILLS the attacker — it is not 'recalled with leftover Might'", async () => {
    const game = await board(4, [3, 3]).build();
    const dist = await attack(game, { d0: 3, d1: 1 });
    expect(dist).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
    expect(dist?.buckets.map((b) => ({ card: b.card, lethal: b.lethal }))).toEqual([
      { card: "d0", lethal: 3 },
      { card: "d1", lethal: 3 },
    ]);
    expect(game.zoneOf("d0")).toBe("trash");
    expect(game.state("d1")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // took 1, healed after combat
    expect(game.zoneOf("atk")).toBe("trash"); // dead, not recalled
    expect(game.p1.base()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("Attacker 7 into 3 + 3: kills the first, the remaining 4 kills the second; it survives the 6 back (7 > 6) → all defenders dead with Might to spare → P1 takes the battlefield and scores", async () => {
    const game = await board(7, [3, 3]).build();
    await attack(game);
    expect(game.zoneOf("d0")).toBe("trash");
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.state("atk")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("Attacker's Might EXACTLY equals the defenders' total (5 into 2 + 3): both defenders die and so does the attacker — everybody kills each other, the battlefield is left uncontrolled", async () => {
    const game = await board(5, [2, 3]).build();
    await attack(game);
    expect(game.zoneOf("d0")).toBe("trash");
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("RECALL proper — Rune Prison: P2 stuns the 7-Might attacker in the showdown; it deals NO combat damage, survives the lone 3-Might defender's hit, fails to clear it → recalled to base; defender unharmed, P2 keeps bf1", async () => {
    const game = await board(7, [3]).hand(P2, RUNE_PRISON, "prison").resources(P2, { energy: 2, power: { calm: 1 } }).build();
    await game.p1.move("atk", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "prison")).toBe(true);
    await game.p2.cast("prison", { targets: "atk" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("atk").isStunned).toBe(true);
    await game.settle();
    expect(game.zoneOf("atk")).toBe("base"); // recalled, alive
    expect(game.state("atk").damage).toBe(0);
    expect(game.state("d0")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast without the stun: the same 7 into a lone 3 just kills it and conquers — recall only happens when the attacker can't finish the job", async () => {
    const game = await board(7, [3]).build();
    await attack(game);
    expect(game.zoneOf("d0")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("and an attacker that is simply outclassed (3 into 5) is not recalled either — it dies", async () => {
    const game = await board(3, [5]).build();
    await attack(game);
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("d0")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
