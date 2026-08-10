/**
 * Ruling c6997d08e9f8a9e0 — Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might]
 *   or less to its owner's hand."
 *   × Reflection token (unl-t06) played by Deceiver / LeBlanc legend (UNL-199 → unl-199-219): "When you conquer or hold, you may
 *     discard 1 and exhaust me to play a ready Reflection unit token there. It becomes a copy of another unit there. …"
 *
 * Q: Can Gust be used on LeBlanc's Reflection token?
 * A: Yes — once the token is on the battlefield it is a unit and a legal Gust target (it goes back to "hand", i.e. leaves play).
 *    If instead Gust is played IN RESPONSE to the Deceiver trigger (bouncing the would-be copy source), the trigger still plays
 *    the token, but the copy instruction finds nothing: the token stays a 0-Might base Reflection. Gust cannot fizzle the token.
 * Rules: 187 (tokens), 186.1 (token leaving the board ceases to exist), 359.3 ("do all you can"), 477 (copy).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const DECEIVER = "unl-199-219";

/** P1 (LeBlanc) conquers P2's bf1 with a 3-Might Runner; P2 holds Gust with [1]+chaos. */
function board() {
  return scenario()
    .legend(P1, DECEIVER, "deceiver")
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Doormat" }, "doormat")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "Junk" }, "junk")
    .hand(P2, GUST, "gust");
}

/** Conquer bf1 and accept + pay Deceiver's offer; returns with the Deceiver item on the chain. */
async function conquerAndAcceptDeceiver(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("runner", "bf1");
  await game.settle();
  expect(game.zoneOf("doormat")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "deceiver" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("junk");
  }
  expect(game.zoneOf("junk")).toBe("trash");
  expect(game.state("deceiver").isExhausted).toBe(true);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "deceiver", controller: P1, triggered: true })]);
  return game;
}

const tokenAt = (game: Game, loc: string) => game.p1.units(loc).find((u) => game.state(u).isToken);

describe("Ruling c6997d08e9f8a9e0 — Gust vs LeBlanc's Reflection token", () => {
  test("case 1: token already in play — the Reflection (copy of 3-Might Runner) at bf1 is a legal Gust target and leaves the board", async () => {
    const game = await conquerAndAcceptDeceiver();
    // Let the Deceiver item resolve; name Runner as the copy source when asked.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "runner")) {
        await game.p1.pick("runner");
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    const token = tokenAt(game, "bf1");
    expect(token).toBeDefined();
    expect(game.state(token as string)).toMatchObject({ isToken: true, location: "bf1", might: 3, name: "Runner" });

    // P2's turn: Gust the token.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1, power: { chaos: 1 } }); // pools emptied at end of turn — refill for Gust
    const targets = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options as string[][] | undefined;
    expect(targets?.map((t) => t[0])).toContain(token as string);
    await game.p2.cast("gust", { targets: token as string });
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    // The token left the battlefield ("returned to hand" → a token off the board ceases to exist, 186.1).
    expect(game.locationOf(token as string)).toBeUndefined();
    expect(["gone", "hand"]).toContain(game.zoneOf(token as string));
    expect(game.p1.units("bf1")).toEqual(["runner"]);
    expect(game.violations()).toEqual([]);
  });

  test("case 2: Gust in response to the Deceiver trigger bounces the copy source — the token is STILL played at bf1 but stays a 0-Might Reflection", async () => {
    const game = await conquerAndAcceptDeceiver();
    // Pass priority to P2, who reacts with Gust on the Runner (the intended copy source; the token does not exist yet).
    for (let i = 0; i < 4 && !(game.actingSeat() === P2 && game.p2.can("cast", "gust")); i++) {
      await game.acting().passPriority();
    }
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(tokenAt(game, "bf1")).toBeUndefined();
    await game.p2.cast("gust", { targets: "runner" });
    const ids = game.chain().map((c) => c.cardId);
    expect(ids).toContain("gust");
    expect(ids).toContain("deceiver");
    // Resolve LIFO: Gust first (Runner → hand), then Deceiver (token played, copy finds nothing).
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        // The bounced Runner must never be offered as a copy source.
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("runner");
        if (d.allowDecline) {
          await game.p1.decline();
        } else {
          break;
        }
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("hand");
    const token = tokenAt(game, "bf1");
    expect(token).toBeDefined(); // the token's creation was not "fizzled"
    expect(game.state(token as string)).toMatchObject({ isToken: true, location: "bf1", might: 0, name: "Reflection" });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
