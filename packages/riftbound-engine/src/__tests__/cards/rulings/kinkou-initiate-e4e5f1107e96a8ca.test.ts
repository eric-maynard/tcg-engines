/**
 * Ruling e4e5f1107e96a8ca — Kinkou Initiate (UNL-097 → unl-097-219) · 3 Might · [3] "When you play me, draw 1 if your other
 *     units have total Might 5 or more."
 *   × Pridestalker (Rengar legend, UNL-183 → unl-183-219) "When you play a unit, give a unit +1 [Might] this turn."
 *
 * Q: I have one 4-Might unit and the Rengar legend. When I play Kinkou Initiate, does its trigger even go on the chain
 *    though the total is only 4 — so that Rengar's +1 can push it to 5 first?
 * A: Yes. The "if … total Might 5 or more" is part of the EFFECT (read on resolution), not a condition on triggering. Both
 *    triggers fire off the same play; you order them (Kinkou first, Rengar on top). Rengar resolves: 4 → 5. Kinkou
 *    resolves: sees 5 → draw 1.
 * Rules: 383.3.d / 333.1 (controller orders simultaneous triggers), 340 (LIFO), 359 (trailing "if" evaluated on
 *        resolution), 383.2.a.1 (contrast: intervening-if).
 */
import { describe, expect, test } from "bun:test";
import type { Game, OrderDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KINKOU_INITIATE = "unl-097-219";
const PRIDESTALKER = "unl-183-219";

/** P1 (Pridestalker legend), exactly [3]; ONE other unit: a 4-Might Brute. Known deck top. */
function board() {
  return scenario()
    .legend(P1, PRIDESTALKER, "rengar")
    .resources(P1, { energy: 3 })
    .unit(P1, "base", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
    .hand(P1, KINKOU_INITIATE, "kinkou")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Play Kinkou, aim Rengar's +1 at the Brute whenever asked, and order the two items so that `top` resolves first. */
async function playKinkouOrdering(top: "rengar" | "kinkou"): Promise<Game> {
  const game = await board().build();
  await game.p1.play("kinkou");
  expect(game.zoneOf("kinkou")).toBe("base");
  expect(game.p1.energy()).toBe(0);
  let ordered = false;
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("brute");
      await game.p1.pick("brute");
    } else if (d?.kind === "order") {
      expect(d).toMatchObject({ kind: "order", seat: P1 });
      const keys = (d as OrderDecision).items.map((it) => it.key);
      const topKey = (d as OrderDecision).items.find((it) => it.card === top)?.key as string;
      expect(topKey).toBeDefined();
      await game.p1.order([...keys.filter((k) => k !== topKey), topKey]);
      ordered = true;
    } else {
      break;
    }
  }
  expect(ordered).toBe(true);
  return game;
}

describe("Ruling e4e5f1107e96a8ca — Kinkou's trigger goes on the chain at total 4; Rengar ordered on top makes it 5 in time", () => {
  test("the trigger is NOT gated: with the other units totalling only 4, playing Kinkou still puts BOTH Kinkou's and Rengar's items on the chain and offers P1 their order", async () => {
    const game = await board().build();
    expect(game.state("brute").might).toBe(4); // below the 5 threshold right now
    await game.p1.play("kinkou");
    for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
      await game.p1.pick("brute");
    }
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
    expect((game.decision() as OrderDecision).items.map((it) => it.card).sort()).toEqual(["kinkou", "rengar"]);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["kinkou", "rengar"]);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
  });

  test("Kinkou bottom, Rengar top: Rengar resolves first (Brute 4 → 5), then Kinkou resolves, sees total 5 and P1 draws 1", async () => {
    const game = await playKinkouOrdering("rengar");
    expect(game.chain().map((c) => c.cardId)).toEqual(["kinkou", "rengar"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("brute")).toMatchObject({ might: 5, mightModifier: 1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["kinkou"]);
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the other order (Kinkou on top) resolves Kinkou at total 4: no draw, and the +1 arriving afterwards doesn't help", async () => {
    const game = await playKinkouOrdering("kinkou");
    expect(game.chain().map((c) => c.cardId)).toEqual(["rengar", "kinkou"]);
    await game.settle();
    expect(game.state("brute").might).toBe(5);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("d1");
  });
});
