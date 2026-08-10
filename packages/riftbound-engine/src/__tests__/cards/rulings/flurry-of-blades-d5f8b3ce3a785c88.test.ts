/**
 * Ruling d5f8b3ce3a785c88 — Flurry of Blades (OGN-133 → ogn-133-298) · Reaction [1] "Deal 1 to all units at battlefields."
 *   × Baited Hook (OGN-242 → ogn-242-298, Gear) "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main
 *     Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it… Then recycle the rest."
 *   × Elder Dragon (UNL-118 → unl-118-219) · 10 Might "Any amount of your damage is enough to kill enemy units."
 *
 * Q: I Hook a unit; the opponent responds with Flurry of Blades (Elder Dragon around). Does the Hook still work, or does the target
 *    die first so the Hook has nothing to kill?
 * A: The Hook's target is chosen on activation, so the opponent can respond and kill it. Flurry resolves first; if the target dies,
 *    the Hook's kill fails, the "killed unit's Might" is null → you look at 5, can play nothing, recycle all 5. Elder Dragon makes
 *    ITS CONTROLLER's damage lethal to enemy units only — it neither protects nor endangers its controller's own units.
 * Rules: 355.5/355.7 (targets at activation), 336 (LIFO), 359.3.e.12 / 359.3.f.2.a (failed kill → null referent), 142.4.c.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLURRY = "ogn-133-298";
const BAITED_HOOK = "ogn-242-298";
const ELDER_DRAGON = "unl-118-219";
const U = (n: number) => ({ cardType: "unit", energyCost: n, might: n, name: `Deck Unit ${n}` });
const TOP5 = ["u1", "u2", "u3", "u4", "u5"];

/**
 * P1's turn with exactly [1][order]. P1: Baited Hook, Bait (1) + Biggie (5) at P1's bf1; deck top u1..u6 (Might = index).
 * P2: Sentry (3) at bf2, Flurry with [1]; Elder Dragon in the base of `dragonFor` (if any).
 */
function board(dragonFor?: typeof P1 | typeof P2) {
  const s = scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", { might: 1, name: "Bait" }, "bait")
    .unit(P1, "bf1", { might: 5, name: "Biggie" }, "biggie")
    .unit(P2, "bf2", { might: 3, name: "Sentry" }, "sentry")
    .hand(P2, FLURRY, "flurry")
    .deck(P1, [U(1), U(2), U(3), U(4), U(5), U(6)], [...TOP5, "u6"]);
  return dragonFor ? s.unit(dragonFor, "base", ELDER_DRAGON, "elder") : s;
}

async function hookTheBait(game: Game): Promise<void> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "bait" });
  } else {
    await game.p1.activate("hook", 0, { answers: ["bait"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bait");
    }
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.state("hook").isExhausted).toBe(true);
}

/** P1 passes; P2 answers with Flurry; both pass so Flurry resolves; stop with the Hook still on the chain. */
async function flurryInResponse(game: Game): Promise<void> {
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "flurry")).toBe(true);
  await game.p2.cast("flurry");
  expect(game.chain().map((c) => c.cardId)).toEqual(["hook", "flurry"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Flurry resolves
  expect(game.zoneOf("flurry")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["hook"]);
}

/** Drain the rest, recording whether any top-5 card was ever offered to banish/play. */
async function resolveHook(game: Game): Promise<boolean> {
  let offered = false;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick") {
      offered ||= d.options.some((o) => TOP5.includes((o.card ?? o.key) as string));
      if (d.allowDecline) {
        await game.seat(d.seat).decline();
      } else {
        await game.seat(d.seat).pick(d.options[0]!.key);
      }
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).no();
    } else {
      break;
    }
  }
  return offered;
}

describe("Ruling d5f8b3ce3a785c88 — Flurry of Blades kills Baited Hook's target in response; the Hook then finds nothing (Elder Dragon only sharpens its controller's damage)", () => {
  test("1. the target is locked on ACTIVATION: the Hook sits on the chain aimed at Bait, and P2 gets priority to respond with Flurry", async () => {
    const game = await board().build();
    await hookTheBait(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", controller: P1, targets: ["bait"] })]);
    expect(game.zoneOf("bait")).toBe("battlefield-bf1"); // not killed yet — that happens on resolution
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "flurry")).toBe(true);
  });

  test("2. Flurry resolves first and kills the 1-Might Bait; the Hook then resolves: its kill fails, NO top-5 unit is offered/banished/played, and all 5 are recycled (u6 becomes the top card)", async () => {
    const game = await board().build();
    await hookTheBait(game);
    await flurryInResponse(game);
    expect(game.zoneOf("bait")).toBe("trash"); // died to Flurry, not to the Hook
    expect(game.state("biggie")).toMatchObject({ damage: 1, zone: "battlefield-bf1" }); // no Dragon: 1 < 5
    const offered = await resolveHook(game);
    expect(offered).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units().sort()).toEqual(["biggie"]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("u6");
    expect(deck.slice(-5).sort()).toEqual([...TOP5].sort());
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("3. Elder Dragon on the FLURRY caster's side (P2): P2's 1 damage is lethal to every enemy unit — Biggie (5) dies too; P2's own Sentry just takes 1", async () => {
    const game = await board(P2).build();
    await hookTheBait(game);
    await flurryInResponse(game);
    expect(game.zoneOf("bait")).toBe("trash");
    expect(game.zoneOf("biggie")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf2");
    expect(await resolveHook(game)).toBe(false); // still nothing for the Hook to key off
    expect(game.p1.deck()[0]).toBe("u6");
  });

  test("4. Elder Dragon on the HOOK player's side (P1) changes nothing about P2's Flurry: it neither protects P1's units (Bait still dies at 1 ≥ 1) nor makes P2's damage lethal (Biggie survives on 1)", async () => {
    const game = await board(P1).build();
    await hookTheBait(game);
    await flurryInResponse(game);
    expect(game.zoneOf("bait")).toBe("trash");
    expect(game.state("biggie")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("sentry")).toMatchObject({ damage: 1, zone: "battlefield-bf2" }); // P2's damage to P2's unit — Dragon irrelevant
  });

  test("control: with no response the Hook kills Bait (1 Might) itself and offers the top-5 units with Might ≤ 2 (u1, u2) to banish-and-play", async () => {
    const game = await board().build();
    await hookTheBait(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("bait")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["u1", "u2"]);
  });
});
