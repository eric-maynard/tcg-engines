/**
 * Ruling 40ecc1be71f6fc76 — Reflection token (unl-t06) × Deceiver / LeBlanc legend (UNL-199 → unl-199-219)
 *   "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token there. It becomes
 *    a copy of another unit there. Give it [Temporary]."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction [3][chaos] "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Can I Star-Cross the unit LeBlanc is about to copy? What happens to the Reflection; what if two units are there?
 * A: Yes — the copy happens via the chain (token is created, then "it becomes a copy of another unit there" resolves,
 *    choosing its unit ON RESOLUTION), so the opponent can respond: bounce the intended unit (with another unit still
 *    there the token copies THAT one; with none left it copies nothing), or Star-Cross the token itself (it leaves the
 *    board and ceases to exist).
 * Rules: 383/384 (reflexive trigger on the chain), 355 (choice made at resolution), 186.1 (tokens off-board cease
 *        to exist), 477 (copy).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";
const STAR_CROSSED = "unl-128-219";
const DISCIPLINE = "ogn-058-298"; // a cheap P1 spell, only to open a later response window for P2

/** P1 (LeBlanc) attacks P2's bf1 (1-Might Doormat) with Bravo (5) [+ Alpha (3)]; P2 keeps Friend home with Star-Crossed money. */
function board(withAlpha: boolean) {
  let b = scenario()
    .legend(P1, DECEIVER, "deceiver")
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Doormat" }, "doormat")
    .unit(P1, "base", { might: 5, name: "Bravo" }, "bravo")
    .unit(P2, "base", { might: 2, name: "Friend" }, "friend")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "Junk" }, "junk")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, STAR_CROSSED, "starx");
  if (withAlpha) {
    b = b.unit(P1, "base", { might: 3, name: "Alpha" }, "alpha");
  }
  return b;
}

/** Conquer bf1, accept Deceiver's offer (discard Junk, exhaust the legend); answer the copy choice with Bravo if asked now. */
async function conquerAndTrigger(withAlpha: boolean): Promise<Game> {
  const game = await board(withAlpha).build();
  await game.p1.move(withAlpha ? ["alpha", "bravo"] : ["bravo"], "bf1");
  await game.settle();
  expect(game.zoneOf("doormat")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "deceiver" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick" && /discard/i.test(game.decision()?.prompt ?? "")) {
    await game.p1.pick("junk");
  }
  expect(game.zoneOf("junk")).toBe("trash");
  expect(game.state("deceiver").isExhausted).toBe(true);
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("bravo"); // (engine asks the copy source now — see the BUG tests)
  }
  return game;
}

function reflection(game: Game): string | undefined {
  return [...game.p1.units("bf1"), ...game.p1.base()].find((u) => game.state(u).isToken);
}

/**
 * Pass until the chain is empty. `copySource` answers the copy-source pick that Deceiver's reflexive
 * "it becomes a copy of another unit there" raises AS IT RESOLVES (rule 355 — named on resolution, not
 * at finalization), so callers that only care about the end state can name it up front.
 */
async function passUntilChainEmpty(game: Game, copySource?: string): Promise<void> {
  const answerCopyPick = async (): Promise<boolean> => {
    const d = game.decision();
    if (copySource !== undefined && d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(copySource);
      return true;
    }
    return false;
  };
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    if (await answerCopyPick()) continue;
    await game.acting().passPriority();
  }
  await answerCopyPick();
}

describe("Ruling 40ecc1be71f6fc76 — LeBlanc's Reflection copy uses the chain, so Star-Crossed can interfere", () => {
  test("1. the copy goes through the chain: with Deceiver's item pending, P2 gets priority and Star-Crossed is legal on the intended unit (Bravo)", async () => {
    const game = await conquerAndTrigger(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "deceiver", controller: P1, triggered: true })]);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    const pairs = (game.p2.option("cast", "starx")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(pairs).toContainEqual(["friend", "bravo"]);
    await game.p2.cast("starx", { targets: ["friend", "bravo"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["deceiver", "starx"]);
  });

  // Expected (ruling "Summary of Timing"): the Reflection token is created first (no priority), THEN the reflexive
  // "becomes a copy" item sits on the chain and its unit is chosen only when it resolves.
  // Actual: the engine asks the copy source while finalizing the trigger and creates the token only on resolution.
  test.failing("BUG: ruling 40ecc1be71f6fc76 — engine picks the copy source at finalization and mints the token on resolution (no token during the response window)", async () => {
    const game = await board(true).build();
    await game.p1.move(["alpha", "bravo"], "bf1");
    await game.settle();
    await game.p1.yes();
    if (game.decision()?.kind === "pick" && /discard/i.test(game.decision()?.prompt ?? "")) {
      await game.p1.pick("junk");
    }
    // No copy-source question yet; the token already stands at bf1 while the copy item is on the chain.
    expect(game.decision()?.kind).toBe("action");
    expect(reflection(game)).toBeDefined();
    expect(game.locationOf(reflection(game) as string)).toBe("bf1");
    expect(game.chain()).toHaveLength(1);
    await passUntilChainEmpty(game);
    // Choice on resolution between the two other units there.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  });

  // Expected (ruling §3 "Removal"): with two other units there, bouncing Bravo in response just removes one option —
  // on resolution P1 copies the remaining Alpha (3 Might).
  // Actual: the source was locked to Bravo at finalization; with Bravo gone the token enters as a blank 0-Might Reflection.
  test("ruling 40ecc1be71f6fc76 — after the chosen unit is Star-Crossed the token copies the OTHER unit still there (Alpha)", async () => {
    const game = await conquerAndTrigger(true);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("starx", { targets: ["friend", "bravo"] });
    await game.acting().passPriority();
    await game.acting().passPriority(); // Star-Crossed resolves
    expect(game.zoneOf("bravo")).toBe("hand");
    expect(game.zoneOf("friend")).toBe("hand");
    await passUntilChainEmpty(game); // Deceiver's item resolves
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      const d = game.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["alpha"]);
      await game.p1.pick("alpha");
    }
    const tok = reflection(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ isReady: true, location: "bf1", might: 3, name: "Alpha" });
    expect(game.state(tok as string).keywords).toContain("Temporary");
  });

  test("2/§1. only ONE other unit there and it is Star-Crossed in response: the copy has nothing to copy — a bare 0-Might Reflection with Temporary remains", async () => {
    const game = await conquerAndTrigger(false);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("starx", { targets: ["friend", "bravo"] });
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("bravo")).toBe("hand");
    expect(game.p1.hand()).toContain("bravo");
    expect(game.zoneOf("friend")).toBe("hand");
    await passUntilChainEmpty(game);
    const tok = reflection(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ isToken: true, location: "bf1", might: 0, name: "Reflection" });
    expect(game.state(tok as string).keywords).toContain("Temporary");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("uninterrupted: the Reflection enters bf1 ready as a copy of Bravo (5 Might) with Temporary", async () => {
    const game = await conquerAndTrigger(true);
    await passUntilChainEmpty(game, "bravo");
    const tok = reflection(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ isReady: true, isToken: true, location: "bf1", might: 5, name: "Bravo" });
    expect(game.state(tok as string).keywords).toContain("Temporary");
  });

  test("2/§3 'Full Removal'. Star-Crossed on the Reflection token itself: it leaves the board and ceases to exist (never reaches a hand)", async () => {
    const game = await conquerAndTrigger(true);
    await passUntilChainEmpty(game, "bravo");
    const tok = reflection(game) as string;
    expect(game.state(tok)).toMatchObject({ location: "bf1", name: "Bravo" });
    // Open a response window for P2: P1 casts a spell, P2 answers with Star-Crossed on [Friend, token].
    await game.p1.cast("discipline", { targets: "alpha" });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    const pairs = (game.p2.option("cast", "starx")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(pairs).toContainEqual(["friend", tok]);
    await game.p2.cast("starx", { targets: ["friend", tok] });
    await game.settle();
    expect(game.zoneOf(tok)).toBe("gone");
    expect(game.has(tok)).toBe(false);
    expect(game.p1.hand()).not.toContain(tok);
    expect(game.zoneOf("friend")).toBe("hand");
    expect(game.p1.units("bf1").sort()).toEqual(["alpha", "bravo"]);
    expect(game.violations()).toEqual([]);
  });
});
