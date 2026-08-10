/**
 * Ruling 7c9678def2ff06b4 — Not So Fast (SFD-045 → sfd-045-221) · Reaction [2][calm]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · Action [2][order] "Each player kills one of their units."
 *   (Cull sfd-134-221 is only a name collision in the ruling's card list.)
 *
 * Q: Can you Not So Fast a Cull the Weak?
 * A: No. Not So Fast needs an enemy spell/ability that CHOOSES a friendly unit or gear. Cull the Weak chooses
 *    nothing when played — each player performs "kill one of your units" as it resolves — so it is not a
 *    legal object for Not So Fast.
 * Rules: 355.5/355.9.b (what a spell "chooses" = its play-time targets), 422.1.a (each player kills their own),
 *        355.8 (no legal object → can't be played).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const CULL_THE_WEAK = "ogn-209-298";
const CHARM = "ogn-043-298"; // [1][calm] "Move an enemy unit." — a spell that DOES choose P1's unit (contrast)

/**
 * P2's turn. P1: Sentinel (3) at P1's bf1 and a Page (1) in base, Not So Fast in hand with exactly [2][calm].
 * P2: Runt (1) + Ogre (4) in base, Cull the Weak and Charm in hand, resources for either.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
    .unit(P1, "base", { might: 1, name: "Page" }, "page")
    .unit(P2, "base", { might: 1, name: "Runt" }, "runt")
    .unit(P2, "base", { might: 4, name: "Ogre" }, "ogre")
    .hand(P1, NOT_SO_FAST, "nsf")
    .hand(P2, CULL_THE_WEAK, "ctw")
    .hand(P2, CHARM, "charm");
}

/** P2 casts Cull the Weak naming nothing at play time and passes → P1 holds priority with it on the chain. */
async function cullPendingWithP1(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("ctw", { targets: [] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ctw", controller: P2, targets: [] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 7c9678def2ff06b4 — Not So Fast has no legal object in Cull the Weak", () => {
  test("Cull the Weak on the chain chose no unit: Not So Fast is NOT castable for P1 (affordable, but no legal object); forcing it fails", async () => {
    const game = await cullPendingWithP1();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    expect(game.p1.can("cast", "nsf")).toBe(false);
    expect(game.p1.option("cast", "nsf")).toBeUndefined();
    const r = await game.p1.try((p) => p.cast("nsf", { targets: "ctw" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctw"]);
  });

  test("Cull the Weak then resolves uncountered and the kills are chosen DURING RESOLUTION — each player picks one of their own units (P2: Runt/Ogre, P1: Page/Sentinel)", async () => {
    const game = await cullPendingWithP1();
    await game.p1.passPriority();
    let d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "target", source: { cardId: "ctw" } });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["ogre", "runt"]);
    await game.p2.pick("runt");
    d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "ctw" } });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["page", "sentinel"]);
    await game.p1.pick("page");
    await game.settle();
    expect(game.zoneOf("ctw")).toBe("trash");
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.zoneOf("page")).toBe("trash");
    expect(game.zoneOf("ogre")).toBe("base");
    expect(game.zoneOf("sentinel")).toBe("battlefield-bf1");
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: P2's Charm CHOOSES P1's Sentinel → Not So Fast is castable, is offered exactly that spell, and counters it (Sentinel stays put)", async () => {
    const game = await board().build();
    await game.p2.cast("charm", { targets: "sentinel" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bf2");
    }
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "nsf")).toBe(true);
    const offered = (game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["charm"]);
    await game.p1.cast("nsf", { targets: "charm" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("sentinel")).toBe("bf1");
  });
});
