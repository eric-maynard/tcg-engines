/**
 * Ruling 0d1311c1fd188f64 — Eye of the Herald (SFD-153 → sfd-153-221) · Equipment · Order · +0 — the wearer gains
 *   "When I move, play a 1 [Might] Recruit unit token here."
 *   × Gust (ogn-169-298) · Reaction · [1] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand." (nuance)
 *
 * Q: Does the Recruit spawn at the location moved TO or moved FROM?
 * A: The destination. "Here" is the wearer's location when the trigger RESOLVES (its new location). If the wearer is no
 *    longer on the board by then (bounced/killed in response), "here" finds nothing and no token is made.
 * Rules: 150.2 / 718.3 (Effect text is the wearer's own ability), 359.3.f ("here" read on resolution), 359.3.f.2.a (null
 *        referent → instruction ignored), 383 (the move trigger is a chain item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EYE_OF_THE_HERALD = "sfd-153-221";
const GUST = "ogn-169-298";

/** P1's turn. P1's Ganking Rider (3) wears the Eye; P1 holds bf1 with an Anchor; bf2 is open. P2 has Gust + [1]. */
function board(riderAt: "base" | "bf1") {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 5, name: "Anchor" }, "anchor")
    .unit(P1, riderAt, { keywords: ["Ganking"], might: 3, name: "Rider" }, "rider", { equippedWith: ["eye"] } as Record<string, unknown>)
    .card("eye", { def: EYE_OF_THE_HERALD, meta: { attachedTo: "rider" } as Record<string, unknown>, owner: P1, zone: riderAt === "base" ? "base" : "battlefield-bf1" })
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .hand(P2, GUST, "gust");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 }).filter((id) => game.has(id) && game.zoneOf(id) !== "gone");

async function resolveTrigger(game: Game): Promise<void> {
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rider", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Ruling 0d1311c1fd188f64 — the Herald's Recruit appears where the wearer moved TO", () => {
  test("base → bf2: the move trigger goes on the chain; on resolution exactly one Recruit token is played AT bf2 (the destination) — none in base (the origin)", async () => {
    const game = await board("base").build();
    expect(game.state("rider").attachments).toEqual(["eye"]);
    await game.p1.move("rider", "bf2");
    await resolveTrigger(game);
    const made = recruits(game);
    expect(made).toHaveLength(1);
    expect(game.locationOf(made[0] as string)).toBe("bf2");
    expect(game.state(made[0] as string)).toMatchObject({ isToken: true, might: 1 });
    expect(game.p1.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("battlefield → battlefield (Ganking bf1 → bf2): the Recruit is played at bf2, NOT left behind at bf1", async () => {
    const game = await board("bf1").build();
    expect(game.locationOf("rider")).toBe("bf1");
    await game.p1.gank("rider", "bf2");
    await resolveTrigger(game);
    const made = recruits(game);
    expect(made).toHaveLength(1);
    expect(game.locationOf(made[0] as string)).toBe("bf2");
    expect(game.p1.units("bf1")).toEqual(["anchor"]); // nothing spawned at the origin
    expect(game.p1.units("bf2").sort()).toEqual([made[0] as string, "rider"].sort());
  });

  test("nuance: P2 Gusts the Rider in response — Gust resolves first (Rider to hand, Eye falls off), then the trigger finds no 'here' → NO Recruit anywhere", async () => {
    const game = await board("base").build();
    await game.p1.move("rider", "bf2");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "rider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rider", "gust"]);
    await game.settle();
    expect(game.zoneOf("rider")).toBe("hand");
    expect(game.state("eye")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
