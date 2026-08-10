/**
 * Ruling 0ed6af2310b64a20 — Hostile Takeover (SFD-202 → sfd-202-221)
 *   "[Hidden] Take control of an enemy unit at a battlefield. Ready it. … Lose control of that unit and
 *    recall it at end of turn."
 *   × Hidden Blade (OGN-213 → ogn-213-298) "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: On my turn I attack a battlefield; the opponent flips a hidden Hostile Takeover on my attacker. After
 *    it resolves they try to sacrifice/kill my (now their) unit while the showdown is still open. Legal?
 * A: Yes. After Hostile Takeover resolves and the chain empties the showdown is back in its Open state;
 *    with Focus the opponent may play an Action/Reaction such as Hidden Blade on the unit they now control,
 *    and since they control it when the kill resolves, "its controller draws 2" pays THEM.
 * Rules: 811 (play from Hidden), 346 / 347 (Focus in an open showdown; Action timing there), 359.3.e.14
 *        ("its controller" read at resolution), 428.2 (killed → owner's trash), 455 (temporary control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P1's turn 3. P2 holds bf1 with Defender (4) and hid Hostile Takeover there earlier. P1's Attacker (3) is
 * in base. P2 holds Hidden Blade in hand with exactly [2][order].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Defender" }, "def")
    .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
    .facedown(P2, "bf1", HOSTILE_TAKEOVER, "ht")
    .hand(P2, HIDDEN_BLADE, "blade");
}

/** P1 attacks bf1 and passes Focus; P2 flips Hostile Takeover on the Attacker; it resolves. */
async function takenOver(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("atk", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.p2.can("reveal", "ht")).toBe(true);
  await game.p2.reveal("ht", { answers: ["atk"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ht", controller: P2 })]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 0ed6af2310b64a20 — after a hidden Hostile Takeover, killing the taken unit in the still-open showdown is legal", () => {
  test("Hostile Takeover resolved: P2 now controls the (readied) Attacker — owner still P1 — and the showdown is OPEN again (no chain, still contested, a Focus decision pending)", async () => {
    const game = await takenOver();
    expect(game.state("atk")).toMatchObject({ controller: P2, isReady: true, location: "bf1", owner: P1 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    const d = game.decision();
    expect(d).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.isOver()).toBe(false);
  });

  test("ruling 0ed6af2310b64a20 — when P2 holds Focus in that open showdown, Hidden Blade (an [Action]) is LEGAL and the taken Attacker is a legal target for it", async () => {
    const game = await takenOver();
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "blade")).toBe(true);
    const targets = (game.p2.option("cast", "blade")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toContain("atk");
  });

  test("ruling 0ed6af2310b64a20 — P2 Hidden-Blades the unit it took: it is killed into its OWNER's (P1's) trash and 'its controller draws 2' pays P2, who controlled it at that moment; P1 draws nothing", async () => {
    const game = await takenOver();
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("blade", { targets: "atk" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.p1.trash()).toContain("atk");
    expect(game.p2.trash()).not.toContain("atk");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 2); // spent the Blade, drew 2
    expect(game.p1.hand()).toHaveLength(p1Hand);
    // The showdown then closes with P2 still holding bf1; nobody scored.
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
