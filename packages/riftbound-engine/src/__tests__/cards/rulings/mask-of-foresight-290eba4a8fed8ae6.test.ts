/**
 * Ruling 290eba4a8fed8ae6 — Mask of Foresight (OGN-060 → ogn-060-298) · Gear [2] "When a friendly unit attacks or
 *   defends alone, give it +1 [Might] this turn."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield "When you defend here, you may move a friendly unit here to base."
 *
 * Q: When does Mask trigger, and does it trigger again if a unit becomes alone later in the combat?
 * A: It triggers when a unit is first marked attacker/defender and is alone at that moment; the +1 lasts until end
 *    of turn. It does NOT re-trigger for a unit that becomes alone later: two defenders on Reaver's Row, one moved
 *    back → no trigger for the one left; a lone defender joined by a revealed hidden unit → no new trigger either.
 *    (A brand-new unit arriving alone after the lone one left WOULD trigger — it is newly marked.)
 * Rules: 383.4.e/f (attack/defend triggers fire once, on gaining the designation), 740.2.a (alone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const REAVERS_ROW = "ogn-285-298";
const EVELYNN = "unl-141-219"; // a [Hidden] unit (2 Might) to reveal mid-combat as a second defender
const RIDE_THE_WIND = "ogn-173-298"; // [Action] [2][chaos] "Move a friendly unit and ready it."

/** Pass priority until the chain is empty (stops at any non-priority prompt). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 290eba4a8fed8ae6 — Mask of Foresight fires once, when a unit is first marked attacker/defender alone", () => {
  test("lone ATTACKER: the trigger goes on the chain the moment the unit is marked attacker; +1 on resolution; the buff outlives the combat and ends with the turn", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "base", { might: 3, name: "Lone Wolf" }, "wolf")
      .unit(P2, "bf1", { might: 1, name: "Speed Bump" }, "bump")
      .build();
    await game.p1.move("wolf", "bf1");
    expect(game.state("wolf").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
    expect(game.state("wolf").might).toBe(3); // not yet resolved
    await drainChain(game);
    expect(game.state("wolf").might).toBe(4);
    await game.settle(); // combat: 4 vs 1 → conquer
    expect(game.zoneOf("bump")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("wolf").combatRole).toBeNull();
    expect(game.state("wolf").might).toBe(4); // "persists until end of turn"
    await game.advanceTurn();
    expect(game.state("wolf").might).toBe(3);
  });

  test("two defenders on Reaver's Row: no Mask trigger at designation; P1 uses the Row to send Guard B home — Guard A is now alone but was NOT newly marked → still no trigger, stays 3", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
      .battlefield("bf2", { controller: P2 })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "row", { might: 3, name: "Guard A" }, "ga")
      .unit(P1, "row", { might: 2, name: "Guard B" }, "gb")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "row");
    expect(game.state("ga").combatRole).toBe("defender");
    expect(game.state("gb").combatRole).toBe("defender");
    // Only the Row's "when you defend here" trigger — no Mask item (neither defender is alone).
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("gb");
    await drainChain(game);
    expect(game.locationOf("gb")).toBe("base");
    expect(game.state("gb").combatRole).toBeNull();
    expect(game.p1.units("row")).toEqual(["ga"]); // alone now…
    expect(game.chain()).toEqual([]); // …but nothing triggered
    expect(game.state("ga").might).toBe(3);
    expect(game.state("ga").mightModifier).toBe(0);
    // Through the rest of the showdown and combat, still no Mask bonus ever lands on Guard A.
    await game.settle();
    expect(game.chain()).toEqual([]);
    if (game.zoneOf("ga") !== "trash") {
      expect(game.state("ga").mightModifier).toBe(0);
    }
  });

  test("lone defender + hidden unit revealed mid-combat: Guard A got +1 when first marked; revealing Evelynn as a second defender triggers nothing new (Guard A keeps exactly +1, Evelynn gets none)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "bf1", { might: 3, name: "Guard A" }, "ga")
      .facedown(P1, "bf1", EVELYNN, "eve")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["mask"]); // alone when marked → triggers
    await drainChain(game);
    expect(game.state("ga")).toMatchObject({ combatRole: "defender", might: 4, mightModifier: 1 });
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "eve")).toBe(true);
    await game.p1.reveal("eve");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no(); // Evelynn's own optional text (irrelevant on P2's turn)
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.locationOf("eve")).toBe("bf1");
    expect(game.state("eve").combatRole).toBe("defender");
    expect(game.chain().some((c) => c.cardId === "mask")).toBe(false); // no second Mask trigger
    expect(game.state("eve").mightModifier).toBe(0);
    expect(game.state("ga").mightModifier).toBe(1); // not +2
  });

  test("contrast — the lone defender is removed (Reaver's Row sends Guard A home) and P1 then Rides the Wind Guard C in alone: C is NEWLY marked defender alone → Mask triggers for C (+1)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
      .battlefield("bf2", { controller: P2 })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "row", { might: 3, name: "Guard A" }, "ga")
      .unit(P1, "base", { might: 2, name: "Guard C" }, "gc")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .build();
    await game.p2.move("raider", "row");
    // Guard A alone → Mask triggers, together with the Row's defend trigger (both P1's; P1 may order them).
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        expect(d).toMatchObject({ seat: P1, source: { cardId: "row" } });
        await game.p1.yes();
      } else if (d?.kind === "pick") {
        await game.p1.pick("ga");
      } else if (d?.kind === "order") {
        expect(d.seat).toBe(P1);
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["mask", "row"]);
    await drainChain(game);
    expect(game.locationOf("ga")).toBe("base");
    expect(game.state("ga").might).toBe(4); // its +1 still resolved and stays for the turn
    expect(game.p1.units("row")).toEqual([]);
    // P2 passes Focus; P1 Rides the Wind Guard C into the Row.
    await game.p2.passFocus();
    await game.p1.cast("rtw", { answers: ["row", "battlefield-row"], targets: "gc" });
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "rtw"); i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => String(o.key).includes("row"))?.key as string);
      } else {
        await game.acting().passPriority();
      }
    }
    expect(game.locationOf("gc")).toBe("row");
    expect(game.state("gc").combatRole).toBe("defender");
    // Newly marked, alone → a fresh Mask trigger for Guard C.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", triggered: true })]);
    await drainChain(game);
    expect(game.state("gc")).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });
});
