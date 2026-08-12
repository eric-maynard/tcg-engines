/**
 * Ruling 81d92eab00b69f9d — Bullet Time (OGN-268 → ogn-268-298) · Spell · Body/Chaos · [1] · [Action]
 *     "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *   × Fight or Flight (OGN-168 → ogn-168-298) [Hidden] — revealed as a Reaction from a facedown card.
 *   × Gust (OGN-169 → ogn-169-298) [Reaction] [1] — "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."
 *
 * Q: Can a player play several reactions in a row (holding priority) before passing it back during a chain?
 * A: Yes. Priority only passes when you choose to pass it. Reveal a hidden card in response to Bullet Time and you
 *    may immediately play another reaction on top; the chain only starts resolving once you actually pass.
 * Rules: 336/337 (the chain and priority), 341 (a player who takes an action retains priority),
 *        347 (the chain resolves only after all players pass in succession).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const GUST = "ogn-169-298";

/** P1's turn. P2 holds bf1 with two 3-Might bodies, a facedown Fight or Flight there, Gust and [1] in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Alpha" }, "a")
    .unit(P2, "bf1", { might: 3, name: "Bravo" }, "b")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P2, GUST, "gust")
    .hand(P1, BULLET_TIME, "bullet");
}

/** P1 fires Bullet Time for 2 at bf1 and passes priority to P2. */
async function bulletThenP2(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bullet", { targets: "bf1", x: 2 });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bullet"]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling 81d92eab00b69f9d — you keep priority after acting and may stack reactions", () => {
  test("P2 reveals the hidden Fight or Flight in response: it goes on the chain above Bullet Time and P2 is STILL the acting seat", async () => {
    const game = await bulletThenP2();
    await game.p2.reveal("fof");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // its target, chosen as it is played
    await game.p2.pick("a");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bullet", "fof"]);
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("bullet")).toBe("chain"); // nothing resolved
  });

  test("without passing, P2 immediately plays a SECOND reaction (Gust) — three items now, priority still P2's", async () => {
    const game = await bulletThenP2();
    await game.p2.reveal("fof");
    await game.p2.pick("a");
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "b" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bullet", "fof", "gust"]);
    expect(game.actingSeat()).toBe(P2);
    expect(game.state("a").damage).toBe(0);
    expect(game.state("b").damage).toBe(0);
  });

  test("only once P2 chooses to pass does the chain start resolving — top down: Gust, then Fight or Flight, then Bullet Time", async () => {
    const game = await bulletThenP2();
    await game.p2.reveal("fof");
    await game.p2.pick("a");
    await game.p2.cast("gust", { targets: "b" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("b")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bullet", "fof"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Fight or Flight resolves
    expect(game.locationOf("a")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bullet"]);
  });

  test("Bullet Time then resolves into an empty battlefield: both bodies dodged its 2 damage entirely", async () => {
    const game = await bulletThenP2();
    await game.p2.reveal("fof");
    await game.p2.pick("a");
    await game.p2.cast("gust", { targets: "b" });
    await game.settle();
    expect(game.zoneOf("bullet")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, location: "base" });
    expect(game.zoneOf("b")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("control — P2 passes at once instead: Bullet Time resolves for 2 into both 3-Might bodies, which survive", async () => {
    const game = await bulletThenP2();
    await game.p2.passPriority();
    expect(game.zoneOf("bullet")).toBe("trash");
    expect(game.state("a").damage).toBe(2);
    expect(game.state("b").damage).toBe(2);
  });
});
