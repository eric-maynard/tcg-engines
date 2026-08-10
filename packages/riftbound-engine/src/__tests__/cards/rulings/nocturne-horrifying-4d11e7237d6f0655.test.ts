/**
 * Ruling 4d11e7237d6f0655 — Nocturne, Horrifying (OGN-194 → ogn-194-298) · Unit · Chaos · 4+[chaos] · 4
 *   "[Ganking] As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me for [rainbow]."
 *   × The Candlelit Sanctum (OGN-291 → ogn-291-298): "When you conquer here, look at the top two cards of your Main Deck. …"
 *   × Invert Timelines (OGN-201 → ogn-201-298): "Each player discards their hand, then draws 4."
 *   × Stacked Deck (OGN-183 → ogn-183-298): "Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest."
 *
 * Q: Can Nocturne be played for [rainbow] when simply drawn for turn, or only when looked at / revealed by an effect?
 * A: Only when an effect looks at or reveals it on top of the deck. Drawing (turn draw, Invert Timelines) does NOT
 *    work; look effects (Stacked Deck, Candlelit Sanctum) DO.
 * Rules: 419.x (draw ≠ look/reveal), 761 (look), Nocturne's self-trigger condition.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const CANDLELIT_SANCTUM = "ogn-291-298";
const INVERT_TIMELINES = "ogn-201-298";
const STACKED_DECK = "ogn-183-298";
const SKULKER = "ogn-175-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Drive prompts: accept every Nocturne offer, answer look/arrange prompts blandly; report whether Nocturne ever offered. */
async function drainAcceptingNocturne(game: Game): Promise<boolean> {
  let offered = false;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || d.context === "showdown"))) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc") {
      offered = true;
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick("base");
    } else if (d.kind === "pick" && d.seat === P1) {
      await (d.allowDecline && d.min === 0 ? game.p1.decline() : game.p1.pick(d.options[0]?.key as string));
    } else if (d.kind === "deck-arrange" && d.seat === P1) {
      await game.p1.answer({ kind: "deck-arrange", recycle: [], top: d.cards.map((c) => c.key) });
    } else if (d.kind === "action") {
      await game.acting().pass();
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return offered;
}

describe("Ruling 4d11e7237d6f0655 — Nocturne's offer comes from LOOK/REVEAL effects, never from drawing", () => {
  test("drawn for turn: Nocturne just goes to hand — no banish/play offer, [rainbow] untouched", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { power: { rainbow: 1 } })
      .deck(P1, [NOCTURNE, SKULKER], ["noc", "s1"])
      .build();
    await game.p2.endTurn();
    const offered = await drainAcceptingNocturne(game);
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(offered).toBe(false);
    expect(game.zoneOf("noc")).toBe("hand");
    expect(game.p1.banishment()).toEqual([]);
  });

  test("Invert Timelines (discard, then DRAW 4) does NOT work either: Nocturne is drawn into hand with no offer", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1, rainbow: 1 } })
      .deck(P1, [NOCTURNE, SKULKER, SKULKER, SKULKER, SKULKER], ["noc", "s1", "s2", "s3", "s4"])
      .hand(P1, INVERT_TIMELINES, "invert")
      .hand(P1, SKULKER, "old")
      .build();
    await game.p1.cast("invert");
    const offered = await drainAcceptingNocturne(game);
    await game.settle();
    expect(game.zoneOf("invert")).toBe("trash");
    expect(game.zoneOf("old")).toBe("trash"); // hand discarded
    expect(offered).toBe(false);
    expect(game.zoneOf("noc")).toBe("hand");
    expect(new Set(game.p1.hand())).toEqual(new Set(["noc", "s1", "s2", "s3"]));
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("Stacked Deck (LOOK at the top 3) DOES work: Nocturne offers banish → play for [rainbow]; accepting lands it in base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .deck(P1, [NOCTURNE, SKULKER, SKULKER, SKULKER], ["noc", "s1", "s2", "s3"])
      .hand(P1, STACKED_DECK, "sd")
      .build();
    await game.p1.cast("sd");
    const offered = await drainAcceptingNocturne(game);
    await game.settle();
    expect(offered).toBe(true);
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // [1] for Stacked Deck, [rainbow] for Nocturne
  });

  test("The Candlelit Sanctum (LOOK at the top two on conquer) DOES work too", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("sanctum", { controller: null, def: CANDLELIT_SANCTUM, inert: false })
      .unit(P1, "base", { might: 3, name: "Pilgrim" }, "pilgrim")
      .deck(P1, [NOCTURNE, SKULKER, SKULKER], ["noc", "s1", "s2"])
      .build();
    await game.p1.move("pilgrim", "sanctum");
    // Empty battlefield: the showdown passes, P1 conquers, the Sanctum's look trigger resolves.
    let offered = false;
    for (let i = 0; i < 6 && !offered; i++) {
      await game.settle();
      offered = (await drainAcceptingNocturne(game)) || offered;
      if (game.decision()?.kind === "action" && game.decision()?.seat === P1 && (game.decision() as { context?: string }).context === "main") {
        break;
      }
    }
    await game.settle();
    expect(game.gameState.battlefields.sanctum?.controller).toBe(P1);
    expect(offered).toBe(true);
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(0);
  });
});
