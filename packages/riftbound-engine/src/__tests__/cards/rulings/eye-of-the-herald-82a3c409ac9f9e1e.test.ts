/**
 * Ruling 82a3c409ac9f9e1e — Eye of the Herald (SFD-153 → sfd-153-221) · Equipment · Order · [1]
 *     "[Equip] [order] … When I move, play a 1 [Might] Recruit unit token here."
 *
 * Q: With Eye of the Herald, the token is played to the destination, right?
 * A: Yes. The equipment gives the ability to the wearer, so "here" is the wearer's own location — read when the
 *    trigger resolves, i.e. where it has just moved TO, never where it came from.
 * Rules: 150.2 / 718.3 (equipment text is the wearer's ability), 359.3.f ("here" resolved as the ability resolves),
 *        383 (the move trigger is a chain item that resolves after the move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EYE_OF_THE_HERALD = "sfd-153-221";

/** P1's turn. P1's Rider (3, [Ganking]) wears the Eye; P1 holds bf1 with an Anchor; bf2 is open. */
function board(riderAt: "base" | "bf1") {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 5, name: "Anchor" }, "anchor")
    .unit(P1, riderAt, { keywords: ["Ganking"], might: 3, name: "Rider" }, "rider", { equippedWith: ["eye"] } as Record<string, unknown>)
    .card("eye", {
      def: EYE_OF_THE_HERALD,
      meta: { attachedTo: "rider" } as Record<string, unknown>,
      owner: P1,
      zone: riderAt === "base" ? "base" : "battlefield-bf1",
    })
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 }).filter((id) => game.has(id) && game.zoneOf(id) !== "gone");

/** Resolve the single move trigger on the chain. */
async function resolveTrigger(game: Game): Promise<void> {
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rider", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
}

describe("Ruling 82a3c409ac9f9e1e — the Herald's Recruit token is played at the wearer's DESTINATION", () => {
  test("base → bf2: exactly one 1-[Might] Recruit token appears at bf2, and none is left behind in base", async () => {
    const game = await board("base").build();
    expect(game.state("rider").attachments).toEqual(["eye"]);
    await game.p1.move("rider", "bf2");
    await resolveTrigger(game);
    const made = recruits(game);
    expect(made).toHaveLength(1);
    expect(game.locationOf(made[0] as string)).toBe("bf2");
    expect(game.state(made[0] as string)).toMatchObject({ controller: P1, isToken: true, might: 1 });
    expect(game.p1.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("battlefield → battlefield (Ganking bf1 → bf2): the Recruit lands at bf2, the origin bf1 keeps only the Anchor", async () => {
    const game = await board("bf1").build();
    expect(game.locationOf("rider")).toBe("bf1");
    await game.p1.gank("rider", "bf2");
    await resolveTrigger(game);
    const made = recruits(game);
    expect(made).toHaveLength(1);
    expect(game.locationOf(made[0] as string)).toBe("bf2");
    expect(game.p1.units("bf1")).toEqual(["anchor"]);
    expect(game.p1.units("bf2").toSorted()).toEqual([made[0] as string, "rider"].toSorted());
    expect(game.violations()).toEqual([]);
  });

  test("battlefield → base: 'here' is then the base, so the Recruit is played into P1's base and bf1 gains nothing", async () => {
    const game = await board("bf1").build();
    await game.p1.move("rider", "base");
    await resolveTrigger(game);
    const made = recruits(game);
    expect(made).toHaveLength(1);
    expect(game.locationOf(made[0] as string)).toBe("base");
    expect(game.p1.units("bf1")).toEqual(["anchor"]);
    expect(game.violations()).toEqual([]);
  });
});
