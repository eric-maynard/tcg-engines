/**
 * Ruling 866bc9e5b6350a06 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · [6][calm][calm] · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Shakedown (OGN-033 → ogn-033-298) · [2][fury] · Reaction — the answer that kills Yasuo on the chain.
 *
 * Q: Does Riftbound have last-known information? If Yasuo's attack trigger is on the chain and he is killed first,
 *    does it deal damage based on his Might when he died, when it triggered, or none at all?
 * A: There is no last-known information. "Here" and "my Might" are read at RESOLUTION from the source as it is then.
 *    With Yasuo gone the ability cannot evaluate and deals 0.
 * Rules: 359.3.e (a resolving ability reads the game state as it is at resolution), 129 ("here" = the source's
 *        current location), 417.1.e (an amount of 0 or less deals nothing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";
const SHAKEDOWN = "ogn-033-298";

/** P1's turn. P2 durably holds bf1 with a 12-Might Colossus (survives Yasuo's 6) and has Shakedown + [2][fury];
 *  P1's Yasuo waits ready in base. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 12, name: "Colossus" }, "colossus")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .hand(P2, SHAKEDOWN, "shake");
}

describe("Ruling 866bc9e5b6350a06 — no last-known information: a dead Yasuo's attack trigger deals 0", () => {
  test("premise: attacking puts the trigger on the chain with the Colossus bound — nothing has been dealt yet", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", targets: ["colossus"], triggered: true })]);
    expect(game.state("colossus").damage).toBe(0);
  });

  test("control — undisturbed, the trigger resolves off the live Yasuo and puts his full 6 Might onto the Colossus", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    expect(game.state("colossus").damage).toBe(6);
  });

  test("ruling: P2 Shakedowns Yasuo for 6 in response — he dies, and the still-pending trigger then resolves for NOTHING (not 6, not his Might at death)", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("shake", { targets: "yasuo" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    // Shakedown's menu belongs to Yasuo's controller — P1 takes the 6.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "mode" });
    await game.p1.pick("1");
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.chain()).toHaveLength(1); // the attack trigger is still there
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("colossus").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("and the whole exchange ends with P2 keeping bf1 — the attacker is gone and the Colossus was never touched", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("shake", { targets: "yasuo" });
    await game.settle();
    await game.p1.pick("1");
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
  });
});
