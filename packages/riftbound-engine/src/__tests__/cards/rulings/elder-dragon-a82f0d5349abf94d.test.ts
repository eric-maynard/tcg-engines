/**
 * Ruling a82f0d5349abf94d — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · [12][body]×4 · 10 · Dragon
 *   × Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · "At the end of your turn, reveal cards from the top of your Main Deck
 *     until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *   × Dragon Roost (VEN-157 → ven-157-166) · Battlefield · "Any player may pay [rainbow][rainbow] as an additional cost to play
 *     a Dragon. If they do, they play it to this battlefield."
 *
 * Q: If Dazzling Aurora plays Elder Dragon, may I pay Dragon Roost's 2 power and play it AT the Roost?
 * A: Yes. Aurora only ignores the base cost ([12] + 4 power); Dragon Roost's [rainbow][rainbow] is an optional ADDITIONAL cost,
 *    which still applies after the base cost is ignored — declare it, pay it, and Elder Dragon enters at Dragon Roost.
 * Rules: 356.1.b.3 (additional costs survive "ignoring its cost"), 356.2.b ("may pay" = optional additional cost),
 *        350 (a play by an effect is still a play, with its steps).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const DAZZLING_AURORA = "ogn-160-298";
const DRAGON_ROOST = "ven-157-166";
const CLEAVE = "ogn-004-298";

/** P1's turn, about to end. Aurora in base; deck top: Elder Dragon then Cleave. The live, uncontrolled Dragon Roost; P1 floats exactly 2 power, 0 energy. */
function board(power: Record<string, number> = { rainbow: 2 }) {
  return scenario()
    .resources(P1, { energy: 0, power })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("roost", { controller: null, def: DRAGON_ROOST, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P2, "base", { might: 3, name: "Onlooker" }, "onlooker")
    .deck(P1, [ELDER_DRAGON, CLEAVE], ["elder", "next"]);
}

/** End P1's turn and pass priority through Aurora's trigger until the play of Elder Dragon asks where it goes. */
async function auroraFlipsElder(game: Game): Promise<void> {
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  for (let i = 0; i < 8 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling a82f0d5349abf94d — an Aurora-played Elder Dragon may still pay Dragon Roost's [rainbow][rainbow] and land there", () => {
  test("Aurora resolves: Elder Dragon is revealed and banished, and its (free) play asks P1 for a destination — base OR the Dragon Roost (the additional-cost option is on offer)", async () => {
    const game = await board().build();
    await auroraFlipsElder(game);
    expect(game.zoneOf("elder")).toBe("banishment");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key).toSorted() : [];
    expect(offered).toEqual(["base", "battlefield-roost"]);
    expect(offered).not.toContain("battlefield-bf2"); // an ordinary uncontrolled battlefield is not a destination
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } }); // nothing paid yet
  });

  test("choosing the Roost: the base cost stays ignored (0 energy, no body) but the two power ARE paid, and Elder Dragon enters AT Dragon Roost, exhausted", async () => {
    const game = await board().build();
    await auroraFlipsElder(game);
    await game.p1.pick("battlefield-roost");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    // Elder's own play trigger may follow; let everything settle (declining/answering as forced).
    await game.settle();
    for (let i = 0; i < 4 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
      const d = game.decision()!;
      if (d.kind === "pick" && d.allowDecline) {
        await game.p1.decline();
      } else if (d.kind === "pick") {
        await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
      }
      await game.settle();
    }
    expect(game.locationOf("elder")).toBe("roost");
    expect(game.zoneOf("elder")).toBe("battlefield-roost");
    expect(game.p1.base()).not.toContain("elder");
    expect(game.state("elder")).toMatchObject({ controller: P1, might: 10 });
    expect(game.zoneOf("next")).toBe("mainDeck"); // "recycle the rest" — Cleave was never revealed (Elder was on top)
    expect(game.violations()).toEqual([]);
  });

  test("standing alone on the empty Roost, the Dragon takes it for P1 (conquer → 1 point) once the turn wraps up", async () => {
    const game = await board().build();
    await auroraFlipsElder(game);
    await game.p1.pick("battlefield-roost");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.locationOf("elder")).toBe("roost");
    expect(game.gameState.battlefields.roost?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("declining it instead: pick base → Elder Dragon lands in P1's base for free and the two power stay floating (until pools empty)", async () => {
    const game = await board().build();
    await auroraFlipsElder(game);
    await game.p1.pick("base");
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(2);
  });

  test("with only ONE power floating the Roost is not offered at all — the free play goes to base", async () => {
    const game = await board({ rainbow: 1 }).build();
    await auroraFlipsElder(game);
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.zone ?? o.key) === "base")) {
      expect(d.options.map((o) => o.zone ?? o.key)).toEqual(["base"]);
      await game.p1.pick("base");
    }
    await game.settle({ policy: "first" });
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.p1.power("rainbow")).toBeLessThanOrEqual(1);
  });
});
