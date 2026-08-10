/**
 * Ruling caf66a81e77250d8 — Mask of Foresight (OGN-060 → ogn-060-298) · Gear "When a friendly unit attacks or defends alone,
 *   give it +1 [Might] this turn."
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 Might · [Hidden] "When you play me, you may choose a unit you control at another
 *     location. Move me to its location and it to my original location."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Action [2] "Move a unit from a battlefield to its base."  × a Poro.
 *
 * Q: Poro defends alone at a battlefield where Tideturner is hidden (Mask in base). After the Mask +1, does flipping
 *    Tideturner (Poro no longer alone) remove the buff? And does Fight or Flight mid-combat make the Mask trigger?
 * A: The +1 is granted when the lone unit is designated defender and lasts the turn regardless of it later becoming
 *    not-alone (Tideturner flipped in). But making a unit alone AFTER combat began (Fight or Flight the other defender home)
 *    misses the "When … defends alone" window — no trigger, no +1.
 * Rules: 383.4.e/f (attack/defend triggers fire once, on designation), 740.2.a (alone), 811.1.c/d (play from Hidden).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const TIDETURNER = "ogn-199-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

describe("Ruling caf66a81e77250d8 — Mask of Foresight's +1 sticks after Tideturner flips in; Fight or Flight mid-combat is too late to trigger it", () => {
  test("case 1: lone Poro is designated defender → Mask triggers (P1's item on the chain) → resolves: Poro 2→3", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "bf1", { might: 2, name: "Poro" }, "poro")
      .facedown(P1, "bf1", TIDETURNER, "tideturner")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
    expect(game.state("poro").might).toBe(2);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("poro").might).toBe(3);
  });

  test("case 1 cont.: P1 then flips the hidden Tideturner into bf1 — Poro is no longer alone but KEEPS the +1 (3 Might) for the rest of the turn", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "bf1", { might: 2, name: "Poro" }, "poro")
      .facedown(P1, "bf1", TIDETURNER, "tideturner")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Mask resolves → Poro 3
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "tideturner")).toBe(true);
    await game.p1.reveal("tideturner");
    // Decline Tideturner's optional swap if it is offered; pass through its play trigger.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else if (d?.kind === "pick" && d.seat === P1 && d.allowDecline) {
        await game.p1.decline();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("tideturner")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["poro", "tideturner"]);
    expect(game.state("poro").might).toBe(3); // no "alone" condition on the granted bonus
    expect(game.state("poro").mightModifier).toBe(1);
    // Combat: Raider 4 vs Poro 3 + Tideturner 2 = 5 → Raider dies, P1 keeps bf1.
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("case 2: Poro + Buddy defend together (no trigger); Fight or Flight sends Buddy home mid-showdown → Poro is alone now but Mask does NOT trigger, Poro stays 2", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "bf1", { might: 2, name: "Poro" }, "poro")
      .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("buddy").combatRole).toBe("defender");
    expect(game.chain()).toEqual([]); // not alone → no Mask trigger
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "fof")).toBe(true);
    await game.p1.cast("fof", { targets: "buddy" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("buddy")).toBe("base");
    expect(game.p1.units("bf1")).toEqual(["poro"]); // alone now…
    expect(game.chain()).toEqual([]); // …but the "When … defends alone" window has passed: nothing triggered
    expect(game.state("poro").might).toBe(2);
    expect(game.state("poro").mightModifier).toBe(0);
    // Outcome confirms it: Raider 4 into a 2-Might Poro → Poro dies, Raider conquers.
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
