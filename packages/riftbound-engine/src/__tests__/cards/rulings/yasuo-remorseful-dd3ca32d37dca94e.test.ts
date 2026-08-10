/**
 * Ruling dd3ca32d37dca94e — Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might "When I attack, deal damage equal to my Might
 *     to an enemy unit here."
 *   × Nine-Tailed Fox (Ahri legend, OGN-255 → ogn-255-298) "When an enemy unit attacks a battlefield you control, give it
 *     -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × Discipline (OGN-058 → ogn-058-298) · [Reaction] · [2] "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Yasuo attacks a battlefield the Ahri player holds with a 4-Might unit. What is the initial-chain order, and can the
 *    defender play Discipline during it?
 * A: Yes. Attacker's triggers go on first, then the defender's; the defender then reacts to their own trigger with
 *    Discipline. LIFO: Discipline (unit → 6, draw 1) → Ahri (Yasuo → 5) → Yasuo (deals 5 to the defender, which survives at
 *    6). Chain empty → the attacker holds Focus. (The answer also muses that the attacker "would have priority" first.)
 * Rules: 464.2.e.1 (attacker's triggers first, defender's last), 337.4 / 340.4 (controller of the newest item gains
 *        Priority), 339–340 (LIFO), 464.2.d (attacker has Focus after the combat chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";
const NINE_TAILED_FOX = "ogn-255-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn (Yasuo player). P2 = Ahri legend, holds bf1 with a 4-Might Guardian, Discipline + exactly [2] in hand/pool. */
function board() {
  return scenario()
    .legend(P2, NINE_TAILED_FOX, "ahri")
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guardian" }, "guard")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .hand(P2, DISCIPLINE, "disc");
}

async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.state("guard").combatRole).toBe("defender");
  return game;
}

describe("Ruling dd3ca32d37dca94e — Yasuo attacks into Ahri's battlefield; Discipline on the initial chain", () => {
  test("steps 1–2: the initial chain is [Yasuo's attack trigger (P1, bottom, target locked on the Guardian), Ahri's trigger (P2, top)]", async () => {
    const game = await yasuoAttacks();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["guard"], triggered: true }),
      expect.objectContaining({ cardId: "ahri", controller: P2, triggered: true }),
    ]);
  });

  // The ruling's step 3 ("the defender has priority to react to their own trigger") is what CR 337.4/340.4 prescribe and
  // what the engine does. RULING-CONFLICT: its step 4 / nuance ("the Yasuo player would have priority to play a reaction
  // BEFORE Ahri can play Discipline") contradicts that; CR 337.4 says the controller of the newest chain item (Ahri's
  // trigger → P2) gains Priority first — engine follows CR.
  test("step 3: with the chain finalized, the DEFENDER (controller of the newest item) holds priority and may play Discipline onto the initial chain", async () => {
    const game = await yasuoAttacks();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]); // the attacker has nothing to do until priority reaches them
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "guard" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "ahri", "disc"]);
    // P2 added the item → P2 gets priority first again, then P1.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("step 5–6: LIFO — Discipline (Guardian 4 → 6, P2 draws 1) → Ahri (Yasuo 6 → 5) → Yasuo deals his CURRENT 5 to the Guardian, which survives at 6 with 5 damage; then the attacker holds Focus", async () => {
    const game = await yasuoAttacks();
    await game.p2.cast("disc", { targets: "guard" });
    const handBefore = game.p2.hand().length;

    // Everyone passes → Discipline resolves.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("guard").might).toBe(6);
    expect(game.p2.hand()).toHaveLength(handBefore + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "ahri"]);
    expect(game.state("yasuo").might).toBe(6);

    // → Ahri's trigger resolves.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    expect(game.state("yasuo").might).toBe(5);
    expect(game.state("guard").damage).toBe(0);

    // → Yasuo's trigger resolves: damage equal to his Might NOW (5), not 6.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard")).toMatchObject({ damage: 5, might: 6, zone: "battlefield-bf1" });

    // Chain fully resolved → the attacker holds Focus in the ongoing showdown.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, focusPlayer: P1 });
    expect(game.violations()).toEqual([]);
  });
});
