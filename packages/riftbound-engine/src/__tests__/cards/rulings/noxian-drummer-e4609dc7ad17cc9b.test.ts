/**
 * Ruling e4609dc7ad17cc9b — Noxian Drummer (OGN-222 → ogn-222-298) · 3 Might "When I move to a battlefield, play a 1 [Might]
 *     Recruit unit token here."
 *   × Rockfall Path (SFD-216 → sfd-216-221) Battlefield "Units can't be played here."
 *
 * Q: If Noxian Drummer moves to Rockfall Path, does her ability still play the Recruit token there?
 * A: No. "Units can't be played here" beats "play a … unit token here" (can't beats can): no token is played there.
 * Rules: 003 / "can't beats can", 359.3.e.6 (an impossible instruction is skipped), 143 (tokens are played like units).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const NOXIAN_DRUMMER = "ogn-222-298";
const ROCKFALL_PATH = "sfd-216-221";

const allUnits = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) => [...game.p1.units(), ...game.p2.units()];

describe("Ruling e4609dc7ad17cc9b — Noxian Drummer's Recruit is not played at Rockfall Path", () => {
  test("moving the Drummer to (live) Rockfall Path: her trigger goes on the chain and resolves, but NO Recruit token is created — not at the Path, not in base", async () => {
    const game = await scenario()
      .battlefield("path", { controller: null, def: ROCKFALL_PATH, inert: false })
      .unit(P1, "base", NOXIAN_DRUMMER, "drummer")
      .build();
    const unitsBefore = allUnits(game).length;
    await game.p1.move("drummer", "path");
    expect(game.locationOf("drummer")).toBe("path"); // moving there is fine — only PLAYING units is forbidden
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.units("path")).toEqual(["drummer"]);
    expect(game.p1.units("base")).toEqual([]);
    expect(allUnits(game)).toHaveLength(unitsBefore); // no token anywhere
    expect(allUnits(game).some((u) => game.state(u).isToken)).toBe(false);
    expect(game.gameState.battlefields.path?.controller).toBe(P1); // she still takes the empty battlefield
    expect(game.violations()).toEqual([]);
  });

  test("control: the same move to an ordinary battlefield DOES play the 1-Might Recruit token there", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", NOXIAN_DRUMMER, "drummer").build();
    await game.p1.move("drummer", "bf1");
    await game.settle();
    const here = game.p1.units("bf1");
    expect(here).toHaveLength(2);
    const token = here.find((u) => u !== "drummer") as string;
    expect(game.state(token)).toMatchObject({ isToken: true, might: 1, name: "Recruit" });
  });
});
