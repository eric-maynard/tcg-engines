/**
 * Ruling 6c759a7417790579 — Bellows Breath (SFD-080 → sfd-080-221) · Mind Action · [1][mind] · [Repeat][1][mind]
 *     "Deal 1 to up to three units at the same location."
 *   × Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · [2] · 2 Might · [Hidden] "When you play me, you may choose a unit you
 *     control at another location. Move me to its location and it to my original location."
 *
 * Q: Opponent Bellows-Breaths my unit in base. I react with a hidden Tideturner at a battlefield, swapping it with the
 *    targeted unit. Does the targeted unit still take the damage?
 * A: Yes. "At the same location" is a targeting restriction checked when the spell goes on the chain, not on resolution.
 *    Tideturner's play trigger resolves first and swaps them; Bellows Breath then tracks its target to the battlefield and
 *    deals the 1.
 * Rules: 355.8/355.9 (targeting restrictions at selection), 359.3.e (a target that merely moved between board locations
 *        stays legal), 811 (hidden ⇒ Reaction play), 383 (play trigger on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const TIDETURNER = "ogn-199-298";

/**
 * P2's turn 3 with exactly [1][mind]. P1: 3-Might Target and 3-Might Bystander in base; P1 holds bf1 with a 4-Might Guard and
 * a Tideturner facedown there (hidden earlier).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .facedown(P1, "bf1", TIDETURNER, "tide")
    .unit(P1, "base", { might: 3, name: "Target" }, "target")
    .unit(P1, "base", { might: 3, name: "Bystander" }, "by")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onl")
    .hand(P2, BELLOWS_BREATH, "bb");
}

/** P2 casts Bellows Breath at the Target (in base) and passes; P1 reveals Tideturner at bf1, opts in and picks the Target; the trigger resolves. */
async function breathThenTideSwap(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("bb", { targets: ["target"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bb", controller: P2, targets: ["target"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "tide")).toBe(true);
  await game.p1.reveal("tide");
  expect(game.locationOf("tide")).toBe("bf1"); // enters where it was hidden
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["by", "target"]); // "at another location" — not the Guard
  await game.p1.pick("target");
  expect(game.chain().map((c) => c.cardId)).toEqual(["bb", "tide"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Tideturner's trigger resolves: the swap
  return game;
}

describe("Ruling 6c759a7417790579 — Tideturner swaps the Bellows Breath target out of base; it still takes the damage", () => {
  test("premise: 'at the same location' is enforced at CAST time — Target + Guard (base + bf1) is not an offered target set, Target + Bystander (both base) is", async () => {
    const game = await board().build();
    const sets = (game.p2.option("cast", "bb")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    const norm = sets.map((s) => [...s].toSorted().join("+"));
    expect(norm).toContain("target");
    expect(norm).toContain("by+target");
    expect(norm).not.toContain("guard+target");
  });

  test("Tideturner (played from hidden as a Reaction, [0]) resolves first: Tideturner is now in P1's base and the Target stands at bf1 — Bellows Breath still pending with its ORIGINAL target", async () => {
    const game = await breathThenTideSwap();
    expect(game.locationOf("tide")).toBe("base");
    expect(game.locationOf("target")).toBe("bf1");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bb", targets: ["target"] })]);
    expect(game.state("target").damage).toBe(0);
  });

  test("ruling: Bellows Breath then resolves and TRACKS the Target to bf1 — it takes 1; nothing else (Bystander, Tideturner, Guard) is touched", async () => {
    const game = await breathThenTideSwap();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.state("target")).toMatchObject({ damage: 1, location: "bf1" });
    expect(game.state("by").damage).toBe(0);
    expect(game.state("tide").damage).toBe(0);
    expect(game.state("guard").damage).toBe(0);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
