/**
 * Ruling 93ae531424c00bc2 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Yasuo, Remorseful (ogn-076-298) · 6 Might "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: When Yasuo attacks Reaver's Row, can the defender move the targeted unit to base before Yasuo's damage resolves?
 * A: Yes. Both "when I attack" and "when you defend" triggers go on the chain, each choosing its target as it is put
 *    there — the attacker (Yasuo) chooses first, then the defender chooses for the Row. LIFO: the Row resolves first and
 *    moves the unit home; Yasuo's ability then finds its target no longer "here" and deals no damage.
 * Rules: 383.4 / 442.1.b.1 (attacker's triggers before defender's), 402.2 (targets chosen at finalization), 338 (LIFO),
 *        359.3.e.5 (an illegal target at resolution is unaffected).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const YASUO_REMORSEFUL = "ogn-076-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P1 holds the live Row with Scout (2) and Wall (7). P2's Yasuo (6) attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "row", { might: 7, name: "Wall" }, "wall")
    .unit(P2, "base", YASUO_REMORSEFUL, "yasuo");
}

/** Yasuo attacks; P2 aims Yasuo's trigger at the Scout; P1 opts in to the Row and names the Scout too. */
async function bothTriggersTargetScout(): Promise<{ game: Game; askedOrder: string[] }> {
  const game = await board().build();
  await game.p2.move("yasuo", "row");
  const askedOrder: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      askedOrder.push("P2:yasuo-target");
      expect((d as PickD).options.map((o) => o.card ?? o.key).sort()).toEqual(["scout", "wall"]);
      await game.p2.pick("scout");
    } else if (d?.kind === "yes-no" && d.seat === P1) {
      askedOrder.push("P1:row-optin");
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      askedOrder.push("P1:row-target");
      expect((d as PickD).options.map((o) => o.card ?? o.key).sort()).toEqual(["scout", "wall"]);
      await game.p1.pick("scout");
    } else {
      break;
    }
  }
  return { askedOrder, game };
}

describe("Ruling 93ae531424c00bc2 — Reaver's Row pulls Yasuo's target home before his damage resolves", () => {
  test("both triggers go on ONE chain with targets chosen up front — the ATTACKER (P2, Yasuo) is asked first, then the defender (P1, Row); Yasuo's item sits below the Row's", async () => {
    const { game, askedOrder } = await bothTriggersTargetScout();
    expect(askedOrder).toEqual(["P2:yasuo-target", "P1:row-optin", "P1:row-target"]);
    const items = game.chain();
    expect(items.map((c) => c.cardId)).toEqual(["yasuo", "row"]);
    expect(items[0]).toMatchObject({ cardId: "yasuo", controller: P2, targets: ["scout"], triggered: true });
    expect(items[1]).toMatchObject({ cardId: "row", controller: P1, targets: ["scout"], triggered: true });
    expect(game.locationOf("scout")).toBe("row");
    expect(game.state("scout").damage).toBe(0);
  });

  test("LIFO: the Row resolves first — the Scout is moved to P1's base while Yasuo's trigger still waits", async () => {
    const { game } = await bothTriggersTargetScout();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("Yasuo's ability then resolves with its target no longer 'here': it deals NO damage — the Scout is untouched in base, nothing is redirected to the Wall", async () => {
    const { game } = await bothTriggersTargetScout();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("wall").damage).toBe(0);
    expect((game.gameState.damageLog ?? []).filter((r) => !r.combat)).toEqual([]);
    // The showdown goes on: Wall (7) still defends against Yasuo (6).
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: had P1 declined the Row, Yasuo's 6 damage would have killed the Scout", async () => {
    const game = await board().build();
    await game.p2.move("yasuo", "row");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick("scout");
      } else if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else {
        break;
      }
    }
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("scout")).toBe("trash");
  });
});
