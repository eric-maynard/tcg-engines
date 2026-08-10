/**
 * Ruling 6058dd260398416f — Nocturne, Horrifying (OGN-194 → ogn-194-298) · 4 Might
 *     "As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me for [rainbow]."
 *   × Baited Hook (OGN-242 → ogn-242-298) "… Look at the top 5 cards of your Main Deck. You may banish a unit … and play it …"
 *
 * Q: Does Nocturne's ability trigger when you DRAW him from your deck?
 * A: No. Drawing is its own game action and is not "looking at" cards. "Looking at" means effects that look at /
 *    reveal the top X of your deck (e.g. Baited Hook) — those do offer Nocturne's banish-and-play.
 * Rules: 415 (draw), 411 (look at), Nocturne's self-trigger on look/reveal.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const BAITED_HOOK = "ogn-242-298";
const SKULKER = "ogn-175-298";

/** Walk non-action prompts, accepting every Nocturne offer; report whether Nocturne ever offered anything. */
async function drainAcceptingNocturne(game: Game): Promise<boolean> {
  let offered = false;
  for (let i = 0; i < 14; i++) {
    await game.settle();
    const d = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc") {
      offered = true;
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "base")) {
      await game.p1.pick("base");
    } else if (d.kind === "pick" && d.seat === P1 && d.allowDecline) {
      await game.p1.decline();
    } else {
      break;
    }
  }
  return offered;
}

describe("Ruling 6058dd260398416f — drawing Nocturne is not 'looking at' him; Baited Hook's look IS", () => {
  test("drawn for turn: Nocturne simply goes to hand — no banish offer, no play, the [rainbow] is never asked for", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .deck(P1, [NOCTURNE, SKULKER], ["noc", "s1"])
      .build();
    await game.p2.endTurn();
    const offered = await drainAcceptingNocturne(game);
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(offered).toBe(false);
    expect(game.zoneOf("noc")).toBe("hand"); // the turn draw took him
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("drawn by an effect mid-turn (draw 1): still just a draw — Nocturne lands in hand with no offer", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .deck(P1, [NOCTURNE, SKULKER], ["noc", "s1"])
      .build();
    await game.p1.do("drawCard", { count: 1 });
    const offered = await drainAcceptingNocturne(game);
    expect(offered).toBe(false);
    expect(game.zoneOf("noc")).toBe("hand");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.banishment()).toEqual([]);
  });

  test("contrast — Baited Hook LOOKS at the top 5: Nocturne (2nd from top) offers 'banish me?' then 'play me for [rainbow]?'; accepting puts him in base for exactly 1 rainbow", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1, rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .gear(P1, BAITED_HOOK, "hook")
      .unit(P1, "base", { might: 3, name: "Bait" }, "bait")
      .unit(P2, "bf1", { might: 2, name: "Onlooker" }, "onlooker")
      .deck(P1, [SKULKER, NOCTURNE, SKULKER, SKULKER, SKULKER, SKULKER], ["r0", "noc", "r2", "r3", "r4", "below"])
      .build();
    await game.p1.activate("hook", 0, { targets: "bait" });
    await game.settle();
    expect(game.zoneOf("bait")).toBe("trash");
    // The look itself fires Nocturne's offer, sourced from Nocturne, for P1.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
    const offered = await drainAcceptingNocturne(game);
    expect(offered).toBe(true);
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
