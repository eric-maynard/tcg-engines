/**
 * Ruling 0871350c093d142a — Anivia, Primal (OGN-148 → ogn-148-298) · 8 Might · "When I attack, deal 3 to all
 *   enemy units here."  × Warwick, Hunter (ogn-159-298) · 5 Might · "I enter ready. When I attack, kill all
 *   damaged enemy units here."
 *
 * Q: Can Anivia and Warwick attack together so their "When I attack" triggers fire simultaneously, letting
 *    Warwick kill the units Anivia just damaged?
 * A: Yes. Both triggers fire at once; the attacker orders them, so resolve Anivia first (3 to each enemy)
 *    and Warwick second (kill the damaged units). Attacking with Anivia alone in an earlier combat would not
 *    work — damage is healed when that combat ends.
 * Rules: 383.3.d (controller orders simultaneous triggers), 383.4.e (attack triggers), 466.7 / 437.3 (damage
 *        cleared at end of combat).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANIVIA = "ogn-148-298";
const WARWICK = "ogn-159-298";

type OrderD = Extract<Decision, { kind: "order" }>;

/** P2 holds bf1 with two undamaged 7-Might units (14 Might > Anivia 8 + Warwick 5, so brute force loses). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", ANIVIA, "anivia")
    .unit(P1, "base", WARWICK, "ww")
    .unit(P2, "bf1", { might: 7, name: "Brute One" }, "e1")
    .unit(P2, "bf1", { might: 7, name: "Brute Two" }, "e2");
}

describe("Ruling 0871350c093d142a — Anivia + Warwick attacking together: order the simultaneous attack triggers Anivia → Warwick", () => {
  test("both move in as attackers → both triggers hit the chain at once and P1 is offered to ORDER them; Anivia on top resolves first (3 to each), then Warwick kills both damaged units; P1 conquers untouched", async () => {
    const game = await board().build();
    await game.p1.move(["anivia", "ww"], "bf1");
    expect(game.state("anivia").combatRole).toBe("attacker");
    expect(game.state("ww").combatRole).toBe("attacker");
    // Simultaneous triggers, same controller ⇒ the attacker (P1) chooses their order (383.3.d).
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = (d as OrderD).items;
    expect(items.map((i) => i.card).sort()).toEqual(["anivia", "ww"]);
    const key = (card: string) => items.find((i) => i.card === card)?.key as string;
    // last = top of chain = resolves first ⇒ [Warwick, Anivia] puts Anivia on top.
    await game.p1.order([key("ww"), key("anivia")]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww", "anivia"]);

    // Resolve Anivia: 3 to each enemy unit here.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww"]);
    expect(game.state("e1")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("e2")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });

    // Resolve Warwick: kill all DAMAGED enemy units here.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash");

    await game.settle();
    expect(game.state("anivia")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("ww")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("the other order (Warwick on top) is legal but useless: Warwick finds nothing damaged, Anivia then deals 3, and the 13-vs-14 combat kills both attackers", async () => {
    const game = await board().build();
    await game.p1.move(["anivia", "ww"], "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = (d as OrderD).items;
    const key = (card: string) => items.find((i) => i.card === card)?.key as string;
    await game.p1.order([key("anivia"), key("ww")]); // Warwick on top
    await game.p1.passPriority();
    await game.p2.passPriority(); // Warwick resolves: nobody is damaged yet
    expect(game.zoneOf("e1")).toBe("battlefield-bf1");
    expect(game.zoneOf("e2")).toBe("battlefield-bf1");
    expect(game.state("e1").damage).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Anivia resolves: 3 each, but nothing kills them now
    expect(game.state("e1")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("e2")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    await game.settle();
    // 14 defending Might vs Anivia 8 + Warwick 5: both attackers die; P1 does not conquer.
    expect(game.zoneOf("anivia")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("nuance — Anivia attacking ALONE first doesn't set Warwick up: her 3 damage is healed when that combat ends, so a later Warwick attack finds undamaged units", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", ANIVIA, "anivia")
      .unit(P1, "base", WARWICK, "ww")
      .unit(P2, "bf1", { might: 12, name: "Wall One" }, "e1")
      .unit(P2, "bf1", { might: 12, name: "Wall Two" }, "e2")
      .build();
    await game.p1.move("anivia", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Anivia's trigger: 3 to each
    expect(game.state("e1").damage).toBe(3);
    expect(game.state("e2").damage).toBe(3);
    await game.settle(); // combat: 8 into 24 — Anivia dies, defenders survive and heal
    expect(game.zoneOf("anivia")).toBe("trash");
    expect(game.state("e1")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("e2")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    // Warwick attacks next: "kill all damaged enemy units here" finds none.
    await game.p1.move("ww", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("e1")).toBe("battlefield-bf1");
    expect(game.zoneOf("e2")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });
});
