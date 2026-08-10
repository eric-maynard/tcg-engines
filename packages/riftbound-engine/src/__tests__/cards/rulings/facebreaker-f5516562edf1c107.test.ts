/**
 * Ruling f5516562edf1c107 — Facebreaker (OGN-220 → ogn-220-298) · [Hidden] Action [2]
 *     "Stun a friendly unit and an enemy unit at the same battlefield."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) "When a player chooses a friendly unit here with a spell for the first time each
 *     turn, they draw 1."   × Void Seeker (OGN-024 → ogn-024-298) Action [3][fury] "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: My only unit sits alone at the Dreaming Tree with Facebreaker hidden there. The opponent Void Seekers it. Can I flip
 *    Facebreaker in response (to fish for the Tree's draw)?
 * A: No. Facebreaker needs TWO legal targets at the same location — a friendly unit AND an enemy unit — and only one unit is
 *    there. Targeting requirements must be met before it can be finalized, so it cannot be played at all; no Tree draw.
 * Rules: 355.8 (a spell needs legal targets for every required choice), 811.1 (hidden ⇒ Reaction, "here"), 383.4.b.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const DREAMING_TREE = "ogn-292-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn 3. P1 controls the live Dreaming Tree with a lone Guard (5) and Facebreaker facedown there. P2: Void Seeker + [3][fury]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
    .unit(P1, "tree", { might: 5, name: "Guard" }, "guard")
    .facedown(P1, "tree", FACEBREAKER, "fb")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P2, VOID_SEEKER, "vs")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

async function seekerAtGuard(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("vs", { targets: "guard" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling f5516562edf1c107 — a hidden Facebreaker can't be flipped with only one unit at its battlefield", () => {
  test("in response to Void Seeker, P1 has priority but 'reveal Facebreaker' is NOT a legal action: no enemy unit at the Tree (355.8)", async () => {
    const game = await seekerAtGuard();
    expect(game.zoneOf("fb")).toBe("facedown-tree");
    expect(game.p1.can("reveal", "fb")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("fb", { targets: ["guard"] }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
    expect(game.zoneOf("fb")).toBe("facedown-tree");
  });

  test("so nothing triggers the Tree for P1: Void Seeker resolves (4 to Guard, P2 draws 1), P1 draws nothing, Facebreaker stays facedown", async () => {
    const game = await seekerAtGuard();
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("guard").damage).toBe(4);
    expect(game.zoneOf("guard")).toBe("battlefield-tree");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("fb")).toBe("facedown-tree");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with an enemy unit also at the Tree, the same flip IS legal in that window", async () => {
    const game = await board().unit(P2, "tree", { might: 1, name: "Intruder" }, "intruder").build();
    // (an enemy unit sharing the Tree with Guard outside combat is unusual but sufficient to show the target requirement)
    await game.p2.cast("vs", { targets: "guard" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "fb")).toBe(true);
  });
});
