/**
 * Interaction: Pack of Wonders (ogn-181-298) "[Exhaust]: Return another friendly gear, unit, or
 *              facedown card to its owner's hand."
 *   × Hidden Blade (ogn-213-298) "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *   × Katarina, Reckless (unl-023-219) "When you hide a card, ready me. …"
 *
 * Position: P1's turn. P1 controls bf1 (exhausted Katarina there) with Hidden Blade facedown at bf1
 * since last turn; P2 controls bf2 with his own facedown card there; bf3 is uncontrolled and empty.
 * Pack of Wonders sits in P1's base.
 *
 * Questions / rulings:
 *  (a) 355.9.a.3 a "facedown card" is a card in a Facedown Zone; 107.3.f the zone is public (the
 *      face is private, 128.4) so it can be chosen; "friendly" = controlled by P1 → P1's own facedown
 *      Blade is a legal choice, P2's facedown card is not and must not be listed.
 *  (b) 421.4 a facedown card that changes zones is revealed to all players by its owner, then it
 *      goes to P1's hand.
 *  (c) 421.1/421.2/811.1.b hiding is a Discretionary Action on your turn for [rainbow], only at a
 *      battlefield you CONTROL with room (107.3.b/107.3.c): bf1 yes, bf2 (enemy) no, bf3
 *      (uncontrolled) no. 811.1.c.2 hiding opens no chain itself, but Katarina's triggered ability
 *      goes on the chain and readies her — bounce + re-hide legitimately re-triggers her.
 *  (d) 811.1.b / 421.3 the re-hidden Blade is a new hidden object: "Beginning on the next turn" counts
 *      from THIS hide, so it cannot be flipped again this turn.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PACK = "ogn-181-298";
const HIDDEN_BLADE = "ogn-213-298";
const KATARINA = "unl-023-219";
const STAND_UNITED = "ogn-053-298"; // any [Hidden] card for P2's facedown slot

function board() {
  return scenario()
    .turn(3)
    .resources(P1, { power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", KATARINA, "kat", { exhausted: true })
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
    .gear(P1, PACK, "pack")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .facedown(P2, "bf2", STAND_UNITED, "theirs");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/** Card ids offered as choices for Pack of Wonders' activated ability. */
function packTargets(game: Built): string[] {
  const field = game.p1.option("activate", "pack")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** Battlefields offered for hiding `blade`. */
function hideDestinations(game: Built): string[] {
  const field = game.p1.option("hide", "blade")?.fields.find((f) => f.arg === "to");
  return [...((field?.options ?? []) as string[])].sort();
}

/** Bounce the facedown Blade with Pack of Wonders and let the ability resolve. */
async function bounceBlade(game: Built): Promise<void> {
  await game.p1.activate("pack", 0, { targets: "blade" });
  await game.settle();
}

describe("Pack of Wonders × facedown Hidden Blade × Katarina, Reckless", () => {
  test("(a) Pack offers P1's own facedown Blade (and Katarina) — never P2's facedown card, P2's unit, or itself", async () => {
    const game = await board().build();
    const offered = packTargets(game);
    expect(offered).toContain("blade");
    expect(offered).toContain("kat");
    expect(offered).not.toContain("theirs");
    expect(offered).not.toContain("foe");
    expect(offered).not.toContain("pack");
  });

  test("(a) choosing P2's facedown card is rejected outright", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.activate("pack", 0, { targets: "theirs" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("theirs")).toBe("facedown-bf2");
    expect(game.state("pack").isReady).toBe(true);
  });

  test("(a/b) bouncing the facedown Blade: Pack exhausts, ability uses the chain, Blade lands in P1's hand no longer hidden, bf1's facedown slot is empty", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.activate("pack", 0, { targets: "blade" });
    expect(game.state("pack").isExhausted).toBe(true);
    expect(game.chain().map((c) => ({ cardId: c.cardId, triggered: c.triggered }))).toEqual([{ cardId: "pack", triggered: false }]);
    await game.settle();
    expect(game.zoneOf("blade")).toBe("hand");
    expect(game.state("blade").owner).toBe(P1);
    expect(game.state("blade").isHidden).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.zoneOf("theirs")).toBe("facedown-bf2"); // untouched
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected (421.4): a facedown card changing zones is revealed to ALL players by its owner before it
  // goes to hand — the engine's public-reveal record should name the Blade for P2 to see.
  // Actual: the card moves facedown-zone → hand silently; nothing is revealed to P2.
  test("(b) the bounced facedown card is revealed to all players as it leaves the Facedown Zone (421.4)", async () => {
    const game = await board().build();
    await bounceBlade(game);
    expect(game.zoneOf("blade")).toBe("hand");
    expect(game.gameState.publicReveals?.at(-1)).toMatchObject({ cardIds: ["blade"], playerId: P1 });
  });

  test("(c) same turn, the Blade can be re-hidden — only at bf1 (controlled, slot now empty); bf2 (enemy) and bf3 (uncontrolled) are not offered and are rejected", async () => {
    const game = await board().build();
    await bounceBlade(game);
    expect(game.p1.can("hide", "blade")).toBe(true);
    expect(hideDestinations(game)).toEqual(["bf1"]);
    const atEnemy = await game.p1.try((p) => p.hide("blade", "bf2"));
    expect(atEnemy.ok).toBe(false);
    const atNeutral = await game.p1.try((p) => p.hide("blade", "bf3"));
    expect(atNeutral.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("hand");
  });

  test("(c) before the bounce the bf1 slot is full, so there is nowhere legal to hide anything (107.3.b)", async () => {
    const game = await board().hand(P1, STAND_UNITED, "spare").build();
    expect(game.p1.can("hide", "spare")).toBe(false);
  });

  test("(c) re-hiding at bf1 costs [rainbow], puts the Blade facedown, opens no chain of its own — only Katarina's 'When you hide a card' trigger is on the chain — and readies her", async () => {
    const game = await board().build();
    await bounceBlade(game);
    expect(game.state("kat").isExhausted).toBe(true);
    const rainbow0 = game.p1.power("rainbow");
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.power("rainbow")).toBe(rainbow0 - 1);
    // 811.1.c.2: the hide itself is not a chain item; the only thing on the chain is Katarina's triggered ability.
    const chain = game.chain();
    expect(chain.some((c) => c.cardId === "blade")).toBe(false);
    expect(chain.map((c) => ({ cardId: c.cardId, triggered: c.triggered }))).toEqual([{ cardId: "kat", triggered: true }]);
    await game.settle();
    expect(game.state("kat").isReady).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) the re-hidden Blade cannot be flipped this same turn (its 'next turn' clock restarted), while the untouched original could have been", async () => {
    // Control: without the bounce, the Blade hidden since last turn is playable from facedown right now
    // (P1's turn = Action timing; Katarina is a unit at its battlefield, so it has a legal target).
    const control = await board().build();
    expect(control.p1.can("reveal", "blade")).toBe(true);

    const game = await board().build();
    await bounceBlade(game);
    await game.p1.hide("blade", "bf1");
    await game.settle();
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "blade")).toBe(false);
  });

  test("(d) …but it becomes playable from facedown again once a new turn has begun (P1's following turn)", async () => {
    const game = await board().build();
    await bounceBlade(game);
    await game.p1.hide("blade", "bf1");
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("reveal", "blade")).toBe(false); // [Action]: not in P2's open main phase
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "blade")).toBe(true);
  });
});
