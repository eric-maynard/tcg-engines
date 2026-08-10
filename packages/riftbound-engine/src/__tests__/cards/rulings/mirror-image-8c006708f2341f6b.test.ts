/**
 * Ruling 8c006708f2341f6b — Mirror Image (UNL-200 → unl-200-219) · Action [3][rainbow][rainbow]
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Reflection (UNL-T06 → unl-t06) token "(I become a copy of something when played. I don't get that card's play effects.)"
 *   (+ Guardian Angel sfd-051-221, Equipment +1 Might, as the attached Gear.)
 *
 * Q: Does Mirror Image copy Gear?
 * A: No. A copy takes only the copyable traits (printed characteristics such as Might, and rules text). Attached Gear is a
 *    separate object, not a trait — the Reflection enters without it (and without its Might bonus).
 * Rules: 477 (copy effects — copyable values), 718 (attached Equipment is its own game object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const GUARDIAN_ANGEL = "sfd-051-221";

/** P1's turn with exactly [3] + rainbow×2. P1's Knight (printed 3) in base wears a Guardian Angel (+1 ⇒ 4). */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "knight" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P1, MIRROR_IMAGE, "mirror");
}

/** Cast Mirror Image on the Knight, resolve, return the Reflection's id. */
async function reflect(game: Game): Promise<string> {
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: "knight" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const fresh = game.p1.base().filter((id) => !before.includes(id) && game.state(id).isToken);
  expect(fresh).toHaveLength(1);
  return fresh[0] as string;
}

describe("Ruling 8c006708f2341f6b — Mirror Image's Reflection does not copy attached Gear", () => {
  test("premise: the Knight is 3 printed + 1 from the attached Guardian Angel = 4", async () => {
    const game = await board().build();
    expect(game.state("knight")).toMatchObject({ attachments: ["ga"], baseMight: 3, might: 4 });
    expect(game.state("ga").attachedTo).toBe("knight");
  });

  test("the Reflection copies the Knight's PRINTED traits (name, 3 Might) but enters with NO Gear attached — 3 Might, not 4; the Guardian Angel stays on the Knight", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    expect(game.state(tok)).toMatchObject({ controller: P1, isToken: true, name: "Knight", zone: "base" });
    expect(game.state(tok).attachments).toEqual([]);
    expect(game.state(tok).might).toBe(3);
    expect(game.state(tok).keywords).toContain("Temporary");
    // The Gear is a separate object and did not move or duplicate.
    expect(game.state("ga").attachedTo).toBe("knight");
    expect(game.state("knight")).toMatchObject({ attachments: ["ga"], might: 4 });
    expect(game.findAll({ defId: GUARDIAN_ANGEL })).toEqual(["ga"]);
    expect(game.violations()).toEqual([]);
  });
});
