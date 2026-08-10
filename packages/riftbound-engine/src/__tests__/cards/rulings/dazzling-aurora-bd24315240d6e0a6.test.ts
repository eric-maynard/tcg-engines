/**
 * Ruling bd24315240d6e0a6 — Dazzling Aurora (OGN-160 → ogn-160-298) × Yasuo, Windrider (OGN-205 → ogn-205-298)
 *   Aurora (gear): "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it.
 *   Play it, ignoring its cost, and recycle the rest."   Yasuo (4): "[Ganking] The third time I move in a turn, you score 1 point."
 *
 * Q: Can you react to abilities that "activate automatically" (Aurora, purple Yasuo)?
 * A: Yes. When the condition happens the triggered ability enters the chain; once the opponent passes you have priority and may
 *    play Reactions before it resolves. You can't stop the ability itself that way — for Yasuo, even removing him in response
 *    doesn't stop the already-triggered point.
 * Rules: 383 (triggered abilities are chain items), 330–332 (Closed state, priority passes), 383.5 (a triggered ability resolves
 *        independently of its source leaving play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const YASUO_WINDRIDER = "ogn-205-298";
const RIDE_THE_WIND = "ogn-173-298"; // "[Action] Move a friendly unit and ready it." — Yasuo's 2nd move
const DISCIPLINE = "ogn-058-298"; // [2] Reaction "Give a unit +2 [Might] this turn. Draw 1."
const SKULKER = "ogn-175-298";
/** A plain Reaction removal for the "remove him in response" nuance. */
const SMITE = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Smite",
  rulesText: "[Reaction] Deal 4 to a unit.",
  timing: "reaction",
} as const;

describe("Ruling bd24315240d6e0a6 — automatic (triggered) abilities can be reacted to once they are on the chain", () => {
  test("Dazzling Aurora: at the end of P1's turn its trigger is a chain item; after P1 passes, P2 has priority and may play a Reaction (Discipline) which resolves BEFORE Aurora; Aurora then still resolves (reveals to the Skulker and plays it free)", async () => {
    const game = await scenario()
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: null })
      .gear(P1, DAZZLING_AURORA, "aurora")
      .unit(P2, "base", { might: 2, name: "Pal" }, "pal")
      .deck(P1, [{ cardType: "spell", energyCost: 1, name: "Junk" }, SKULKER, SKULKER], ["junk", "skulker", "s2"])
      .hand(P2, DISCIPLINE, "discipline")
      .build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority(); // "the opponent gives you priority"
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "discipline")).toBe(true);
    await game.p2.cast("discipline", { targets: "pal" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["aurora", "discipline"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Discipline resolves first
    expect(game.state("pal").might).toBe(4);
    expect(game.chain().map((c) => c.cardId)).toEqual(["aurora"]); // the ability itself is untouched …
    expect(game.zoneOf("skulker")).toBe("mainDeck");
    await game.settle(); // … and resolves: Junk recycled, Skulker banished-and-played free
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.p1.units()).toContain("skulker");
    expect(game.zoneOf("junk")).toBe("mainDeck");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  /** Yasuo makes his 3rd move this turn (standard → Ride the Wind → Ganking); his point trigger is on the chain, P2 has priority. */
  async function yasuoThirdMove(): Promise<Game> {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder 1" }, "h1")
      .unit(P1, "bf2", { might: 1, name: "Holder 2" }, "h2")
      .unit(P1, "base", YASUO_WINDRIDER, "yasuo")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .hand(P2, SMITE, "smite")
      .build();
    await game.p1.move("yasuo", "bf1"); // 1
    await game.settle();
    await game.p1.cast("rtw", { targets: "yasuo" }); // 2 (and readied)
    await game.settle();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.state("yasuo")).toMatchObject({ isReady: true, location: "bf2" });
    expect(game.p1.points()).toBe(0);
    await game.p1.gank("yasuo", "bf1"); // 3 → "you score 1 point" triggers
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(0); // on the chain, not resolved
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    return game;
  }

  test("Yasuo, Windrider: the third-move trigger enters the chain and, once P1 passes, P2 may react to it (a Reaction is legal with the trigger pending)", async () => {
    const game = await yasuoThirdMove();
    expect(game.p2.can("cast", "smite")).toBe(true);
    await game.p2.cast("smite", { targets: "yasuo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "smite"]);
  });

  test("…but reacting can't undo it: even killing Yasuo in response (4 damage), the already-triggered ability still resolves and P1 scores the point", async () => {
    const game = await yasuoThirdMove();
    await game.p2.cast("smite", { targets: "yasuo" });
    await game.acting().passPriority();
    await game.acting().passPriority(); // Smite resolves: Yasuo dies
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]); // his trigger is still there
    expect(game.p1.points()).toBe(0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("control — no reaction: the trigger simply resolves for the point", async () => {
    const game = await yasuoThirdMove();
    await game.p2.passPriority();
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
  });
});
