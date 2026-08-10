/**
 * Ruling 952476bd4f08cd74 — Star-Crossed (UNL-128 → unl-128-219) · Reaction · Chaos · 3+[chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Sacrifice (UNL-173 → unl-173-219) · Reaction · Order · 1 "As an additional cost to play this, kill a friendly [Mighty]
 *     unit. Draw 2 and channel 1 rune exhausted."
 *   ("my Glasc" = Glasc Mixologist sfd-165-221, 5 Might — Mighty, so a legal Sacrifice cost.)
 *
 * Q: Opponent Star-Crosses my Glasc (plus one of their units); I respond by Sacrificing the Glasc. Does their own unit still
 *    bounce, or does Star-Crossed fizzle?
 * A: It still resolves as much as it can. Sacrifice (top) resolves first: I draw 2 and channel 1. Then Star-Crossed: the Glasc
 *    is in the trash → that instruction is skipped, but their unit is still a legal target and returns to their hand.
 * Rules: 359.3.e.1 / 359.3.e.5 (illegal target → ignore just that part; spells don't fizzle), 340 (LIFO), 356 (Sacrifice's
 *        kill is a cost paid on finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const SACRIFICE = "unl-173-219";
const GLASC = "sfd-165-221"; // Glasc Mixologist, 5 Might

/**
 * P2's turn (the Star-Crossed player) with exactly 3+[chaos]; P2's Drifter (3) at P2's bf2. P1 holds bf1 with Glasc Mixologist
 * (5) and has Sacrifice + exactly [1]; P1's trash is empty (so the Glasc's optional Deathknell has nothing to fetch).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", GLASC, "glasc")
    .unit(P2, "bf2", { might: 3, name: "Drifter" }, "drifter")
    .hand(P2, STAR_CROSSED, "sc")
    .hand(P1, SACRIFICE, "sac");
}

/** P2 casts Star-Crossed [Drifter (friendly), Glasc (enemy)] and passes; P1 answers with Sacrifice killing the Glasc. */
async function starCrossedThenSacrifice(): Promise<Game> {
  const game = await board().build();
  expect(game.state("glasc").might).toBe(5);
  await game.p2.cast("sc", { targets: ["drifter", "glasc"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P2, targets: ["drifter", "glasc"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "sac")).toBe(true);
  await game.p1.cast("sac", { sacrifice: "glasc" });
  // Glasc's own "[Deathknell] — You may play a unit … from your trash": nothing eligible; decline if asked.
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.seat === P1 && (d.kind === "yes-no" || (d.kind === "pick" && d.allowDecline))) {
      await game.p1.decline().catch(async () => game.p1.no());
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 952476bd4f08cd74 — Sacrificing the Star-Crossed target: Star-Crossed still bounces the caster's own unit", () => {
  test("Sacrifice's cost kills the Glasc at once (trash) and Sacrifice sits ABOVE Star-Crossed on the chain", async () => {
    const game = await starCrossedThenSacrifice();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("glasc")).toBe("trash");
    const live = game.chain().filter((c) => !c.triggered).map((c) => c.cardId);
    expect(live).toEqual(["sc", "sac"]); // bottom → top
  });

  test("LIFO: Sacrifice resolves first — P1 draws 2 and channels 1 rune exhausted — while Star-Crossed is still waiting", async () => {
    const game = await starCrossedThenSacrifice();
    const hand = game.p1.hand().length;
    // Resolve items until only Star-Crossed remains.
    for (let i = 0; i < 8 && game.chain().some((c) => c.cardId !== "sc"); i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d?.seat === P1 && d.kind !== "action") {
        await game.p1.decline().catch(async () => game.p1.no());
      } else {
        break;
      }
    }
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.state(game.p1.runes()[0] as string).isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc"]);
    expect(game.zoneOf("drifter")).toBe("battlefield-bf2"); // not bounced yet
  });

  test("then Star-Crossed resolves as much as it can: the Glasc (in the trash) is NOT returned to P1's hand, but P2's Drifter IS returned to P2's hand; Star-Crossed goes to the trash normally (no fizzle)", async () => {
    const game = await starCrossedThenSacrifice();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(game.p1.hand()).not.toContain("glasc");
    expect(game.zoneOf("drifter")).toBe("hand");
    expect(game.p2.hand()).toContain("drifter");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
