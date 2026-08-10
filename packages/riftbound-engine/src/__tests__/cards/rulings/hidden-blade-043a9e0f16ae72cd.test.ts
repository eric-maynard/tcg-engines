/**
 * Ruling 043a9e0f16ae72cd — Hidden Blade (OGN-213 → ogn-213-298)
 *   "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *   × Ride the Wind (OGN-173 → ogn-173-298) "[Action] Move a friendly unit and ready it."
 *   × Flash (OGS-011 → ogs-011-024) "[Reaction] Move up to 2 friendly units to base."
 *
 * Q: The opponent attacks; I answer with Hidden Blade on their unit. Can they Ride the Wind out of it, and
 *    if the target escapes does Hidden Blade then hit my own unit?
 * A: No — Ride the Wind is an Action, and Actions only START chains; once Hidden Blade has opened a chain
 *    only Reactions may be added. If the target does become invalid (e.g. via the Reaction Flash), Hidden
 *    Blade kills nothing; you do not pick another target (targets are locked when the spell is finalized).
 * Rules: 331–333 (closed chain: only Reactions), 355.5 (targets chosen at finalize), 359.3.e.2/5/14.a
 *        (illegal target ⇒ instruction and its linked "its controller draws 2" ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const RIDE_THE_WIND = "ogn-173-298";
const FLASH = "ogs-011-024";

/**
 * P2's turn 3. P1 holds bf1 with a Defender (2) and hid Hidden Blade there on an earlier turn. P2's
 * Attacker (5) is in base; P2 holds Ride the Wind AND Flash with enough to pay for both
 * (4 energy + [chaos]). bf2 is open (a would-be Ride the Wind destination).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P2, "base", { might: 5, name: "Attacker" }, "atk")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P2, RIDE_THE_WIND, "rtw")
    .hand(P2, FLASH, "flash");
}

/** P2 attacks bf1; P2 passes Focus; P1 plays Hidden Blade from face down on the Attacker → P2 has priority. */
async function bladeOnAttacker(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("atk", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.reveal("blade", { answers: ["atk"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, triggered: false })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling 043a9e0f16ae72cd — no Action-speed escape from Hidden Blade; an escaped target is not replaced", () => {
  test("control: with Focus in the open showdown (no chain yet) P2 COULD start a chain with Ride the Wind — it is a legal Action there", async () => {
    const game = await board().build();
    await game.p2.move("atk", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rtw")).toBe(true);
    expect(game.p2.can("cast", "flash")).toBe(true);
  });

  test("ruling 043a9e0f16ae72cd — once Hidden Blade is on the chain, Ride the Wind (Action) is NOT legal for P2, while Flash (Reaction) is", async () => {
    const game = await bladeOnAttacker();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rtw")).toBe(false);
    const r = await game.p2.try((p) => p.cast("rtw", { targets: "atk" }));
    expect(r.ok).toBe(false);
    expect(game.p2.can("cast", "flash")).toBe(true);
    // Nothing changed: the Blade is still the only chain item.
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("no response: Hidden Blade resolves, the Attacker is killed and its controller (P2) draws 2", async () => {
    const game = await bladeOnAttacker();
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("ruling 043a9e0f16ae72cd — P2 Flashes the Attacker home in response: Hidden Blade then kills NOTHING (the Defender is never substituted in), P1 is not asked to retarget, nobody draws", async () => {
    const game = await bladeOnAttacker();
    await game.p2.cast("flash", { targets: "atk" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const r = await game.settle();
    // No retarget prompt was raised for P1 on the way.
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("atk")).toBe("base");
    expect(game.p2.trash()).not.toContain("atk");
    // P1's own Defender is untouched — the Blade did not "fall through" onto it.
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.p1.trash()).not.toContain("def");
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
