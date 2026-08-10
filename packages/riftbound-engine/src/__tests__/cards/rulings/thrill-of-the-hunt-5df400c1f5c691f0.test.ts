/**
 * Ruling 5df400c1f5c691f0 — Thrill of the Hunt (UNL-184 → unl-184-219) · Reaction [2][fury]
 *     "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *   × Akshan, Mischievous (SFD-109 → sfd-109-221) · 4 (+[body][body]) · 4 Might
 *     "…When you play me, if you paid the additional cost, move an enemy gear to your base. You control it until I
 *      leave the board. If it's an Equipment, attach it to me."
 *
 * Q: Does my opponent's (stolen) weapon get returned if I Thrill of the Hunt my Akshan?
 * A: It is not "returned" (no zone change to hand/trash) — but banishing Akshan makes him leave the board, so his
 *    "until I leave the board" control effect ends and control of the gear reverts to the opponent. The replayed
 *    Akshan is a new object and does not get it back; P1 can no longer use it.
 * Rules: 390.4 / 477.1.a (durational control change ends), 124 (new object after zone change), 719.5 (wearer leaves
 *        → Equipment detaches, stays on the board), 457.1 / 323.7 (loose gear recalled to its controller's base).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL = "unl-184-219";
const AKSHAN = "sfd-109-221";
const DORANS_BLADE = "sfd-095-221"; // Equipment, +2 Might

/**
 * P1's turn. P1 holds bf1 (Sentry there). P2's Doran's Blade sits loose in P2's base. P1: Akshan + Thrill in hand,
 * 4 + 2 energy, [body][body] for Akshan's extra cost and [fury] for Thrill.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 2, fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .card("blade", { def: DORANS_BLADE, owner: P2, zone: "base" })
    .hand(P1, AKSHAN, "akshan")
    .hand(P1, THRILL, "thrill");
}

/** P1 plays Akshan paying [body][body]; his trigger steals + attaches P2's Blade. */
async function akshanWearsStolenBlade(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0, fury: 1 } });
  const r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.seat === P1) {
    await game.p1.pick("blade");
    await game.settle();
  }
  expect(game.state("blade")).toMatchObject({ attachedTo: "akshan", controller: P1, owner: P2 });
  expect(game.state("akshan")).toMatchObject({ attachments: ["blade"], might: 6, zone: "base" });
  expect(game.p1.gear()).toEqual(["blade"]);
  return game;
}

/** P1 Thrills Akshan: banished, then replayed by his owner (P1) to bf1 for free. */
async function thrillAkshan(game: Game): Promise<void> {
  await game.p1.cast("thrill", { targets: "akshan" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, fury: 0 } });
  const r = await game.settle();
  expect(r.decision).toMatchObject({ kind: "pick", seat: P1 });
  expect(game.zoneOf("akshan")).toBe("banishment");
  await game.p1.pick("battlefield-bf1");
  // Any "you may pay the additional cost" offer on the free replay is declined (P1 has no [body] left anyway).
  game.script(P1, [(d) => (d.kind === "yes-no" ? false : undefined)]);
  await game.settle();
  expect(game.zoneOf("thrill")).toBe("trash");
  expect(game.zoneOf("akshan")).toBe("battlefield-bf1");
}

describe("Ruling 5df400c1f5c691f0 — Thrill of the Hunt on Akshan ends his control of the stolen gear", () => {
  test("mid-resolution: the moment Akshan is banished he has left the board — the Blade is already back under P2's control and no longer attached to him", async () => {
    const game = await akshanWearsStolenBlade();
    await game.p1.cast("thrill", { targets: "akshan" });
    const r = await game.settle();
    expect(r.decision).toMatchObject({ kind: "pick", seat: P1 }); // owner picks the battlefield
    expect(game.zoneOf("akshan")).toBe("banishment");
    expect(game.state("blade").controller).toBe(P2);
    expect(game.state("blade").owner).toBe(P2);
    expect(game.state("blade").attachedTo).toBeUndefined();
  });

  test("after Thrill resolves: Akshan is replayed to bf1 as a NEW 4-Might object with nothing attached; the Blade is P2's again — not in anyone's hand or trash, still on the board", async () => {
    const game = await akshanWearsStolenBlade();
    await thrillAkshan(game);
    expect(game.state("akshan")).toMatchObject({ attachments: [], baseMight: 4, might: 4, zone: "battlefield-bf1" });
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, controller: P2, owner: P2 });
    // "Not returned": no zone change to hand / trash / banishment.
    expect(game.p2.hand()).not.toContain("blade");
    expect(game.p2.trash()).not.toContain("blade");
    expect(game.p1.trash()).not.toContain("blade");
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.state("blade").location).toBe("base");
    // P1 lost it; P2 has it.
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual(["blade"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("P1 can no longer use the Blade; on P2's turn P2 (its controller again) may [Equip] it to P2's own unit", async () => {
    const game = await akshanWearsStolenBlade();
    await thrillAkshan(game);
    await game.p1.do("addResources", { power: { body: 1 } });
    const p1Equips = game.p1
      .legal()
      .filter((o) => o.moveId === "equipCard")
      .flatMap((o) => o.variants)
      .filter((v) => v.params.equipmentId === "blade");
    expect(p1Equips).toEqual([]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { power: { body: 1 } });
    const p2EquipUnits = game.p2
      .legal()
      .filter((o) => o.moveId === "equipCard")
      .flatMap((o) => o.variants)
      .filter((v) => v.params.equipmentId === "blade")
      .map((v) => v.params.unitId);
    expect(p2EquipUnits).toEqual(["guard"]);
  });
});
