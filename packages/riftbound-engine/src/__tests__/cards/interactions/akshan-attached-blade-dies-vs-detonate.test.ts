/**
 * Interaction: Akshan, Mischievous (sfd-109-221) · Champion Unit · Body · 4 (+ optional [body][body]) · 4 Might
 *     "[Weaponmaster] / You may pay [body][body] as an additional cost to play me. / When you play me, if
 *      you paid the additional cost, move an enemy gear to your base. You control it until I leave the
 *      board. If it's an Equipment, attach it to me."
 *   × Doran's Blade (sfd-095-221) · Equipment · Body · 2 · +2 Might · "[Equip] [body]"
 *   × Detonate (sfd-005-221) · Spell · Fury · 1 + [fury] · "Kill a gear. Its controller draws 2."
 *
 * Question: P2's vanilla U (3) at battlefield B wears P2's Doran's Blade (+2 → 5). P1 plays Akshan to base
 * paying the extra [body][body] and picks the ATTACHED Blade.
 *   (a) Is an Equipment already attached to an enemy unit a legal "enemy gear"? U's / Akshan's Might
 *       afterwards, and who controls / owns the Blade?
 *   (b) Later Akshan (6) attacks alone and dies in combat at a battlefield. Does the Blade go to a trash?
 *       If not, where does it end up, under whose control, and can P2 re-Equip it?
 *   (c) Instead: on P2's turn P2 Detonates the Blade sitting on Akshan — legal? whose trash, who draws?
 *   (d) Contrast: P1 Detonates the borrowed Blade itself — whose trash, who draws?
 *
 * Rules: 718.5.a/b (an attached card is still a gear on the board and may be chosen), 740.1.b (enemy =
 * opposing controller), 390.4 + 477.1.a ("until I leave the board" control change; controller is a
 * layer-1 trait), 434.1.f / 434.4 (attaching to a new Top-Most card detaches it from the old one; the
 * relocation is via Attach, not a Move), 435.1.e (detach ends the Might bonus at once), 718.4 (bonus
 * modulates the wearer), 719.5 (Top-Most card board→trash: attachments Detach and stay where they are),
 * 457.1 / 323.7 (unattached gear at a battlefield / permanent in the wrong base is Recalled to its
 * CONTROLLER's base at the next Cleanup), 435.1.c (printed [Equip] active again once unattached),
 * 428.2 + 056.2 / 127.1 (killed → OWNER's trash), 359.3.e.14 ("its controller" = the killed gear's
 * controller at that time).
 *
 * Expected: (a) Yes. Blade → controlled by P1 (owner P2), attached to Akshan in P1's base; U 3, Akshan 6.
 * (b) No trash for the Blade: Akshan → P1's trash; the Blade detaches, control reverts to P2, and it is
 * recalled to P2's base unattached; P2 may [Equip] it again on P2's turn. (c) Legal; Blade → P2's trash
 * (owner); P1 — its controller — draws 2; Akshan back to 4. (d) Same trash (P2's), and P1 draws 2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const DORANS_BLADE = "sfd-095-221";
const DETONATE = "sfd-005-221";

/**
 * P1's turn 2. bfB (P2's): P2's U (3) wearing P2's Doran's Blade → 5. bfC (P2's): P2's Wall (7) — big
 * enough to kill a 6-Might Akshan. P2 also has an unattached Trinket in base (so Akshan's pick is a real
 * choice). P1: Akshan + Detonate in hand, 4+1 energy, [body][body] + [fury]. P2 holds a Detonate too.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 2, fury: 1 } })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: P2 })
    .unit(P2, "bfB", { might: 3, name: "Unit U" }, "U", { equippedWith: ["blade"] })
    .card("blade", { def: DORANS_BLADE, meta: { attachedTo: "U" }, owner: P2, zone: "bfB" })
    .unit(P2, "bfC", { might: 7, name: "Wall" }, "wall")
    .gear(P2, { cardType: "gear", name: "Trinket" }, "trinket")
    .hand(P1, AKSHAN, "akshan")
    .hand(P1, DETONATE, "detP1")
    .hand(P2, DETONATE, "detP2");
}

/** P1 plays Akshan paying [body][body]; the play trigger resolves and P1 picks the attached Blade. */
async function stolen(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0, fury: 1 } });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  await game.p1.pick("blade");
  await game.settle();
  expect(game.state("blade").controller).toBe(P1);
  return game;
}

const castTargets = (game: Game, seat: "p1" | "p2", alias: string) =>
  (game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];

describe("Akshan × attached Doran's Blade × Detonate — stealing a worn Equipment, then losing it two ways", () => {
  // ---- (a) stealing an ATTACHED equipment ------------------------------------------------------------

  test("(a) setup: before Akshan, U wears P2's Blade at bfB and is 3 + 2 = 5", async () => {
    const game = await board().build();
    expect(game.state("U")).toMatchObject({ attachments: ["blade"], baseMight: 3, controller: P2, might: 5 });
    expect(game.state("blade")).toMatchObject({ attachedTo: "U", controller: P2, owner: P2, zone: "battlefield-bfB" });
  });

  test("(a) Akshan's trigger offers the ATTACHED Blade alongside the loose Trinket — an attached Equipment is still 'an enemy gear' on the board (718.5.a/b, 740.1.b); P2's units are not offered", async () => {
    const game = await board().build();
    await game.p1.play("akshan", { payOptional: true, to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akshan", controller: P1, triggered: true })]);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect((d as { options: { card?: string }[] }).options.map((o) => o.card).sort()).toEqual(["blade", "trinket"]);
  });

  test("(a) picking it: the Blade is now controlled by P1 (owner still P2), sits in P1's base ATTACHED TO AKSHAN — detached from U (434.1.f): U drops to 3 at once (435.1.e), Akshan is 4 + 2 = 6 (718.4)", async () => {
    const game = await stolen();
    expect(game.state("blade")).toMatchObject({ attachedTo: "akshan", controller: P1, location: "base", owner: P2, zone: "base" });
    expect(game.state("akshan")).toMatchObject({ attachments: ["blade"], baseMight: 4, controller: P1, location: "base", might: 6 });
    expect(game.state("U")).toMatchObject({ attachments: [], location: "bfB", might: 3 });
    expect(game.p1.gear()).toEqual(["blade"]);
    expect(game.p2.gear()).toEqual(["trinket"]);
    expect(game.zoneOf("blade")).not.toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) Akshan dies in combat wearing it ---------------------------------------------------------

  /** Around to P1's next turn (Akshan readies), then Akshan (6) attacks P2's Wall (7) at bfC alone and dies. */
  async function akshanDiesAtBfC(): Promise<Game> {
    const game = await stolen();
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.state("akshan")).toMatchObject({ isReady: true, might: 6 });
    expect(game.state("blade")).toMatchObject({ attachedTo: "akshan", controller: P1 });
    await game.p1.move("akshan", "bfC");
    expect(game.zoneOf("blade")).toBe("battlefield-bfC"); // rides along with its wearer (719.3.a)
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("akshan")).toBe("trash");
    return game;
  }

  test("(b) Akshan (6) into the Wall (7): Akshan is killed → P1's trash; the Wall survives 6; P2 keeps bfC", async () => {
    const game = await akshanDiesAtBfC();
    expect(game.p1.trash()).toContain("akshan");
    expect(game.state("wall")).toMatchObject({ location: "bfC", zone: "battlefield-bfC" });
    expect(game.gameState.battlefields.bfC?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("(b) the Blade does NOT go to any trash: it Detaches when its wearer leaves the board (719.5), 'until I leave the board' ends so control reverts to P2, and the loose gear at bfC is recalled to its CONTROLLER's — P2's — base at cleanup (457.1 / 323.7)", async () => {
    const game = await akshanDiesAtBfC();
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.p1.trash()).not.toContain("blade");
    expect(game.p2.trash()).not.toContain("blade");
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, controller: P2, location: "base", owner: P2, zone: "base" });
    expect(game.p2.gear().sort()).toEqual(["blade", "trinket"]);
    expect(game.p2.base()).toContain("blade");
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.base()).not.toContain("blade");
    expect(game.violations()).toEqual([]);
  });

  test("(b) P1 gets nothing further from it: no [Equip] for P1; on P2's turn, with [body] floating, P2's printed [Equip] is active again (435.1.c) and offers P2's own units — re-equipping U makes it 5 again", async () => {
    const game = await akshanDiesAtBfC();
    expect(game.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { power: { body: 1 } });
    const equipUnits = game.p2
      .legal()
      .filter((o) => o.moveId === "equipCard")
      .flatMap((o) => o.variants)
      .filter((v) => v.params.equipmentId === "blade")
      .map((v) => v.params.unitId as string)
      .sort();
    expect(equipUnits).toEqual(["U", "wall"]);
    await game.p2.choose("equipCard", { params: { equipmentId: "blade", unitId: "U" } });
    await game.settle();
    expect(game.p2.power("body")).toBe(0);
    expect(game.state("blade")).toMatchObject({ attachedTo: "U", controller: P2, owner: P2 });
    expect(game.state("U")).toMatchObject({ attachments: ["blade"], might: 5 });
  });

  // ---- (c) P2 Detonates its own stolen Blade on Akshan ------------------------------------------------

  test("(c) on P2's turn Detonate ('a gear', no side restriction) offers the Blade attached to P1's Akshan as well as P2's own Trinket (718.5.b)", async () => {
    const game = await stolen();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1, power: { fury: 1 } });
    expect(castTargets(game, "p2", "detP2").sort()).toEqual(["blade", "trinket"]);
    expect(game.p2.can("cast", "detP2")).toBe(true);
  });

  test("(c) P2 Detonates it: the Blade is killed into its OWNER's trash — P2's (428.2, 056.2) — and 'its controller draws 2' pays out to P1, the controller at that moment (359.3.e.14); P2 draws nothing; Akshan drops to 4 (435.1.e)", async () => {
    const game = await stolen();
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 1, power: { fury: 1 } });
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("detP2", { targets: "blade" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["blade", "detP2"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // spent Detonate, drew 0
    expect(game.state("akshan")).toMatchObject({ attachments: [], location: "base", might: 4, zone: "base" });
    expect(game.p1.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ---- (d) P1 Detonates the borrowed Blade itself ------------------------------------------------------

  test("(d) P1 Detonates the borrowed Blade on P1's own turn: still P2's trash (owner never flips, 127.1), and P1 — its controller — draws 2 (net hand +1 after spending Detonate); Akshan back to 4", async () => {
    const game = await stolen();
    expect(castTargets(game, "p1", "detP1").sort()).toEqual(["blade", "trinket"]);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("detP1", { targets: "blade" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, fury: 0 } });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.trash()).toEqual(["blade"]);
    expect(game.p1.trash()).toEqual(["detP1"]);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 2);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.state("akshan")).toMatchObject({ attachments: [], might: 4 });
    expect(game.state("U").might).toBe(3); // nothing snaps back to the original wearer
    expect(game.violations()).toEqual([]);
  });
});
