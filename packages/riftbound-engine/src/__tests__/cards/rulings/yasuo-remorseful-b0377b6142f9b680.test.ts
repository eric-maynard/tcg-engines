/**
 * Ruling b0377b6142f9b680 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · [6][calm][calm] · 6
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Mask of Foresight (OGN-060 → ogn-060-298) · Gear · [2] · "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *
 * Q: Yasuo, with Mask of Foresight out, moves ALONE into a battlefield with an enemy unit. Can he be 7 before his ability resolves?
 * A: Yes. Both abilities trigger simultaneously; their controller chooses the order they go on the chain. Put Mask's trigger on top
 *    (resolves first): Yasuo is 7 when his own trigger resolves and deals 7.
 * Rules: 383.3.d (controller orders simultaneous triggers), 383 (LIFO), 464.2.e (attack triggers on the initial chain),
 *        359 (damage amount read on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game, OrderDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const MASK_OF_FORESIGHT = "ogn-060-298";

/** P1's turn. P1: Mask in base, Yasuo (6) in base. P2 holds bf1 with a lone 7-Might Giant. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "base", YASUO, "yasuo")
    .unit(P2, "bf1", { might: 7, name: "Giant" }, "giant");
}

async function yasuoAttacksAlone(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  return game;
}

const keyOf = (d: OrderDecision, card: string) => d.items.find((i) => i.card === card)!.key;

describe("Ruling b0377b6142f9b680 — order Mask of Foresight above Yasuo's trigger so he hits for 7", () => {
  test("both triggers are P1's and simultaneous: the harness surfaces an ORDER decision to P1 listing the Mask trigger and the Yasuo trigger", async () => {
    const game = await yasuoAttacksAlone();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items.map((i) => i.card).toSorted() : [];
    expect(items).toEqual(["mask", "yasuo"]);
    expect(game.state("yasuo")).toMatchObject({ combatRole: "attacker", might: 6 });
  });

  test("P1 orders Yasuo's trigger first (bottom) and Mask's last (top): the chain reads [yasuo → Giant, mask]; Mask resolves first and Yasuo is 7 while his trigger is still pending", async () => {
    const game = await yasuoAttacksAlone();
    const d = game.decision() as OrderDecision;
    await game.p1.order([keyOf(d, "yasuo"), keyOf(d, "mask")]);
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("giant");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "mask"]);
    expect(game.chain()[0]?.targets).toEqual(["giant"]);
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    expect(game.state("yasuo")).toMatchObject({ might: 7, mightModifier: 1 });
    expect(game.state("giant").damage).toBe(0);
  });

  test("…so Yasuo's trigger then deals 7 — exactly lethal on the 7-Might Giant; Yasuo conquers bf1", async () => {
    const game = await yasuoAttacksAlone();
    const d = game.decision() as OrderDecision;
    await game.p1.order([keyOf(d, "yasuo"), keyOf(d, "mask")]);
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("giant");
    }
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.state("yasuo").damage).toBe(0); // the Giant died before combat damage
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the other order (Mask bottom, Yasuo top): Yasuo resolves first at 6 → Giant survives with 6 damage; then combat: Yasuo (7) still kills it, but only via combat and Yasuo takes 7 and dies too", async () => {
    const game = await yasuoAttacksAlone();
    const d = game.decision() as OrderDecision;
    await game.p1.order([keyOf(d, "mask"), keyOf(d, "yasuo")]);
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("giant");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["mask", "yasuo"]);
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("giant")).toMatchObject({ damage: 6, zone: "battlefield-bf1" }); // hit for 6, not 7
    expect(game.state("yasuo").might).toBe(6); // Mask not resolved yet
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("trash");
  });
});
