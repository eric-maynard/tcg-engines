/**
 * Ruling 8048a840cd687a84 — Fiora, Peerless (SFD-110 → sfd-110-221) · Unit · Body · [3][body] · 3 Might
 *     "When I attack or defend one on one, double my Might this combat."
 *   × Cleave (ogn-004-298) "[Action] Give a unit [Assault 3] this turn."
 *   × Fortified Position (ogn-279-298) battlefield "When you defend here, choose a unit. It gains [Shield 2] this combat."
 *
 * Q: Does Fiora's doubling include Might gained from [Shield] and [Assault]?
 * A: Yes. Those are passive "+X while attacker/defender" effects that are already applying when her ability resolves,
 *    so the doubling works on the total. When the [Shield] comes from a triggered ability that fires at the same time
 *    as Fiora's, the controller orders the two triggers and can have the [Shield] resolve first.
 * Rules: 814.1.b/c ([Assault]/[Shield] statics), 372 / 383.5 (the controller orders simultaneous triggers),
 *        359.3.f (values are read as the effect resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA_PEERLESS = "sfd-110-221";
const CLEAVE = "ogn-004-298";
const FORTIFIED_POSITION = "ogn-279-298";

/** Pass priority until the chain empties. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 8048a840cd687a84 — Fiora doubles her TOTAL Might, keyword bonuses included", () => {
  test("[Assault 3] already on her: attacking one on one she is 6 when the trigger resolves and ends up at 12, not 6", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 20, name: "Wall" }, "wall")
      .unit(P1, "base", FIORA_PEERLESS, "fiora")
      .hand(P1, CLEAVE, "cleave")
      .build();
    await game.p1.cast("cleave", { targets: "fiora" });
    await game.settle();
    expect(game.state("fiora").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("fiora").might).toBe(3); // [Assault] is inert while she sits in base
    await game.p1.move("fiora", "bf1");
    expect(game.state("fiora").might).toBe(6); // attacker ⇒ +3 already applying
    expect(game.chain().map((c) => c.cardId)).toEqual(["fiora"]);
    await drainChain(game);
    expect(game.state("fiora").might).toBe(12); // (3 + 3) × 2 — the [Assault] bonus was doubled too
    expect(game.violations()).toEqual([]);
  });

  test("[Shield] granted by a simultaneous trigger: P1 is asked to ORDER the two triggers, and putting Fortified Position on top resolves the Shield first ⇒ (3+2)×2 = 10", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: FORTIFIED_POSITION, inert: false })
      .unit(P1, "bf1", FIORA_PEERLESS, "fiora")
      .unit(P2, "base", { might: 20, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    // Fortified Position's own target is chosen as its trigger is finalized.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "bf1" } });
    await game.p1.pick("fiora");
    expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["bf1", "fiora"]);
    const order = game.decision();
    expect(order).toMatchObject({ kind: "order", seat: P1 }); // the controller orders them (last = resolves first)
    await game.p1.order(["fiora", "bf1"]);
    await drainChain(game);
    expect(game.state("fiora").keywords).toContain("Shield");
    expect(game.state("fiora").might).toBe(10); // Shield applied first, then doubled
    expect(game.violations()).toEqual([]);
  });

  test("the order genuinely matters: doubling first and only then gaining [Shield 2] leaves her at 3×2 + 2 = 8", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: FORTIFIED_POSITION, inert: false })
      .unit(P1, "bf1", FIORA_PEERLESS, "fiora")
      .unit(P2, "base", { might: 20, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p1.pick("fiora");
    await game.p1.order(["bf1", "fiora"]); // Fiora on top ⇒ her doubling resolves first
    await drainChain(game);
    expect(game.state("fiora").might).toBe(8);
    expect(game.violations()).toEqual([]);
  });
});
