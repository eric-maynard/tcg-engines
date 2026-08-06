/**
 * Ruling 24995e96f6e7c30f — Baited Hook (OGN-242 → ogn-242-298) · Gear · Order · 3
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a
 *    unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost.
 *    Then recycle the rest."
 *   × Stupefy (ogn-095-298) "[Reaction] Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: Can my opponent react before Baited Hook kills my unit?
 * A: Yes. "Kill a friendly unit" is after the ":" so it is the effect, not a cost; the friendly unit is a
 *    TARGET declared at finalization and killed only on resolution, so opponents get a normal reaction
 *    window in between. "Up to 1 more than the killed unit" looks back at the unit's Might immediately
 *    before it left the board — e.g. a Stupefy in response (4→3) lowers the ceiling to 4.
 * Rules: 377.1, 355.7/355.8/355.10, 377.3.b.2 / 406.4, 359.3.e.13 / 359.3.e.14.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const STUPEFY = "ogn-095-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. P1: Baited Hook (ready) + exactly [1][order]; friendly units Bait (4 might) and Tiny (1).
 * P2: Stupefy + [1]. P1's deck, top first: Big (5-might unit), Four (4), Junk (a spell), Two (2), Six (6).
 * P1's script pre-answers the "which friendly unit" target with Bait whenever the engine asks for it.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 4, name: "Bait" }, "bait")
    .unit(P1, "base", { might: 1, name: "Tiny" }, "tiny")
    .unit(P2, "base", { might: 3, name: "Onlooker" }, "onlooker")
    .hand(P2, STUPEFY, "stupefy")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 5, might: 5, name: "Big" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
        { cardType: "unit", energyCost: 6, might: 6, name: "Six" },
      ],
      ["big", "four", "junk", "two", "six"],
    )
    .script(P1, [(d) => (d.kind === "pick" && d.options.some((o) => o.key === "bait") && /target/i.test(d.prompt) ? "bait" : undefined)]);
}

/** Pass priority around until the "look at the top 5" prompt (or an open state) is reached. */
async function toLookPrompt(game: Game): Promise<Pick | null> {
  await game.settle(); // passes priority for both seats and feeds P1's scripted target answer
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => ["big", "four", "junk", "two", "six"].includes(o.card ?? o.key))) {
    return d;
  }
  return null;
}

describe("Ruling 24995e96f6e7c30f — Baited Hook: the kill is an effect on a declared target; opponents may react first", () => {
  test("activating pays [1][order] + exhausts the Hook and puts the ability on the chain — the friendly unit is NOT killed yet (kill is effect, not cost: 377.1)", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "hook")).toBe(true);
    await game.p1.activate("hook");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", controller: P1, triggered: false })]);
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.zoneOf("tiny")).toBe("base");
  });

  test("YES — the opponent gets a normal reaction window before the kill: after P1 passes, P2 holds priority with Bait still alive and may Stupefy it (377.3.b.2, 406.4)", async () => {
    const game = await board().build();
    await game.p1.activate("hook");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    await game.p2.cast("stupefy", { targets: "bait" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hook", "stupefy"]);
  });

  // Expected (355.7/355.8/355.10): the friendly unit is a target chosen and declared when the ability is
  // FINALIZED — i.e. P1 names Bait before P2 ever receives priority (either as part of `activate` or as an
  // immediate P1 prompt). Actual: the engine defers "Choose a target for Baited Hook" to resolution, after
  // both players have passed.
  test.failing("BUG: ruling 24995e96f6e7c30f — the friendly unit to kill is declared at finalization, before P2's reaction window (engine asks only on resolution)", async () => {
    const game = await board().build();
    game.clearScript(P1);
    const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
    if (field) {
      await game.p1.activate("hook", 0, { targets: "bait" });
    } else {
      await game.p1.activate("hook");
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("bait");
    }
    // Only now does P2 get to respond — and no further target question remains for P1.
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.decision()?.kind === "pick" && /target/i.test(game.decision()?.prompt ?? "")).toBe(false);
    expect(game.zoneOf("bait")).toBe("trash");
  });

  test("example: P2's Stupefy resolves first (LIFO) — Bait is 3 Might with the Hook ability still on the chain; then the Hook resolves and Bait is killed", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.activate("hook");
    await game.p1.passPriority();
    await game.p2.cast("stupefy", { targets: "bait" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Stupefy resolves
    expect(game.state("bait").might).toBe(3);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1); // Stupefy's draw 1
    expect(game.chain().map((c) => c.cardId)).toEqual(["hook"]);
    expect(game.zoneOf("bait")).toBe("base"); // still not killed
    await toLookPrompt(game); // both pass → Hook resolves (scripted target: Bait)
    expect(game.zoneOf("bait")).toBe("trash");
    expect(game.zoneOf("tiny")).toBe("base");
  });

  // Expected (359.3.e.13/14): with Stupefy applied, Bait had 3 Might immediately before it died → the look
  // at the top 5 lets P1 banish a UNIT with Might ≤ 4: Four and Two are eligible; Big (5), Six (6) and the
  // spell Junk are not; the choice is optional ("you may"). Actual: the engine shows all five cards in a
  // mandatory "Pick a revealed card to draw" prompt — no might ceiling, no unit filter, draw instead of
  // banish-and-play.
  test("ruling 24995e96f6e7c30f — after Stupefy (4→3) the look offers only units with Might ≤ 4 (Four, Two — not Big/Six/Junk), optionally", async () => {
    const game = await board().build();
    await game.p1.activate("hook");
    await game.p1.passPriority();
    await game.p2.cast("stupefy", { targets: "bait" });
    const d = await toLookPrompt(game);
    expect(game.zoneOf("bait")).toBe("trash");
    expect(d).not.toBeNull();
    const offered = (d as Pick).options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["four", "two"]);
    expect((d as Pick).allowDecline).toBe(true);
  });

  // Expected (control, no reaction): Bait dies at 4 Might → ceiling 5: Big, Four, Two eligible (not Six, not
  // the spell). Choosing Big banishes it and P1 plays it ignoring its cost (P1 has 0 energy left) → Big ends
  // on P1's board; the other four cards are recycled and remain in the deck. Actual: see above.
  test("ruling 24995e96f6e7c30f — control (no Stupefy): ceiling is 4+1 = 5 → Big is eligible; choosing it plays Big for free and recycles the rest", async () => {
    const game = await board().build();
    await game.p1.activate("hook");
    const d = await toLookPrompt(game);
    expect(game.zoneOf("bait")).toBe("trash");
    expect(d).not.toBeNull();
    const offered = (d as Pick).options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["big", "four", "two"]);
    await game.p1.pick("big");
    await game.settle({ policy: "first" }); // destination / follow-ups of the free play
    expect(["base", "chain"]).toContain(game.zoneOf("big"));
    await game.settle({ policy: "first" });
    expect(game.zoneOf("big")).toBe("base");
    expect(game.p1.energy()).toBe(0); // ignoring its cost
    for (const rest of ["four", "junk", "two", "six"]) {
      expect(game.zoneOf(rest)).toBe("mainDeck");
    }
    expect(game.p1.hand()).not.toContain("four"); // nothing was DRAWN
  });
});
