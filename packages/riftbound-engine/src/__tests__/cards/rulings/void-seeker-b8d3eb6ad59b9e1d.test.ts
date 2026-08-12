/**
 * Ruling b8d3eb6ad59b9e1d — Void Seeker (OGN-024 → ogn-024-298) [Action] "Deal 4 to a unit at a
 *   battlefield. Draw 1."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · "[Hidden] … If a friendly unit would die, kill this instead."
 *
 * Q: When a hidden PERMANENT is revealed as a reaction while a chain is open, can the other players react
 *    to it before it resolves?
 * A: No. Permanents do not linger on the chain: the revealed permanent is played and is off the chain at
 *    once, then priority passes so players may react to the OTHER cards still on the chain. You can never
 *    react to a permanent being played.
 * Rules: 354.3/419.1 (a permanent play is not a chain item), 811.6 (revealing a hidden card is a play),
 *        340.2 (priority passes after the play, never before it).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const ZHONYAS = "ogn-077-298";
const STUPEFY = "ogn-095-298"; // [Reaction] "Give a unit -1 [Might] this turn … Draw 1."

/** P1's turn. P2 holds bf1 with a Guard and a facedown Zhonya's Hourglass. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1, mind: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
    .facedown(P2, "bf1", ZHONYAS, "zhonya")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P1, STUPEFY, "stupefy");
}

describe("Ruling b8d3eb6ad59b9e1d — a hidden permanent revealed into a chain never sits on the chain", () => {
  test("setup: P1's [Action] starts the chain and P2 may answer it from their hidden card", async () => {
    const game = await board().build();
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    await game.p1.cast("seeker", { targets: "guard" });
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "zhonya")).toBe(true);
  });

  test("ruling: revealing the permanent puts it straight onto the board — the chain still holds only Void Seeker", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "guard" });
    await game.p1.passPriority();
    await game.p2.reveal("zhonya");

    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
    expect(game.chain().map((c) => c.cardId)).not.toContain("zhonya");
    expect(game.zoneOf("zhonya")).toBe("base"); // already in play
    expect(game.zoneOf("zhonya")).not.toBe("chain");
  });

  test("ruling: nobody can react to the permanent itself — priority is offered against the spell still on the chain", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "guard" });
    await game.p1.passPriority();
    await game.p2.reveal("zhonya");

    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    expect(d?.source?.cardId).toBe("seeker");
    expect(d?.source?.cardId).not.toBe("zhonya");
  });

  test("ruling: players may still react to the OTHER cards in the chain after the permanent has been played", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "guard" });
    await game.p1.passPriority();
    await game.p2.reveal("zhonya");

    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("stupefy", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "stupefy"]);

    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(4); // Void Seeker still resolved normally
    expect(game.zoneOf("zhonya")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
