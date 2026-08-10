/**
 * Ruling c839b599d197438a — Kinkou Initiate (UNL-097 → unl-097-219) · Unit · Body · 3 · 3 Might
 *     "When you play me, draw 1 if your other units have total Might 5 or more."
 *   × Pridestalker (UNL-183 → unl-183-219, Rengar legend) "When you play a unit, give a unit +1 [Might] this turn."
 *
 * Q: With a 1-Might unit out and the Rengar legend, can I play Kinkou Initiate and have the legend's +1 land
 *    before Kinkou's "total Might 5 or more" check?
 * A: Yes. Both abilities trigger off the same play; as controller of both you choose their order on the chain —
 *    Kinkou's item first, Pridestalker's on top. LIFO: Pridestalker resolves (+1), then Kinkou's ability checks
 *    the total ON RESOLUTION and draws if it is now 5+.
 * Rules: 383.3.d / 333.1 (controller orders simultaneous triggers), 340 (LIFO), 359 (effect condition read on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game, OrderDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KINKOU = "unl-097-219";
const PRIDESTALKER = "unl-183-219";
const FILLER = "ogn-175-298";

/** P1 (legend Pridestalker), 3 energy; other units: Runt (1) + Veteran (3) = 4 total; Kinkou in hand; known deck. */
function board() {
  return scenario()
    .legend(P1, PRIDESTALKER, "pride")
    .resources(P1, { energy: 3 })
    .unit(P1, "base", { might: 1, name: "Runt" }, "runt")
    .unit(P1, "base", { might: 3, name: "Veteran" }, "vet")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
    .hand(P1, KINKOU, "kinkou")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"]);
}

/** Play Kinkou; expect the soft order offer; order so that `top` is the LAST key (top of chain → resolves first). */
async function playAndOrder(top: "pride" | "kinkou"): Promise<Game> {
  const game = await board().build();
  await game.p1.play("kinkou");
  expect(game.zoneOf("kinkou")).toBe("base");
  expect(game.p1.energy()).toBe(0);
  // Pridestalker's target may be asked at finalization, before the order offer.
  for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.pick("runt");
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "order", seat: P1 });
  const keys = (d as OrderDecision).items.map((it) => it.key);
  expect(keys).toHaveLength(2);
  const topKey = keys.find((k) => k.includes(top)) ?? (d as OrderDecision).items.find((it) => it.card === top)?.key;
  expect(topKey).toBeDefined();
  await game.p1.order([...keys.filter((k) => k !== topKey), topKey as string]);
  // If Pridestalker's target is asked only now, answer it.
  for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
    await game.p1.pick("runt");
  }
  return game;
}

describe("Ruling c839b599d197438a — order Pridestalker above Kinkou Initiate so the +1 lands before Kinkou's check", () => {
  test("playing Kinkou puts BOTH 'when you play' items on the chain and P1 — controller of both — is offered their order", async () => {
    const game = await board().build();
    await game.p1.play("kinkou");
    for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
      await game.p1.pick("runt");
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const cards = (d as OrderDecision).items.map((it) => it.card).sort();
    expect(cards).toEqual(["kinkou", "pride"]);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["kinkou", "pride"]);
    expect(game.p1.hand()).toEqual([]); // nothing resolved yet
  });

  test("Kinkou first, Pridestalker on top: Pridestalker resolves first (Runt 1→2, others total 5), then Kinkou's check passes and P1 draws 1", async () => {
    const game = await playAndOrder("pride");
    expect(game.chain().map((c) => c.cardId)).toEqual(["kinkou", "pride"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Pridestalker's +1 resolves
    expect(game.state("runt")).toMatchObject({ might: 2, mightModifier: 1 });
    expect(game.p1.hand()).toEqual([]); // Kinkou still waiting
    expect(game.chain().map((c) => c.cardId)).toEqual(["kinkou"]);
    await game.settle(); // Kinkou resolves: 2 + 3 = 5 → draw
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Pridestalker first, Kinkou on top: Kinkou resolves while the others still total 4 → no draw; the +1 lands afterwards", async () => {
    const game = await playAndOrder("kinkou");
    expect(game.chain().map((c) => c.cardId)).toEqual(["pride", "kinkou"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Kinkou resolves: 1 + 3 = 4 → nothing
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.state("runt").might).toBe(2);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("d1");
  });

  test("the legend may also point its +1 at the Kinkou Initiate just played (it is on the board already) — but Kinkou never counts itself, so no draw", async () => {
    const game = await board().build();
    await game.p1.play("kinkou");
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        expect(d.options.map((o) => o.card ?? o.key)).toContain("kinkou");
        await game.p1.pick("kinkou");
      } else if (d.kind === "order") {
        const keys = d.items.map((it) => it.key);
        const prideKey = d.items.find((it) => it.card === "pride")?.key as string;
        await game.p1.order([...keys.filter((k) => k !== prideKey), prideKey]);
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      }
    }
    expect(game.state("kinkou").might).toBe(4);
    expect(game.p1.hand()).toEqual([]); // others: 1 + 3 = 4
  });
});
