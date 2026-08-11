/**
 * Interaction: First Mate (ogn-132-298) "When you play me, ready another unit."
 *           × Twilight Reveler (ven-020-166) "When I attack, ready another friendly unit."
 *
 * The only textual difference is the word "friendly".
 *
 * Q: which units go on the menu, and what happens when the only legal choice
 *    helps the opponent — or when there is no legal choice at all?
 *
 * Rules
 *  - 355.9.a.1  "unit" = a unit on the board; no location restriction is implied,
 *               so a unit sitting in a base is as choosable as one at a battlefield.
 *  - 355.9.b    an unqualified "a unit" carries NO controller restriction — enemy
 *               units are legal choices.
 *  - 355.9.c    "another" removes only the source of the ability itself.
 *  - 740.1.a/.b "friendly" = shares a controller with the source; "enemy" = does not.
 *  - 355.8      an ability only goes on the chain if every target has a legal choice;
 *               with zero candidates the trigger is never seen at all.
 *  - 383.4.e    no "may" anywhere in the effect ⇒ the choice is mandatory.
 *  - 415.1.b/c  readying an already-ready unit is a legal no-op — that is a rule about
 *               the ACTION, not a targeting restriction, so ready units stay on the menu.
 *
 * Expected: First Mate offers every other unit on the board (both sides, both
 * locations, ready or exhausted) and MUST be pointed at the enemy unit when that
 * is the only other unit (RiftJudge #4641). Twilight Reveler offers only P1's own
 * units — including one in base and including a co-attacker (RiftJudge #11950) —
 * and, with no friendly unit besides itself, produces no prompt whatsoever.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIRST_MATE = "ogn-132-298";
const TWILIGHT_REVELER = "ven-020-166";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** The card ids a `pick` decision currently offers. */
function targetsOffered(game: Game): string[] {
  const d = game.decision();
  if (!d || d.kind !== "pick") return [];
  return d.options.map((o) => o.card ?? o.key);
}

/** The base board: P2 has an exhausted unit at bf1 and a ready one in base; P1 an exhausted one in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2 }, "enemyExhausted", { exhausted: true })
    .unit(P2, "base", { might: 2 }, "enemyReady")
    .unit(P1, "base", { might: 2 }, "myExhausted", { exhausted: true })
    .hand(P1, FIRST_MATE, "firstMate")
    .hand(P1, TWILIGHT_REVELER, "revelerInHand");
}

/** Resolve just the chain item (both seats pass priority) without running combat. */
async function resolveChainOnly(game: Game) {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("First Mate 'another unit' vs Twilight Reveler 'another friendly unit'", () => {
  test("(a) First Mate offers EVERY other unit — enemy or friendly, battlefield or base, exhausted or ready — but not itself", async () => {
    const game = await board().build();
    await game.p1.play("firstMate", { to: "base" });
    const offered = targetsOffered(game);
    // rule 355.9.b — no controller qualifier, so both of P2's units are choosable.
    expect(offered).toContain(game.card("enemyExhausted"));
    expect(offered).toContain(game.card("enemyReady"));
    // rule 355.9.a.1 — "unit" has no location restriction: a base unit qualifies.
    expect(offered).toContain(game.card("myExhausted"));
    // rule 355.9.c — "another" excludes only the source.
    expect(offered).not.toContain(game.card("firstMate"));
    expect(offered).toHaveLength(3);
  });

  test("(a) an ALREADY-READY unit stays on the menu; readying it is a legal no-op (415.1.b/415.1.c)", async () => {
    const game = await board().build();
    await game.p1.play("firstMate", { to: "base" });
    expect(targetsOffered(game)).toContain(game.card("enemyReady"));
    await game.p1.pick("enemyReady");
    await resolveChainOnly(game);
    expect(game.state("enemyReady").isReady).toBe(true); // no-op, not an error
    expect(game.state("enemyExhausted").isReady).toBe(false); // nothing else moved
    expect(game.state("myExhausted").isReady).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(a) pointing First Mate at the ENEMY exhausted unit actually readies it", async () => {
    const game = await board().build();
    await game.p1.play("firstMate", { to: "base" });
    await game.p1.pick("enemyExhausted");
    await resolveChainOnly(game);
    expect(game.state("enemyExhausted").isReady).toBe(true);
    expect(game.state("myExhausted").isReady).toBe(false);
  });

  test("(b) when the enemy unit is the ONLY other unit, P1 may not decline — it is readied (355.8 + 383.4.e, RiftJudge #4641)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "enemyExhausted", { exhausted: true })
      .hand(P1, FIRST_MATE, "firstMate")
      .build();
    await game.p1.play("firstMate", { to: "base" });
    // Sole legal choice ⇒ auto-bound; there is no decline-only prompt.
    const d = game.decision();
    expect(d?.kind).not.toBe("pick");
    await resolveChainOnly(game);
    expect(game.state("enemyExhausted").isReady).toBe(true);
  });

  test("(c) Twilight Reveler's attack trigger offers ONLY friendly units (740.1.a) — no enemy unit, not even the sole exhausted one", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "enemyExhausted", { exhausted: true })
      .unit(P2, "base", { might: 2 }, "enemyReady")
      .unit(P1, "base", { might: 2 }, "myExhausted", { exhausted: true })
      .unit(P1, "base", { might: 1 }, "otherFriendly", { exhausted: true })
      .unit(P1, "base", TWILIGHT_REVELER, "reveler")
      .build();
    await game.p1.move("reveler", "bf1"); // moving into an enemy-held battlefield = attacking
    const offered = targetsOffered(game);
    expect(offered).toContain(game.card("myExhausted"));
    expect(offered).toContain(game.card("otherFriendly"));
    expect(offered).not.toContain(game.card("enemyExhausted"));
    expect(offered).not.toContain(game.card("enemyReady"));
    expect(offered).not.toContain(game.card("reveler"));
    expect(offered).toHaveLength(2);
  });

  test("(c) a friendly unit sitting in BASE qualifies even though Twilight Reveler is at a battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "enemyExhausted", { exhausted: true })
      .unit(P2, "base", { might: 2 }, "enemyReady")
      .unit(P1, "base", { might: 2 }, "myExhausted", { exhausted: true })
      .unit(P1, "base", TWILIGHT_REVELER, "reveler")
      .build();
    await game.p1.move("reveler", "bf1");
    expect(game.chain()[0]?.targets).toEqual([game.card("myExhausted")]); // sole candidate, auto-bound
    await resolveChainOnly(game);
    expect(game.state("myExhausted").isReady).toBe(true);
    expect(game.locationOf("myExhausted")).toBe("base"); // readied where it stands
    expect(game.state("enemyExhausted").isReady).toBe(false); // "friendly" kept the enemy out
  });

  test("(c) a friendly unit that ATTACKED ALONGSIDE Twilight Reveler is eligible (RiftJudge #11950)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "enemyExhausted", { exhausted: true })
      .unit(P1, "base", { might: 1 }, "buddy")
      .unit(P1, "base", TWILIGHT_REVELER, "reveler")
      .build();
    await game.p1.move(["reveler", "buddy"], "bf1");
    expect(game.state("buddy").isReady).toBe(false); // exhausted by the move
    expect(game.chain()[0]?.targets).toEqual([game.card("buddy")]);
    await resolveChainOnly(game);
    expect(game.state("buddy").isReady).toBe(true);
    expect(game.locationOf("buddy")).toBe("bf1");
  });

  test("(d) with no other friendly unit the trigger never reaches the chain — no prompt, and the enemy unit is NOT readied (355.8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "enemyExhausted", { exhausted: true })
      .unit(P1, "base", TWILIGHT_REVELER, "reveler")
      .build();
    await game.p1.move("reveler", "bf1");
    expect(game.chain()).toEqual([]); // 355.8 — no valid choice ⇒ never put on the chain
    const d = game.decision();
    expect(d?.kind).toBe("action"); // straight into the showdown, not a decline-only pick
    expect(game.state("enemyExhausted").isReady).toBe(false); // must NOT widen to the enemy
    expect(game.violations()).toEqual([]);
  });
});
