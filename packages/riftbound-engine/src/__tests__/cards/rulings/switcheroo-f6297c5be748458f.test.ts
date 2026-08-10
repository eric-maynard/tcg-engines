/**
 * Ruling f6297c5be748458f — Switcheroo (SFD-145 → sfd-145-221) · Spell · Chaos · [2]+[chaos][chaos] · [Hidden] [Action]
 *     "Swap the Might of two units at the same battlefield this turn."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · Champion Unit · Calm · 4 Might
 *     "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield · "Units here have +1 [Might]."
 *
 * Q: Switcheroo on Irelia and another unit, both at the War Camp — how do the Camp's +1 and "when you choose me" interact?
 * A: Choosing Irelia with Switcheroo triggers her +1. Her trigger resolves before Switcheroo [ruling: "you control the
 *    order"; CR 383.4.b.2: the targeting trigger is added after the spell is finalized, so it is on top]. Switcheroo
 *    then reads CURRENT Might (Camp +1 and Irelia's +1 included): Irelia 4+1+1 = 6 vs other 3+1 = 4, difference 2 ⇒
 *    Irelia −2 = 4, other +2 = 6. These are modifiers layered on top — leaving the Camp later just drops that +1.
 * Rules: 383.4.b.2 (targeting triggers), 355.6 (choosing = targeting), 476–478 (Might layers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const IRELIA_FERVENT = "sfd-057-221";
const WAR_CAMP = "ogn-294-298";
const FIGHT_OR_FLIGHT = "ogn-168-298"; // [2][chaos] Action — "Move a unit from a battlefield to its base."

/**
 * P1's turn. P1 controls the live War Camp with Irelia (4) and a 3-Might Grunt. P1 holds Switcheroo and Fight or
 * Flight with exactly [4] + chaos×3.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 3 } })
    .battlefield("camp", { controller: P1, def: WAR_CAMP, inert: false })
    .unit(P1, "camp", IRELIA_FERVENT, "irelia")
    .unit(P1, "camp", { might: 3, name: "Grunt" }, "grunt")
    .hand(P1, SWITCHEROO, "switcheroo")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
}

async function castSwitcheroo(): Promise<Game> {
  const game = await board().build();
  expect(game.state("irelia")).toMatchObject({ baseMight: 4, might: 5 }); // 4 + Camp
  expect(game.state("grunt")).toMatchObject({ baseMight: 3, might: 4 }); // 3 + Camp
  await game.p1.cast("switcheroo", { targets: ["irelia", "grunt"] });
  return game;
}

async function resolved(): Promise<Game> {
  const game = await castSwitcheroo();
  await game.settle();
  expect(game.zoneOf("switcheroo")).toBe("trash");
  return game;
}

describe("Ruling f6297c5be748458f — Switcheroo on Irelia at the War Camp", () => {
  test("choosing Irelia with Switcheroo triggers her 'when you choose me': her trigger sits ABOVE Switcheroo on the chain (added after the spell was finalized), both P1's", async () => {
    const game = await castSwitcheroo();
    // RULING-CONFLICT: riftjudge f6297c5be748458f says "you control the order on the chain" of Switcheroo and Irelia's
    // trigger; CR 383.4.b.2 says a Targeting Effect is put on the chain AFTER the targeting spell is finalized, so it is
    // always on top and resolves first — engine follows CR (no order prompt is offered).
    expect(game.decision()?.kind).not.toBe("order");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "switcheroo", controller: P1, targets: ["irelia", "grunt"] }),
      expect.objectContaining({ cardId: "irelia", controller: P1, triggered: true }),
    ]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } }); // no Deflect surcharge for her own controller
  });

  test("LIFO: Irelia's trigger resolves first (+1 ⇒ 6 at the Camp) while Switcheroo still waits", async () => {
    const game = await castSwitcheroo();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["switcheroo"]);
    expect(game.state("irelia").might).toBe(6); // 4 + 1 (Camp) + 1 (chosen)
    expect(game.state("grunt").might).toBe(4);
  });

  test("Switcheroo resolves on CURRENT Might: 6 vs 4 ⇒ difference 2 ⇒ Irelia 4 + 1 + 1 − 2 = 4, Grunt 3 + 1 + 2 = 6", async () => {
    const game = await resolved();
    expect(game.state("irelia").might).toBe(4);
    expect(game.state("grunt").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("nothing is 'locked': the Grunt leaving the Camp afterwards (Fight or Flight → base) just drops the Camp's +1 ⇒ 3 + 2 = 5; Irelia stays 4", async () => {
    const game = await resolved();
    await game.p1.cast("fof", { targets: "grunt" });
    await game.settle();
    expect(game.locationOf("grunt")).toBe("base");
    expect(game.state("grunt").might).toBe(5);
    expect(game.state("irelia").might).toBe(4);
  });

  test("all of it is 'this turn': next turn Irelia is 5 and the Grunt 4 at the Camp again", async () => {
    const game = await resolved();
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(5);
    expect(game.state("grunt").might).toBe(4);
  });
});
