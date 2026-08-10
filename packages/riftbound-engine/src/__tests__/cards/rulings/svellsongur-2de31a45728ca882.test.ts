/**
 * Ruling 2de31a45728ca882 — Svellsongur (sfd-059-221) × Trinity Force (sfd-115-221)
 *   Svellsongur: "[Equip] [1][calm]. As this is attached to a unit, copy that unit's text to this Equipment's
 *                 effect text for as long as this is attached to it." (+0)
 *   Trinity Force: "[Equip] [body]. When I hold, score 1 point." (+2, Effect Text conferred on the wearer)
 *
 * Q: Does Svellsongur copy abilities ADDED to a unit by other equipment's Effect Text (e.g. Trinity Force)?
 * A: No — Svellsongur copies only the unit's PRINTED text, never text conferred by other Equipment, so the
 *    order in which equipment was attached never matters.
 * Rules: 136.2 (effect text is conferred, not printed), 719.1; Riot day-0 red-text clarification.
 *
 * Oracle: a vanilla Holder wearing Trinity Force scores 2 on a Hold (1 Hold + 1 TF effect). If Svellsongur
 * also copied TF's conferred "When I hold, score 1 point." the Hold would be worth 3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const TRINITY_FORCE = "sfd-115-221";

async function equip(game: Game, equipmentId: string, unitId: string): Promise<void> {
  await game.p1.choose("equipCard", { params: { equipmentId, unitId } });
  await game.settle();
}

function board() {
  return scenario()
    .victoryScore(8)
    .resources(P1, { energy: 1, power: { body: 1, calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .gear(P1, TRINITY_FORCE, "tf")
    .gear(P1, SVELLSONGUR, "sv");
}

async function holdOnce(game: Game): Promise<void> {
  await game.advanceTurn(); // → P2
  expect(game.p1.points()).toBe(0);
  await game.advanceTurn(); // → P1: Beginning phase Hold at bf1 + any hold triggers
  expect(game.turnPlayer()).toBe(P1);
}

describe("Ruling 2de31a45728ca882 — Svellsongur copies printed text only, not other equipment's Effect Text", () => {
  test("control: a vanilla Holder wearing only Trinity Force scores 2 on its Hold (Hold + TF's conferred trigger)", async () => {
    const game = await board().build();
    await equip(game, "tf", "holder");
    expect(game.state("tf").attachedTo).toBe("holder");
    expect(game.state("holder").might).toBe(4);
    await holdOnce(game);
    expect(game.p1.points()).toBe(2);
  });

  test("Trinity Force attached FIRST, then Svellsongur: the Hold is still worth exactly 2 — Svellsongur did not copy TF's 'When I hold, score 1 point.'", async () => {
    const game = await board().build();
    await equip(game, "tf", "holder");
    await equip(game, "sv", "holder");
    expect(game.state("holder").attachments.toSorted()).toEqual(["sv", "tf"]);
    expect(game.state("sv").meta.copiedFromCardId).toBe("holder");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, calm: 0 } });
    await holdOnce(game);
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("Svellsongur attached FIRST, then Trinity Force: same result (2) — equipment order does not matter", async () => {
    const game = await board().build();
    await equip(game, "sv", "holder");
    await equip(game, "tf", "holder");
    expect(game.state("holder").attachments.toSorted()).toEqual(["sv", "tf"]);
    await holdOnce(game);
    expect(game.p1.points()).toBe(2);
  });
});
