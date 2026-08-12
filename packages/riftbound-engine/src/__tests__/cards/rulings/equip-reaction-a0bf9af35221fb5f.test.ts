/**
 * Ruling a0bf9af35221fb5f — (general Equipment timing; exercised with)
 *   B.F. Sword (SFD-161 → sfd-161-221) · gear · +3 Might · "[Equip] [order]" — the activated ability
 *   × Long Sword (SFD-022 → sfd-022-221) · gear · +2 Might · "[Quick-Draw] (This has [Reaction]. When you play
 *     it, attach it to a unit you control.) [Equip] [fury]"
 *
 * Q: Can you react while equipment is being attached?
 * A: It depends how. The [Equip] activated ability goes on the chain, so there is a full reaction window and if
 *    the unit is gone when it resolves the attach fails. [Quick-Draw] splits it in two: the gear itself enters
 *    at your base with no window, and only its "when you play this, attach it" TRIGGER is respondable — kill the
 *    target and the gear stays at base, unattached.
 * Rules: 402 / 337 (an activated ability is finalized and put on the chain), 336 (priority on a chain),
 *        359.3.e.5 (an illegal target at resolution is simply unaffected), 819 ([Quick-Draw]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BF_SWORD = "sfd-161-221";
const LONG_SWORD = "sfd-022-221";

/** [Reaction] "Kill a unit." — P2's answer. */
const SNIPE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Snipe",
  powerCost: [],
  rulesText: "[Reaction] Kill a unit.",
  timing: "reaction",
} as const;

/** P1's turn with a 2-Might Squire to equip, both swords available, and a Snipe in P2's hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { order: 3, fury: 3 } })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .gear(P1, BF_SWORD, "bf")
    .hand(P1, LONG_SWORD, "long")
    .hand(P2, SNIPE, "snipe");
}

/** Activate the B.F. Sword's [Equip] naming the Squire. */
async function equipping(): Promise<Game> {
  const game = await board().build();
  await game.p1.do("equipCard", { equipmentId: "bf", unitId: "squire" });
  return game;
}

describe("Ruling a0bf9af35221fb5f — [Equip] is respondable; [Quick-Draw] splits entry (no window) from attach (window)", () => {
  test("[Equip] puts an ability on the chain — nothing is attached yet and the opponent gets a window", async () => {
    const game = await equipping();
    expect(game.chain()).toHaveLength(1);
    expect(game.state("squire").attachments).toEqual([]);
    expect(game.state("squire").might).toBe(2);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "snipe")).toBe(true);
  });

  test("unanswered, it resolves and the sword attaches (+3 Might)", async () => {
    const game = await equipping();
    await game.settle();
    expect(game.state("squire").attachments).toEqual(["bf"]);
    expect(game.state("squire").might).toBe(5);
  });

  test("answered — the target is killed in response — the equip fails to attach and the gear stays where it was", async () => {
    const game = await equipping();
    await game.p1.passPriority();
    await game.p2.cast("snipe", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.state("bf").attachedTo).toBeUndefined();
    expect(game.zoneOf("bf")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("[Quick-Draw]: the gear itself enters at base at once — that part is never on the chain — and only the attach TRIGGER is", async () => {
    const game = await board().build();
    await game.p1.play("long");
    expect(game.zoneOf("long")).toBe("base"); // already in play
    const triggered = game.chain().filter((c) => c.triggered).map((c) => c.cardId);
    expect(triggered).toEqual(["long"]);
    expect(game.state("squire").attachments).toEqual([]); // not attached yet
  });

  test("killing the target in response to that trigger leaves the Quick-Draw gear unattached at base", async () => {
    const game = await board().build();
    await game.p1.play("long");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("squire");
    }
    await game.p1.passPriority();
    await game.p2.cast("snipe", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("long")).toBe("base");
    expect(game.state("long").attachedTo).toBeUndefined();
  });
});
