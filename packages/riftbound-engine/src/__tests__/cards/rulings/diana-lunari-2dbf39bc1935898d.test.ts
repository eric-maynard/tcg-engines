/**
 * Ruling 2dbf39bc1935898d — Diana, Lunari (UNL-079 → unl-079-219) · Unit · Mind · 3 · 3 Might
 *   "When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card of your Main
 *    Deck. If it's a spell, draw it."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."
 *
 * Q: If Diana is Gusted back to hand after her ability triggered, does the ability still happen?
 * A: Yes. The trigger is on the chain; Gust (played in response) resolves first and removes Diana, but the
 *    triggered ability resolves independently of its source: on resolution the controller may pay [1] → Predict →
 *    reveal top → draw it if a spell.
 * Rules: 383.3 (triggered abilities go on the chain), 444.2 (Diana's [1] is chosen/paid when the ability RESOLVES —
 *        the rule's own example) + 205 (that pay is a game action, not a cost), 383.3.a / 402.1 (the LEADING "you
 *        may" itself is a free "use it?" answered while the trigger is finalized — timing FIN — before anyone can
 *        respond; nothing is paid there), 336/337 (LIFO), abilities resolve independently of their source.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIANA = "unl-079-219";
const GUST = "ogn-169-298";

/** P2's turn. P1 holds bf1 with Diana (3). P2: 4-Might Brute in base, Gust in hand, [1]. P1: [1]; deck top = a spell. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DIANA, "diana")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .hand(P2, GUST, "gust")
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .deck(
      P1,
      [
        { cardType: "spell", energyCost: 1, name: "Bolt" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Grunt" },
      ],
      ["bolt", "grunt"],
    );
}

/** rule 383.3.a / 402.1 — Diana's leading "you may": P1 takes the free finalization opt-in (nothing paid — 205). */
async function optIn(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "diana" }, timing: "FIN" });
  await game.p1.yes();
  expect(game.p1.energy()).toBe(1);
}

/**
 * Brute attacks bf1 → showdown begins → Diana triggers (P1 opts in at finalization, paying nothing); P2 responds
 * with Gust on Diana.
 */
async function triggerThenGust(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("brute", "bf1");
  // 1. Trigger: Diana's ability is on the chain.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", controller: P1, triggered: true })]);
  await optIn(game);
  // 2. Response: P2 Gusts Diana while her ability is still on the chain.
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  await game.p2.cast("gust", { targets: "diana" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["diana", "gust"]);
  return game;
}

async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling 2dbf39bc1935898d — Diana's showdown trigger still resolves after she is Gusted to hand", () => {
  // Ruling step 4 / rule 444.2's own Diana example: the [1] is offered when the ability RESOLVES — i.e. after Gust has
  // already bounced her — and P1 may still pay it then and get the full effect. (The only trigger-time question is
  // the free 383.3.a opt-in.)
  test("ruling 2dbf39bc1935898d — Diana's [1] is offered on resolution, not at trigger time (only the free 'use it?' opt-in is asked at finalization)", async () => {
    const game = await board().build();
    await game.p2.move("brute", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", triggered: true })]);
    await optIn(game);
    // No payment question yet — just a priority/focus window with the trigger finalized.
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.energy()).toBe(1);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("gust", { targets: "diana" });
    await bothPass(game); // Gust resolves: Diana → hand
    expect(game.zoneOf("diana")).toBe("hand");
    await bothPass(game); // Diana's ability starts resolving → NOW the pay-[1] choice
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "diana" }, timing: "RES" });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    if (game.decision()?.kind === "pick") {
      await game.p1.decline(); // Predict: keep Bolt
    }
    expect(game.p1.hand().sort()).toEqual(["bolt", "diana"]);
  });

  test("3. Gust resolves first (LIFO): Diana is in P1's hand while her ability is STILL on the chain", async () => {
    const game = await triggerThenGust();
    await bothPass(game);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("diana")).toBe("hand");
    expect(game.p1.hand()).toContain("diana");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", triggered: true, countered: false })]);
  });

  test("4. the ability then resolves without its source: Predict is offered, the revealed spell (Bolt) is drawn", async () => {
    const game = await triggerThenGust();
    await bothPass(game); // Gust
    await bothPass(game); // Diana's ability
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes(); // (pay on resolution — where the ruling puts it)
    }
    expect(game.p1.energy()).toBe(0);
    // Predict: look at the top card, may recycle it — a real P1 decision.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, allowDecline: true });
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["bolt"]);
    }
    await game.p1.decline(); // keep Bolt on top
    // Reveal top: Bolt is a spell → drawn.
    expect(game.zoneOf("bolt")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["bolt", "diana"]);
    expect(game.zoneOf("grunt")).toBe("mainDeck");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("diana")).toBe("hand"); // still gone from the board — the effect did not need her
    expect(game.violations()).toEqual([]);
  });

  test("contrast: had the top card been a unit, it is revealed but not drawn (ability still fully resolves)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", DIANA, "diana")
      .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
      .hand(P2, GUST, "gust")
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .deck(P1, [{ cardType: "unit", energyCost: 2, might: 2, name: "Grunt" }], ["grunt"])
      .build();
    await game.p2.move("brute", "bf1");
    await optIn(game);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("gust", { targets: "diana" });
    await bothPass(game);
    expect(game.zoneOf("diana")).toBe("hand");
    await bothPass(game);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
    }
    expect(game.zoneOf("grunt")).toBe("mainDeck");
    expect(game.p1.hand()).toEqual(["diana"]);
    expect(game.chain()).toEqual([]);
  });
});
