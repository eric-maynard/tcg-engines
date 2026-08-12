/**
 * Ruling 3aca31b2940cb9a1 — Guardian Angel (SFD-051 → sfd-051-221) · Equipment · [2] · [Equip] [calm]
 *   "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *   × Brutalizer (SFD-042 → sfd-042-221) · Equipment · +1 Might — a second Equipment on the same unit.
 *
 * Q: Does the other equipment fall off when a unit "dies" but is saved by Guardian Angel?
 * A: No. Guardian Angel REPLACES the death event: the unit never dies and never leaves the board for
 *    the trash, so nothing detaches. It keeps its state — remaining equipment, buffs and all — and is
 *    simply healed, exhausted and recalled to base.
 * Rules: 371/372 (replacement effects replace the event entirely), 434.2 (an Equipment detaches when
 *        its holder leaves the board), 137.3 (a Recall is not a Move and is not a zone change off the board).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUARDIAN_ANGEL = "sfd-051-221";
const BRUTALIZER = "sfd-042-221";

/** P2's turn. P1 holds bf1 with a buffed 3-Might Knight wearing Guardian Angel AND a Brutalizer; P2's Bruiser (9) attacks. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Knight" }, "knight", { buffed: true, equippedWith: ["ga", "brut"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "knight" }, owner: P1, zone: "bf1" })
    .card("brut", { def: BRUTALIZER, meta: { attachedTo: "knight" }, owner: P1, zone: "bf1" })
    .unit(P2, "base", { might: 9, name: "Bruiser" }, "bruiser");
}

/** P2's Bruiser attacks bf1 and the combat resolves: the Knight takes lethal damage. */
async function attacked(): Promise<Game> {
  const game = await board().build();
  expect(game.state("knight").attachments.toSorted()).toEqual(["brut", "ga"]);
  await game.p2.move("bruiser", "bf1");
  await game.settle({ policy: "first" });
  return game;
}

describe("Ruling 3aca31b2940cb9a1 — a unit saved by Guardian Angel keeps its other equipment", () => {
  test("premise: the Knight is a 3-Might unit wearing two Equipment — 3 + 1 buff + 1 (Guardian Angel) + 1 (Brutalizer) = 6", async () => {
    const game = await board().build();
    expect(game.state("knight")).toMatchObject({ baseMight: 3, isBuffed: true });
    expect(game.state("knight").might).toBe(6);
  });

  test("ruling 3aca31b2940cb9a1 — lethal damage: Guardian Angel dies INSTEAD, and the Brutalizer is still attached to the Knight", async () => {
    const game = await attacked();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("knight")).not.toBe("trash");
    expect(game.state("brut").attachedTo).toBe("knight");
    expect(game.state("knight").attachments).toEqual(["brut"]);
    expect(game.violations()).toEqual([]);
  });

  test("the Knight never left the board: healed, exhausted and recalled to base with its buff intact (3 + 1 buff + 1 Brutalizer = 5)", async () => {
    const game = await attacked();
    expect(game.locationOf("knight")).toBe("base");
    expect(game.state("knight")).toMatchObject({ damage: 0, isBuffed: true, isExhausted: true });
    expect(game.state("knight").might).toBe(5); // 3 + 1 buff + 1 Brutalizer — only Guardian Angel's own +1 is gone
  });

  test("contrast — with no Guardian Angel the Knight really does die, and the Brutalizer falls off into P1's base", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Knight" }, "knight", { buffed: true, equippedWith: ["brut"] })
      .card("brut", { def: BRUTALIZER, meta: { attachedTo: "knight" }, owner: P1, zone: "bf1" })
      .unit(P2, "base", { might: 9, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "bf1");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("knight")).toBe("trash");
    expect(game.state("brut").attachedTo).toBeUndefined();
  });
});
