/**
 * Ruling 0c21b93a774b7fbe — Promising Future (OGN-115 → ogn-115-298, Action, 5 + [mind])
 *   "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest. Starting
 *    with the next player, each player plays those cards, ignoring Energy costs."
 *   × Relentless Pursuit (sfd-184-221, Action, 2 + [rainbow]) "Move a friendly unit. You may attach an Equipment …
 *     This turn, that unit has 'When I conquer, you may move me to my base.'"
 *
 * Q: I played Promising Future; my opponent played Relentless Pursuit to move into a battlefield. Does that showdown
 *    happen before I get to play my Promising Future card?
 * A: No. Promising Future's resolution cannot be interrupted: the opponent cannot play an Action from hand while it
 *    resolves, and if a card played VIA Promising Future (e.g. their Relentless Pursuit) moves a unit so a battlefield
 *    becomes contested, that showdown is only STAGED — it begins after Promising Future and all its plays have fully
 *    resolved and the chain is empty.
 * Rules: 336/343 (closed state → no Actions from hand), 359 (a resolving spell is not interrupted), 190.3.a + 344.2 /
 *        461.1 (contested → showdown/combat staged, begun at the cleanup once the chain is empty).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const RELENTLESS_PURSUIT = "sfd-184-221";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Future Unit ${n}` });

/**
 * P1's turn. P1 holds bf1 with Holder (2). P2's Pursuer (4) is in P2's base. P1: PF in hand, exactly 5 + [mind].
 * P2: a second Relentless Pursuit IN HAND (the "from hand" probe) and 2 energy + 2 rainbow-usable power; P2's deck top 5
 * starts with Relentless Pursuit (the card P2 will pick with PF). P1's deck: six vanilla units.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 4, name: "Pursuer" }, "pursuer")
    .deck(P1, [U(1), U(2), U(3), U(4), U(5), U(6)], ["a1", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [RELENTLESS_PURSUIT, U(2), U(3), U(4), U(5), U(6)], ["rpDeck", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf")
    .hand(P2, RELENTLESS_PURSUIT, "rpHand");
}

const activeShowdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).some((s) => s.active);

interface Trace {
  readonly prompts: Decision[];
  /** Was P2 ever offered playSpell:rpHand before PF's whole sequence finished? */
  p2CouldCastFromHand: boolean;
  /** Was a showdown ever active while PF's plays were still pending / on the chain? */
  showdownDuringResolution: boolean;
}

/**
 * Cast PF and drive its whole resolution: P1 banishes a3, P2 banishes the deck Relentless Pursuit; answer every
 * follow-up (a3 → base; RP's own choices take their single/first option). Stops at the first OPEN decision.
 */
async function resolvePromisingFuture(game: Game): Promise<Trace> {
  const trace: Trace = { p2CouldCastFromHand: false, prompts: [], showdownDuringResolution: false };
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    // The first OPEN decision (main priority, or the showdown PF's plays staged) is the END of PF's resolution —
    // stop before sampling, or the probe would count the post-resolution window against the ruling.
    if (d.kind === "action" && (d.context === "main" || d.context === "showdown")) {
      break;
    }
    if (game.p2.can("cast", "rpHand")) {
      trace.p2CouldCastFromHand = true;
    }
    const pfBusy = game.chain().length > 0 || d.kind !== "action";
    if (pfBusy && activeShowdown(game)) {
      trace.showdownDuringResolution = true;
    }
    trace.prompts.push(d);
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick") {
      const want = ["a3", "rpDeck", "pursuer", "base", "battlefield-bf1"].find((k) => d.options.some((o) => o.key === k || o.card === k));
      await game.seat(d.seat).pick(want ?? (d.options[0]?.key as string));
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).no(); // RP's optional attach — irrelevant
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return trace;
}

describe("Ruling 0c21b93a774b7fbe — a showdown caused during Promising Future waits until PF has fully resolved", () => {
  test("while PF is on the chain P2 only ever gets priority — Relentless Pursuit (an Action) is NOT playable from hand in response", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
    expect(game.p2.can("cast", "rpHand")).toBe(false);
    const r = await game.p2.try((p) => p.cast("rpHand", { targets: "pursuer" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["pf"]);
  });

  test("PF resolves uninterrupted: each player is asked (own seat) to banish one of THEIR top 5; P2 picks its Relentless Pursuit, P1 picks a unit — and at no point could P2 cast the copy in hand", async () => {
    const game = await board().build();
    const trace = await resolvePromisingFuture(game);
    const banishPicks = trace.prompts.filter((p) => p.kind === "pick" && /banish/i.test(p.prompt));
    expect(banishPicks.map((p) => p.seat).sort()).toEqual([P1, P2]);
    expect(trace.p2CouldCastFromHand).toBe(false);
    expect(game.zoneOf("rpHand")).toBe("hand");
    expect(game.zoneOf("pf")).toBe("trash");
  });

  test("P2's Relentless Pursuit played VIA PF moves Pursuer into P1's bf1 (paying only its [rainbow] power) and P1's unit is played too — yet NO showdown was active at any moment while those plays were pending or on the chain", async () => {
    const game = await board().build();
    const trace = await resolvePromisingFuture(game);
    expect(trace.showdownDuringResolution).toBe(false);
    expect(game.locationOf("pursuer")).toBe("bf1");
    expect(game.zoneOf("rpDeck")).toBe("trash"); // played and resolved
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 1 } }); // energy ignored, 1 power for [rainbow]
    expect(game.zoneOf("a3")).toBe("base"); // P1 still got to play its card
    expect(game.p1.energy()).toBe(0); // ignoring its energy cost
    expect(game.chain()).toEqual([]);
  });

  test("only now — PF done, chain empty — is bf1 Contested by P2 and the staged COMBAT there begins: attacker P2, defender P1", async () => {
    const game = await board().build();
    await resolvePromisingFuture(game);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    // The engine surfaces the pending combat to the turn player; begin it.
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bf1");
    }
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("pursuer").combatRole).toBe("attacker");
    expect(game.state("holder").combatRole).toBe("defender");
    await game.settle(); // 4 vs 2: Holder dies, P2 conquers bf1
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
