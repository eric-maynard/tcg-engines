/**
 * Ruling 94507cce7ec8a049 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2][calm]
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *    If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can Zhonya's Hourglass be played from hidden without a unit dying?
 * A: Yes. A facedown card has Reaction timing (from the next turn on) and may be played whenever a Reaction could be,
 *    for [0], regardless of whether its replacement effect has anything to replace. It resolves as a permanent; a gear
 *    can't sit at a battlefield, so it lands in your base and will save the next friendly unit that would die.
 *    Leaving it hidden is risky: if you lose the battlefield the hidden card is trashed without effect.
 * Rules: 811.1.b/d (Hidden: hide for [A]; next turn gains [Reaction], play ignoring base cost), 813, 144 (gear lives in
 *        base), 190.4 / 323.7 (facedown card removed when control is lost), 371–373.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const HEXTECH_RAY = "ogn-009-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn 2: Anchor (3) holds bf1, Zhonya's in hand, exactly one [rainbow] to hide it. P2: Discipline + Ray in hand, a 5-Might Brute in base. */
function board() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
    .hand(P1, ZHONYAS, "zh")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** Hide Zhonya's at bf1 on turn 2, then pass to P2's turn 3 (P2 given [3] + fury for its spells). */
async function hiddenThenP2Turn(): Promise<Game> {
  const game = await board().build();
  await game.p1.hide("zh", "bf1");
  expect(game.zoneOf("zh")).toBe("facedown-bf1");
  expect(game.p1.power("rainbow")).toBe(0); // the [rainbow] hide cost
  expect(game.p1.can("reveal", "zh")).toBe(false); // not on the turn it was hidden (811.1.b "beginning on the next turn")
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", { energy: 3, power: { fury: 1 } });
  return game;
}

describe("Ruling 94507cce7ec8a049 — Zhonya's can be flipped from hidden proactively, with nothing dying", () => {
  test("on the opponent's turn, in a Reaction window (responding to P2's Discipline) with no unit anywhere near death, P1 may play Zhonya's from facedown for [0]", async () => {
    const game = await hiddenThenP2Turn();
    await game.p2.cast("disc", { targets: "brute" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zh")).toBe(true);
    const pool = game.p1.resources();
    await game.p1.reveal("zh");
    expect(game.p1.resources()).toEqual(pool); // cost 0
    // A permanent: resolves at once and, being a gear, ends up in P1's BASE (not at the battlefield); Discipline still pending.
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p1.gear()).toContain("zh");
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("on P1's own next turn, in a plain open state (again nothing dying), the flip is likewise legal and free; it sits in base afterwards", async () => {
    const game = await hiddenThenP2Turn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    const energy = game.p1.energy();
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(game.p1.energy()).toBe(energy);
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.chain()).toEqual([]);
  });

  test("played proactively it then works from base: P2's Hextech Ray (3) on the Anchor (3) would kill it — Zhonya's dies instead and the Anchor is healed, exhausted and recalled", async () => {
    const game = await hiddenThenP2Turn();
    await game.p2.cast("disc", { targets: "brute" });
    await game.p2.passPriority();
    await game.p1.reveal("zh");
    await game.settle(); // Discipline resolves
    await game.p2.cast("ray", { targets: "anchor" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("anchor")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });

  test("the risk of leaving it hidden: P2's Brute (5) conquers bf1 from the lone Anchor (3) — the still-facedown Zhonya's is trashed without saving anything", async () => {
    const game = await hiddenThenP2Turn();
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("anchor")).toBe("trash"); // not saved: Zhonya's was never in play
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.facedown("bf1")).toEqual([]);
  });
});
