/**
 * Ruling 3f25b8f45a9f9735 — ("when you play me" survives the unit's death; no specific card)
 *   Stand-ins: Lecturing Yordle (OGN-087 → ogn-087-298) · [3] · 2 [Might] · "[Tank] … When you play me, draw 1."
 *   and Teemo, Scout (OGN-197 → ogn-197-298) · [2] · 1 [Might] · "When you play me, give me +3 [Might] this
 *   turn." — killed in response by Flurry of Blades (OGN-133 → ogn-133-298) · [Reaction] [1] "Deal 1 to all
 *   units at battlefields."
 *
 * Q: Do "when you play me" abilities still resolve if the unit is killed by a reaction to the ability?
 * A: Yes. The trigger is its own chain item and resolves even though its source is gone. Only the parts that
 *    point back at the unit itself ("me", "here") have nothing left to act on and do nothing.
 * Rules: 383.2 (a trigger is an independent chain item), 359.3.e (an effect's objects are re-checked at
 *        resolution; missing ones are skipped), 340 (LIFO: the reaction resolves before the trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LECTURING_YORDLE = "ogn-087-298";
const TEEMO_SCOUT = "ogn-197-298";
const FLURRY_OF_BLADES = "ogn-133-298";

/** P1's turn. P1 holds bf1 with a sturdy Garrison (5); P2 sits on two Flurries and [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Garrison" }, "garrison")
    .hand(P2, FLURRY_OF_BLADES, "flurry1")
    .hand(P2, FLURRY_OF_BLADES, "flurry2");
}

/** P1 plays the Yordle at bf1; P2 answers its trigger with two Flurries (2 damage kills the 2-Might Yordle). */
async function yordleKilledInResponse(): Promise<Game> {
  const game = await board().hand(P1, LECTURING_YORDLE, "yordle").build();
  const handBefore = game.p1.hand().length;
  await game.p1.play("yordle", { to: "bf1" });
  expect(game.zoneOf("yordle")).toBe("battlefield-bf1"); // the unit itself resolved at once
  expect(game.chain().map((c) => c.cardId)).toEqual(["yordle"]); // only its trigger is pending
  expect(game.chain()[0]?.triggered).toBe(true);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", seat: P2 }); // the window the trigger opened
  await game.p2.cast("flurry1");
  await game.p2.cast("flurry2");
  await game.settle();
  expect(handBefore).toBe(1);
  return game;
}

describe("Ruling 3f25b8f45a9f9735 — a play trigger resolves even when the reaction to it kills the unit", () => {
  test("the two Flurries resolve first and kill the 2-Might Yordle — yet its 'draw 1' still resolves and P1 draws", async () => {
    const game = await yordleKilledInResponse();
    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1); // the Yordle left hand, the trigger's draw replaced it
    expect(game.chain()).toEqual([]);
    expect(game.state("garrison")).toMatchObject({ damage: 2, might: 5 }); // the Flurries hit it too; 2 < 5, it lives
    expect(game.violations()).toEqual([]);
  });

  test("the part that points back at the dead unit does nothing: Teemo's 'give ME +3' finds no Teemo, and nothing else happens", async () => {
    const game = await board().hand(P1, TEEMO_SCOUT, "teemo").build();
    await game.p1.play("teemo", { to: "bf1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo"]);
    await game.p1.passPriority();
    await game.p2.cast("flurry1"); // 1 damage kills the 1-Might Teemo
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.state("teemo").might).toBe(1); // no +3 was applied to anything
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control facet — unopposed, the same play trigger simply resolves: the Yordle lives and P1 draws", async () => {
    const game = await board().hand(P1, LECTURING_YORDLE, "yordle").build();
    await game.p1.play("yordle", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("yordle")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(1);
  });
});
