/**
 * Ruling b6329e889fcd47b9 — Cull the Weak (OGN-209 → ogn-209-298) [2][order] "Each player kills one of their units."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) "When a player chooses a friendly unit here with a spell for the first time
 *   each turn, they draw 1." (Cull sfd-134-221 is a scrape name-collision; irrelevant.)
 *
 * Q: Does Cull the Weak count as "choosing" for the Dreaming Tree?
 * A: No. Cull the Weak does not target — each player picks a unit they control AS IT RESOLVES. The Tree only fires when a
 *    unit there is targeted (chosen at play time) by a spell, so nobody draws.
 * Rules: 355.10.e (each-player choice on resolution is not targeting), 383.4.b.2 (choose-triggers key off targeting).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const DREAMING_TREE = "ogn-292-298";
const DISCIPLINE = "ogn-058-298"; // control: a spell that DOES target

/**
 * P1's turn. bf1 = live Dreaming Tree held by P1 with Dreamer (3) on it; P1 also has a Spare (1) in base so P1's kill is a
 * real choice. P2 has two Grunts in base (P2 must choose too). P1: Cull the Weak + Discipline, [4] + [order].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 1 } })
    .battlefield("bf1", { controller: P1, def: DREAMING_TREE, inert: false })
    .unit(P1, "bf1", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P1, "base", { might: 1, name: "Spare" }, "spare")
    .unit(P2, "base", { might: 2, name: "Grunt A" }, "gruntA")
    .unit(P2, "base", { might: 2, name: "Grunt B" }, "gruntB")
    .hand(P1, CULL_THE_WEAK, "cull")
    .hand(P1, DISCIPLINE, "disc")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

describe("Ruling b6329e889fcd47b9 — Cull the Weak's on-resolution choice is not targeting: no Dreaming Tree draw", () => {
  test("control: Discipline targeting Dreamer at the Tree DOES trigger it (a Tree item joins the chain) and P1 draws", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "dreamer" });
    expect(game.chain().some((c) => c.cardId === "bf1" && c.triggered && c.controller === P1)).toBe(true);
    await game.settle();
    expect(game.p1.hand()).toContain("d1");
  });

  test("casting Cull the Weak asks for NO target and puts nothing but the spell on the chain — no Tree trigger", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "cull")?.fields.find((f) => f.arg === "targets");
    // No unit is offered as a play-time target (an empty set at most).
    expect((targets?.options ?? []).flat()).toEqual([]);
    expect(targets?.max ?? 0).toBe(0);
    await game.p1.cast("cull");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1, triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } });
  });

  test("on resolution EACH player chooses their own unit (P1 picks Dreamer at the Tree, P2 picks Grunt A): both die, and STILL no Tree trigger and no draw for P1", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("cull");
    let stop = await game.settle();
    const choosers: string[] = [];
    for (let i = 0; i < 4 && stop.reason === "unanswered"; i++) {
      const d = game.decision();
      expect(d?.kind).toBe("pick");
      if (d?.kind === "pick" && d.seat === P1) {
        expect(d.options.map((o) => o.key).sort()).toEqual(["dreamer", "spare"]);
        choosers.push(P1);
        await game.p1.pick("dreamer");
      } else if (d?.kind === "pick" && d.seat === P2) {
        expect(d.options.map((o) => o.key).sort()).toEqual(["gruntA", "gruntB"]);
        choosers.push(P2);
        await game.p2.pick("gruntA");
      } else {
        break;
      }
      // Choosing Dreamer during resolution must not have created a Tree trigger.
      expect(game.chain().some((c) => c.cardId === "bf1")).toBe(false);
      stop = await game.settle();
    }
    expect(choosers.sort()).toEqual([P1, P2]);
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("dreamer")).toBe("trash");
    expect(game.zoneOf("gruntA")).toBe("trash");
    expect(game.zoneOf("spare")).toBe("base");
    expect(game.zoneOf("gruntB")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // only the Cull left; nothing drawn
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.violations()).toEqual([]);
  });
});
