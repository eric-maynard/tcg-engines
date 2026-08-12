/**
 * Ruling e2b77acea5e12695 — Sett, Brawler (OGN-164 → ogn-164-298) · Unit · Body · 4 Might
 *   "When I'm played and when I conquer, buff me. Spend my buff: Give me +4 [Might] this turn."
 *   × The Boss (OGN-269 → ogn-269-298, the Sett LEGEND) "If a buffed unit you control would die, you may pay
 *     [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and recall it."
 *
 * Q: Can Sett's ability be used on an opponent's turn to save a unit?
 * A: The LEGEND (The Boss) can — it is a replacement effect, which does not use the chain and applies whenever
 *    the death would happen, including on the opponent's turn. Sett, Brawler's "Spend my buff:" ability cannot:
 *    a "cost : effect" activated ability with no [Action]/[Reaction] tag is discretionary and is only usable on
 *    your own turn while you have priority in an Open State.
 * Rules: 370 (replacement effects don't use the chain), 401.2 (activated ability timing = its printed tag),
 *        347/348 (priority; untagged abilities are turn-player-only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SETT_BRAWLER = "ogn-164-298";
const THE_BOSS = "ogn-269-298";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] Action — Deal 3 to a unit at a battlefield

describe("Ruling e2b77acea5e12695 — Sett, Brawler's activated ability is on-turn only; the Sett legend's replacement is not", () => {
  /** P2's turn. P1 has a buffed Sett in base and the Sett legend; P2 holds a Hextech Ray. */
  function offTurnBoard() {
    return scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 5, power: { body: 2, rainbow: 2 } })
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", SETT_BRAWLER, "sett", { buffed: true })
      .legend(P1, THE_BOSS, "boss")
      .hand(P2, HEXTECH_RAY, "ray");
  }

  test("premise: it is P2's turn, P1's Sett is buffed and P1 has every resource the ability could want", async () => {
    const game = await offTurnBoard().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(5); // 4 printed + the buff
  });

  test("ruling: P1 cannot activate 'Spend my buff: +4 Might' on P2's turn", async () => {
    const game = await offTurnBoard().build();
    expect(game.p1.can("activate", "sett")).toBe(false);
    const attempt = await game.p1.try((p) => p.activate("sett", 1));
    expect(attempt.ok).toBe(false);
    expect(game.state("sett").isBuffed).toBe(true); // nothing was spent
    expect(game.state("sett").might).toBe(5);
  });

  test("…not even while a spell of P2's sits on the chain (no 'in response' window exists for it)", async () => {
    const game = await offTurnBoard().unit(P1, "bf1", { might: 3, name: "Squire" }, "squire").build();
    await game.p2.cast("ray", { targets: "squire" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    expect(game.p1.can("activate", "sett")).toBe(false);
    const attempt = await game.p1.try((p) => p.activate("sett", 1));
    expect(attempt.ok).toBe(false);
  });

  test("contrast: on P1's OWN turn the very same activation is legal and gives Sett +4 Might for the turn", async () => {
    const game = await scenario()
      .turn(4)
      .active(P1)
      .resources(P1, { energy: 5, power: { body: 2 } })
      .unit(P1, "base", SETT_BRAWLER, "sett", { buffed: true })
      .legend(P1, THE_BOSS, "boss")
      .build();
    expect(game.p1.can("activate", "sett")).toBe(true);
    await game.p1.activate("sett", 1);
    await game.settle();
    expect(game.state("sett").isBuffed).toBe(false); // the buff was the cost
    expect(game.state("sett").might).toBe(8); // 4 printed + 4 this turn
  });

  test("control: 3 damage that is NOT lethal produces no offer at all — the legend replaces a death, not damage", async () => {
    const game = await offTurnBoard().unit(P1, "bf1", { might: 3, name: "Squire" }, "squire", { buffed: true }).build();
    expect(game.state("squire").might).toBe(4); // 3 + buff, so 3 damage is not yet lethal
    await game.p2.cast("ray", { targets: "squire" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    // 3 damage on a 4-Might unit is survivable; make it lethal instead by taking the buff away first.
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.state("squire").damage).toBe(3);
  });

  test("…and when the death really would happen on P2's turn, the replacement is offered to P1 (a chain item never is)", async () => {
    const game = await offTurnBoard()
      .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire", { buffed: true })
      .build();
    expect(game.state("squire").might).toBe(3); // 2 + buff → Hextech Ray's 3 is lethal
    await game.p2.cast("ray", { targets: "squire" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    const d = game.decision();
    // The offer belongs to P1 even though it is P2's turn — replacement effects ignore turn/priority.
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("yes-no");
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("squire")).toBe("base"); // healed, exhausted, recalled — saved on the opponent's turn
    expect(game.state("squire").damage).toBe(0);
    expect(game.state("squire").isExhausted).toBe(true);
    expect(game.state("squire").isBuffed).toBe(false); // its buff was spent
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
