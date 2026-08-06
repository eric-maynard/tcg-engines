/**
 * Ruling e574b44846512539 — Karthus, Eternal (OGN-236 → ogn-236-298, 3 Might Order champion)
 *   "Your [Deathknell] effects trigger an additional time."
 *   × Not So Fast (sfd-045-221, Reaction, [2][calm]) "Counter an enemy spell or ability that chooses a friendly
 *     unit or gear."
 *   Deathknell units: Ruined Rex (unl-067-219, "[Deathknell] — Deal 4 to an enemy unit" — CHOOSES) and
 *   Watchful Sentry (ogn-096-298, "[Deathknell] — Draw 1" — chooses nothing). Rex/Sentry are killed by P1's own
 *   Final Spark (ogs-022-024, deal 8) / Incinerate (ogs-003-024, deal 2).
 *
 * Q: Does a single Not So Fast counter both Deathknell triggers when Karthus is on the board?
 * A: No. Each trigger is its own independent pending item; one Not So Fast counters only one of them (if both
 *    are legal targets). And Not So Fast can only target a trigger that chooses one of ITS controller's units
 *    or gear — otherwise it cannot target either trigger.
 * Rules: 808.1.d.2, 355.5, 337.1.b, 425.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const RUINED_REX = "unl-067-219";
const WATCHFUL_SENTRY = "ogn-096-298";
const NOT_SO_FAST = "sfd-045-221";
const FINAL_SPARK = "ogs-022-024";
const INCINERATE = "ogs-003-024";

/** P1: Karthus in base, Rex at bf1, Final Spark (8 energy). P2: two 5-Might units, ONE Not So Fast ([2]+[calm]). */
function rexBoard() {
  return scenario()
    .resources(P1, { energy: 8 })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", KARTHUS, "karthus")
    .unit(P1, "bf1", RUINED_REX, "rex")
    .unit(P2, "base", { might: 5, name: "Victim A" }, "victimA")
    .unit(P2, "base", { might: 5, name: "Victim B" }, "victimB")
    .hand(P1, FINAL_SPARK, "spark")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** P1: Karthus in base, Sentry at bf1, Incinerate (2 energy). P2: a unit + ONE Not So Fast. */
function sentryBoard() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", KARTHUS, "karthus")
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
    .unit(P2, "base", { might: 5, name: "Victim A" }, "victimA")
    .hand(P1, INCINERATE, "burn")
    .hand(P2, NOT_SO_FAST, "nsf");
}

const triggersFrom = (game: Game, card: string) => game.chain().filter((i) => i.cardId === card && i.triggered);

/** P1 kills its own unit with the board's spell; both pass so it resolves and the unit dies. */
async function killOwn(game: Game, spell: string, unit: string): Promise<void> {
  await game.p1.cast(spell, { targets: unit });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf(unit)).toBe("trash");
}

/** Answer P1's per-item target prompts (355.5) if the engine asks now; otherwise queue them for resolution. */
async function chooseRexTargets(game: Game, picks: string[]): Promise<void> {
  if (game.decision()?.kind === "pick") {
    for (const p of picks) {
      const d = game.decision();
      expect(d).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick(p);
    }
  } else {
    game.script(P1, picks);
  }
}

describe("Ruling e574b44846512539 — Karthus doubling a Deathknell vs ONE Not So Fast", () => {
  // Expected: Rex's death with Karthus out puts TWO independent Rex items on the chain (each P1's ability, each
  // choosing its own enemy unit). Actual: Ruined Rex's keyword-only Deathknell never triggers and Karthus's
  // "trigger-double" static is not applied — the chain is empty after Final Spark resolves.
  test.failing("BUG: ruling e574b44846512539 — with Karthus, Rex dying yields two separate Deathknell chain items (engine: none)", async () => {
    const game = await rexBoard().build();
    await killOwn(game, "spark", "rex");
    await chooseRexTargets(game, ["victimA", "victimB"]);
    const items = triggersFrom(game, "rex");
    expect(items).toHaveLength(2);
    expect(items[0]?.id).not.toBe(items[1]?.id);
    expect(items.every((i) => i.controller === P1)).toBe(true);
  });

  // Expected: with both Rex items on the chain P2's single Not So Fast is offered BOTH as legal targets (each is
  // an enemy ability choosing P2's unit) but counters exactly ONE; the other still resolves — 4 total damage on
  // P2's side, not 0 and not 8. Actual: nothing ever triggers, so there is nothing to counter.
  test.failing("BUG: ruling e574b44846512539 — one Not So Fast sees two targets, counters one; the surviving trigger deals its 4 (engine: no triggers)", async () => {
    const game = await rexBoard().build();
    await killOwn(game, "spark", "rex");
    await chooseRexTargets(game, ["victimA", "victimB"]);
    expect(triggersFrom(game, "rex")).toHaveLength(2);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const offered = game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered).toHaveLength(2); // each trigger separately targetable
    const first = offered[0];
    await game.p2.cast("nsf", { targets: (Array.isArray(first) ? first : [first]) as string[] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p2.can("cast", "nsf")).toBe(false); // the one copy is spent
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.chain().length).toBe(0);
    const total = game.state("victimA").damage + game.state("victimB").damage;
    expect(total).toBe(4);
    expect(game.zoneOf("nsf")).toBe("trash");
  });

  // "Otherwise, Not So Fast cannot target either trigger": a Deathknell that chooses nothing (Sentry: Draw 1).
  test("non-choosing Deathknell (Watchful Sentry): with its trigger(s) on the chain, P2's Not So Fast has no legal target", async () => {
    const game = await sentryBoard().build();
    await killOwn(game, "burn", "sentry");
    expect(triggersFrom(game, "sentry").length).toBeGreaterThanOrEqual(1);
    // P1 holds priority first (controller of the newest item); after P1 passes, P2 may respond — but not with NSF.
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    const r = await game.p2.try((p) => p.cast("nsf"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
  });

  // Expected: Karthus doubles the Sentry's Deathknell too — two Sentry items, and after both resolve P1 has drawn 2.
  // Actual: only one item; P1 draws 1.
  test.failing("BUG: ruling e574b44846512539 — Karthus doubles the Sentry's Deathknell: two chain items, P1 draws 2 (engine: one)", async () => {
    const game = await sentryBoard().build();
    const hand = game.p1.hand().length; // burn is still in hand here
    await killOwn(game, "burn", "sentry");
    expect(triggersFrom(game, "sentry")).toHaveLength(2);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
  });
});
