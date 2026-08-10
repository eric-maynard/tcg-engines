/**
 * Ruling 4393d73efcee9bb9 — Kai'Sa, Evolutionary (OGN-112 → ogn-112-298) · Unit · Mind · 6+[mind] · 6 Might
 *   "[Ganking] When I conquer, you may play a spell from your trash with Energy cost less than your points
 *    without paying its Energy cost. Then recycle it."
 *   (× Draven, Audacious sfd-148-221 — mentioned only as the contrasting "win a combat" trigger.)
 *
 * Q: Is the conquer point gained before or after Kai'Sa's conquer trigger resolves — which spell costs qualify?
 * A: The point is scored as part of conquering, BEFORE the trigger resolves. At 3 points, conquering with her
 *    puts you at 4 when the ability resolves, so 3-cost (and lower) spells qualify.
 * Rules: 441–443 (conquer scores immediately), 383.3 (trigger goes on the chain and resolves later).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KAISA = "ogn-112-298";
const FIND_YOUR_CENTER = "ogn-047-298"; // 3 energy, no power: draw 1, channel 1 rune exhausted
const DISCIPLINE = "ogn-058-298"; // 2 energy
/** A 4-energy spell: NOT "less than" 4 points. */
const FOUR = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  name: "Four Drop",
} as const;

/** P1 at 3 points; Kai'Sa ready in base; bf1 held by P2 with a 1-Might blocker; trash: 2-, 3- and 4-cost spells. */
function board() {
  return scenario()
    .points(P1, 3)
    .resources(P1, { energy: 0 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", KAISA, "kaisa")
    .unit(P2, "bf1", { might: 1, name: "Blocker" }, "foe")
    .trash(P1, DISCIPLINE, "disc")
    .trash(P1, FIND_YOUR_CENTER, "fyc")
    .trash(P1, FOUR, "four");
}

describe("Ruling 4393d73efcee9bb9 — Kai'Sa's conquer point is scored before her conquer trigger resolves", () => {
  test("conquering from 3 points: P1 is already at 4 points while Kai'Sa's 'you may' trigger is being asked", async () => {
    const game = await board().build();
    expect(game.p1.points()).toBe(3);
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // The trigger is pending (opt-in asked of Kai'Sa's controller) and the point is ALREADY scored.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "kaisa" } });
    expect(game.p1.points()).toBe(4);
  });

  test("with 4 points on resolution, the 3-cost Find Your Center (and 2-cost Discipline) are offered from the trash; the 4-cost spell is not", async () => {
    const game = await board().build();
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toContain("fyc");
    expect(offered).toContain("disc");
    expect(offered).not.toContain("four");
  });

  test("picking the 3-cost spell plays it for no energy (P1 has 0) and recycles it afterwards", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    await game.p1.pick("fyc");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(handBefore + 1); // Find Your Center drew 1
    expect(game.zoneOf("fyc")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("fyc");
    expect(game.p1.points()).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
