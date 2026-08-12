/**
 * Ruling 42e3c5066ad19cfd — (no reaction window for a unit/gear without a play trigger; no specific card)
 *   Stand-ins: an inline vanilla unit and Orb of Regret (OGN-090 → ogn-090-298) · gear · [1] · "[Exhaust]:
 *   Give a unit -1 [Might] this turn." (an ACTIVATED ability only) versus Lecturing Yordle (OGN-087 →
 *   ogn-087-298) "When you play me, draw 1." and Scrapheap (OGN-182 → ogn-182-298) "When this is played …
 *   draw 1." (play triggers).
 *
 * Q: Can you react when a gear or unit is played if it has no ability that happens immediately?
 * A: No. The play makes a chain item that resolves straight away — the permanent leaves the Chain and becomes
 *    a game object with no window in between. You CAN react when the card has a play trigger, because that
 *    trigger is a separate chain item that waits for priority.
 * Rules: 355.2 / 337 (playing a permanent: it resolves as the chain item it created), 383.2 (a play trigger
 *        is its own chain item), 332 (priority is only handed round while a chain item is pending).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ORB_OF_REGRET = "ogn-090-298"; // gear, activated ability only
const SCRAPHEAP = "ogn-182-298"; // gear with a "when this is played" trigger
const LECTURING_YORDLE = "ogn-087-298"; // unit with "when you play me, draw 1"

const VANILLA = { cardType: "unit", energyCost: 1, might: 2, name: "Footman" };

/** P1's turn with [4] and one of everything in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .hand(P1, VANILLA, "footman")
    .hand(P1, ORB_OF_REGRET, "orb")
    .hand(P1, SCRAPHEAP, "scrapheap")
    .hand(P1, LECTURING_YORDLE, "yordle");
}

describe("Ruling 42e3c5066ad19cfd — a unit or gear with no play trigger gives the opponent no window", () => {
  test("a vanilla unit: it is on the board the instant the play is made, the chain is empty, and play stays with me — P2 is never asked anything", async () => {
    const game = await board().build();
    await game.p1.play("footman");
    expect(game.zoneOf("footman")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.decision()).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("a gear whose only ability is activated (Orb of Regret) behaves the same — no chain, no priority for P2", async () => {
    const game = await board().build();
    await game.p1.play("orb");
    expect(game.zoneOf("orb")).toBe("base");
    expect(game.p1.gear()).toContain("orb");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("a unit WITH a play trigger does open the window: the trigger sits on the chain and P2 gets priority", async () => {
    const game = await board().build();
    await game.p1.play("yordle");
    expect(game.zoneOf("yordle")).toBe("base"); // the unit itself never waits
    expect(game.chain().map((c) => c.cardId)).toEqual(["yordle"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
  });

  test("so does a GEAR with a play trigger (Scrapheap): the reaction window exists because of the trigger, not because a permanent was played", async () => {
    const game = await board().build();
    await game.p1.play("scrapheap");
    expect(game.zoneOf("scrapheap")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["scrapheap"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
  });
});
