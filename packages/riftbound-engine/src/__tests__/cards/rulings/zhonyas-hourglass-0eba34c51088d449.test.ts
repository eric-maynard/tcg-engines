/**
 * Ruling 0eba34c51088d449 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2]
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · [12]+[body]×4 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at
 *      each location. Deal 1 to them."
 *
 * Q: When Elder Dragon's play trigger kills several of my units at once, who decides which one Zhonya's saves?
 * A: The controller of Zhonya's Hourglass. Simultaneous deaths are separate events; the replacement effect's
 *    controller picks which event it applies to (373). It is mandatory and single-use: once applied to one unit
 *    the Hourglass is gone and the others die. It must already be face-up before the damage is dealt.
 * Rules: 370.1.a.2 (simultaneous events), 371–373 (controller of the replacement chooses; applies once).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const ELDER_DRAGON = "unl-118-219";

/**
 * P1's turn with exactly [12] + 4 body. P2: 4-Might Xerus in base, 3-Might Yak at P2's bf1, and a FACE-UP Zhonya's
 * Hourglass in base (or, for the timing note, one hidden facedown at bf1 instead).
 */
function board(zhonyas: "face-up" | "hidden" = "face-up") {
  const s = scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Yak" }, "yak")
    .unit(P2, "base", { might: 4, name: "Xerus" }, "xerus")
    .hand(P1, ELDER_DRAGON, "elder");
  return zhonyas === "face-up" ? s.gear(P2, ZHONYAS, "zhonyas") : s.facedown(P2, "bf1", ZHONYAS, "zhonyas");
}

/** P1 plays Elder Dragon; its trigger resolves choosing Xerus (base) and Yak (bf1); stops at the next real prompt. */
async function elderHitsBoth(game: Game): Promise<void> {
  await game.p1.play("elder");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "elder" } });
  await game.p1.pick("xerus", "yak");
  await game.settle();
}

describe("Ruling 0eba34c51088d449 — Zhonya's controller chooses which simultaneously dying unit it saves", () => {
  test("Elder Dragon's 1 damage is lethal to both enemy units at once, and the decision 'which death does Zhonya's replace' surfaces to P2 — the Hourglass's controller — naming both units (373)", async () => {
    const game = await board().build();
    await elderHitsBoth(game);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, semantics: "replacement-assign", source: { cardId: "zhonyas" } });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["xerus", "yak"]);
    expect(game.actingSeat()).toBe(P2);
    // Nothing has died yet while P2 decides.
    expect(game.zoneOf("xerus")).toBe("base");
    expect(game.zoneOf("yak")).toBe("battlefield-bf1");
    expect(game.zoneOf("zhonyas")).toBe("base");
  });

  test("P2 picks Yak: Hourglass is killed instead, Yak is healed, exhausted and recalled to base; Xerus dies; the Hourglass is consumed and saves nobody else", async () => {
    const game = await board().build();
    await elderHitsBoth(game);
    await game.p2.pick("yak");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("yak")).toBe("base");
    expect(game.state("yak")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("xerus")).toBe("trash");
    expect(game.p2.gear()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("P2 may equally pick Xerus instead — then Xerus survives (exhausted, in base) and Yak dies: it is P2's choice, not P1's and not fixed", async () => {
    const game = await board().build();
    await elderHitsBoth(game);
    await game.p2.pick("xerus");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("xerus")).toBe("base");
    expect(game.state("xerus")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("yak")).toBe("trash");
  });

  test("timing note: a still-HIDDEN Hourglass that P2 does not flip before the trigger resolves replaces nothing — both units die and no choice is ever offered", async () => {
    const game = await board("hidden").build();
    await game.p1.play("elder");
    let stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.seat === P1) {
      await game.p1.pick("xerus", "yak");
      stop = await game.settle();
    }
    // Never a replacement-assign prompt for P2.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("xerus")).toBe("trash");
    expect(game.zoneOf("yak")).toBe("trash");
    expect(game.p2.units()).toEqual([]); // nobody was healed/recalled
  });
});
