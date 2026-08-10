/**
 * Ruling 1b00e0caff5a4372 — Sacrifice (UNL-173 → unl-173-219) · Spell · Order · 1 · [Reaction]
 *     "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Ruined Rex (UNL-067 → unl-067-219) · Unit · 6 Might "[Deathknell] — Deal 4 to an enemy unit."
 *
 * Q: I kill my own Ruined Rex as Sacrifice's additional cost — does the Deathknell resolve before or after
 *    Sacrifice's draw-and-channel?
 * A: Before. Rex dies during Sacrifice's cost payment; its Deathknell becomes a pending item that is finalized onto
 *    the chain AFTER (above) Sacrifice. LIFO: Deathknell resolves first (deal 4), then Sacrifice (draw 2, channel 1
 *    rune exhausted).
 * Rules: 356 (additional costs paid while finalizing), 383.3 (triggers finalize after the current item), 336 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const RUINED_REX = "unl-067-219";

/** P1's turn, exactly 1 energy; Ruined Rex (6, Mighty) in base; Sacrifice in hand; empty hand otherwise, no runes. P2: 5-Might Guard at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .hand(P1, SACRIFICE, "sac");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

async function castSacrificeKillingRex(game: Game): Promise<void> {
  expect(game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice")?.options).toEqual(["rex"]);
  await game.p1.cast("sac", { sacrifice: "rex" });
  // Rex's Deathknell has exactly one legal enemy unit; take it if asked.
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("guard");
  }
}

describe("Ruling 1b00e0caff5a4372 — Rex's Deathknell (from Sacrifice's cost) lands ABOVE Sacrifice and resolves first", () => {
  test("paying the cost kills Rex at once; the chain is [Sacrifice, Deathknell] with the Deathknell as the NEWEST item", async () => {
    const game = await board().build();
    await castSacrificeKillingRex(game);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("rex")).toBe("trash");
    expect(chainIds(game)).toEqual(["sac", "rex"]);
    expect(game.chain()[0]).toMatchObject({ cardId: "sac", triggered: false });
    expect(game.chain()[1]).toMatchObject({ cardId: "rex", targets: ["guard"], triggered: true });
    // Nothing has resolved yet.
    expect(game.state("guard").damage).toBe(0);
    expect(game.p1.hand()).toEqual([]);
  });

  test("first resolution (both pass once): the Deathknell deals 4 to the Guard while Sacrifice is STILL on the chain — no cards drawn, no rune channeled yet", async () => {
    const game = await board().build();
    await castSacrificeKillingRex(game);
    const runesBefore = game.p1.runes().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("guard").damage).toBe(4);
    expect(chainIds(game)).toEqual(["sac"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(runesBefore);
  });

  test("then Sacrifice resolves: P1 draws 2 and channels 1 rune EXHAUSTED; final state = Guard at 4 damage, Rex and Sacrifice in trash", async () => {
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    const runesBefore = game.p1.runes().length;
    await castSacrificeKillingRex(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(4);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.deck()).toHaveLength(deckBefore - 2);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    const channeled = game.p1.runes().find((r) => game.state(r).isExhausted);
    expect(channeled).toBeDefined();
    expect(game.p1.runes({ ready: true })).toHaveLength(runesBefore); // the new one came in exhausted
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
