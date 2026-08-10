/**
 * Ruling 499dbe229ed8051c — Mirror Image (UNL-200 → unl-200-219) · Spell · [3][rainbow][rainbow]
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Reflection token (UNL-T06 → unl-t06)
 *   (+ Trinity Force sfd-115-221 "[Equip] [body] … (+2)" as the attached Equipment.)
 *
 * Q: If I Mirror Image a unit wearing an Equipment, does the Reflection get the Equipment's Might too?
 * A: No. A copy takes only copyable traits (printed name/Might/text). Attached gear and buffs are not copied: the token has
 *    no Equipment attached and none of its Might bonus.
 * Rules: 477.1 (copyable characteristics), 719 (Equipment bonus applies to the unit it is attached to), FAQ #10239/#9410.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const TRINITY_FORCE = "sfd-115-221";

/** P1's turn. P1: 2-Might Bearer + loose Trinity Force in base; [body] for the Equip and [3]+2 rainbow for Mirror Image. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 1, rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Bearer" }, "bearer")
    .gear(P1, TRINITY_FORCE, "tf");
}

async function equipAndMirror(): Promise<{ game: Game; token: string }> {
  const game = await board().hand(P1, MIRROR_IMAGE, "mirror").build();
  await game.p1.choose("equipCard", { params: { equipmentId: "tf", unitId: "bearer" } });
  await game.settle();
  expect(game.state("bearer")).toMatchObject({ attachments: ["tf"], baseMight: 2, might: 4 });
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: "bearer" });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const fresh = game.p1.base().filter((id) => !before.includes(id) && game.state(id).isToken);
  expect(fresh).toHaveLength(1);
  return { game, token: fresh[0] as string };
}

describe("Ruling 499dbe229ed8051c — a Mirror Image Reflection copies printed traits only, not attached Equipment or its Might", () => {
  test("the Reflection is a ready 'Bearer' copy in base with Temporary — at the PRINTED 2 Might, not the equipped 4", async () => {
    const { game, token } = await equipAndMirror();
    expect(game.state(token)).toMatchObject({ isReady: true, isToken: true, location: "base", might: 2, name: "Bearer" });
    expect(game.state(token).keywords).toContain("Temporary");
  });

  test("nothing is attached to the token; Trinity Force stays on the original Bearer, which keeps its 4 Might", async () => {
    const { game, token } = await equipAndMirror();
    expect(game.state(token).attachments).toEqual([]);
    expect(game.state("tf").attachedTo).toBe("bearer");
    expect(game.state("bearer")).toMatchObject({ attachments: ["tf"], might: 4 });
    expect(game.violations()).toEqual([]);
  });
});
