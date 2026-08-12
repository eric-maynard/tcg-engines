/**
 * Ruling af342af242fae38f — Minefield (SFD-212 → sfd-212-221) · Battlefield
 *     "When you conquer here, put the top 2 cards of your Main Deck into your trash."
 *   × Kai'Sa, Evolutionary (OGN-112 → ogn-112-298) · Unit — the ruling asks about Kennen, who is not in the
 *     pool; Kai'Sa carries the same shape: "When I conquer, you may play a spell from your trash with Energy
 *     cost less than your points without paying its Energy cost. Then recycle it."
 *
 * Q: Can the conquer trigger use a card that Minefield milled during that SAME conquer?
 * A: No. Both "when you conquer" triggers go on the Chain together, and a triggered ability's targets are
 *    chosen while it is FINALIZED — before anything resolves. The trash spell is a target (the trash is a
 *    public zone), so it is named while Minefield's mill is still an unresolved chain item: the two cards it
 *    will put in the trash are not candidates. Ordering Minefield to resolve first does not help.
 * Rules: 383.3 / 383.4 (simultaneous triggers go on the chain together, controller orders them),
 *        352.4.b / 402.2 (targets of a triggered ability are chosen at finalization, not at resolution),
 *        355.10.a (the trash is public, so the card named there IS a target).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KAISA = "ogn-112-298";
const MINEFIELD = "sfd-212-221";
const DISCIPLINE = "ogn-058-298"; // 2 energy: +2 Might and draw 1
const FIND_YOUR_CENTER = "ogn-047-298"; // 3 energy: draw 1, channel 1 exhausted rune

/**
 * P1 at 3 points (4 once Kai'Sa conquers, so every spell below is "less than your points"). Minefield is P2's,
 * held by a 1-Might Blocker; P2 also holds bf2 so the conquer is not P1's last unscored battlefield. P1's trash
 * holds two eligible spells; the top two cards of P1's deck are two more.
 */
function board() {
  return scenario()
    .points(P1, 3)
    .victoryScore(8)
    .resources(P1, { energy: 0 })
    .fillDecks({ main: 0, runes: 12 })
    .deck(P1, [DISCIPLINE, DISCIPLINE, DISCIPLINE], ["mill1", "mill2", "deck3"])
    .battlefield("mine", { controller: P2, def: MINEFIELD, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", KAISA, "kaisa")
    .unit(P2, "mine", { might: 1, name: "Blocker" }, "foe")
    .unit(P2, "bf2", { might: 2, name: "Their Holder" }, "theirs")
    .trash(P1, DISCIPLINE, "disc")
    .trash(P1, FIND_YOUR_CENTER, "fyc");
}

/** Kai'Sa conquers Minefield and P1 opts in to her trigger. Both conquer triggers are then on the chain. */
async function conquer(): Promise<Awaited<ReturnType<ReturnType<typeof board>["build"]>>> {
  const game = await board().build();
  await game.p1.move("kaisa", "mine");
  await game.settle();
  expect(game.gameState.battlefields.mine?.controller).toBe(P1);
  expect(game.p1.points()).toBe(4);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "kaisa" } });
  await game.p1.yes();
  return game;
}

describe("Ruling af342af242fae38f — a conquer trigger cannot name a card its sibling conquer trigger has not milled yet", () => {
  test("both conquer triggers are on the chain together (Kai'Sa's and Minefield's), and P1 orders them", async () => {
    const game = await conquer();
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["kaisa", "mine"]);
    expect(game.chain().every((c) => c.triggered)).toBe(true);
    // Kai'Sa's target is asked while the batch is being finalized (timing FIN),
    // and only then does P1 order the two items (383.4).
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    await game.p1.pick("disc");
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
  });

  test("ruling af342af242fae38f — Kai'Sa's spell is chosen at FINALIZATION: only the two spells already in the trash are offered, never the two Minefield is about to mill", async () => {
    const game = await board().build();
    await game.p1.move("kaisa", "mine");
    await game.settle();
    await game.p1.yes();
    // The pick is raised while BOTH triggers are still unresolved: the deck is untouched.
    expect(game.p1.deck()).toEqual(["mill1", "mill2", "deck3"]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["disc", "fyc"]);
    expect(offered).not.toContain("mill1");
    expect(offered).not.toContain("mill2");
  });

  test("with Minefield ordered to resolve FIRST, the milled cards land in the trash but Kai'Sa still plays the spell she named — the mill is never a candidate", async () => {
    const game = await board().build();
    await game.p1.move("kaisa", "mine");
    await game.settle();
    await game.p1.yes();
    await game.p1.pick("disc");
    // rule 383.4 — first = bottom, last = top (resolves first): Minefield goes on top.
    const order = game.decision();
    expect(order).toMatchObject({ kind: "order", seat: P1 });
    await game.p1.order(["chain-1", "chain-2"]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("kaisa"); // Discipline's own target
      await game.settle();
    }
    expect(game.p1.trash()).toContain("mill1");
    expect(game.p1.trash()).toContain("mill2");
    // Discipline was played for free and recycled; the milled cards stayed put.
    expect(game.p1.deck().at(-1)).toBe("disc");
    expect(game.zoneOf("mill1")).toBe("trash");
    expect(game.zoneOf("mill2")).toBe("trash");
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.state("kaisa").might).toBe(8);
    expect(game.violations()).toEqual([]);
  });
});
