/**
 * Ruling e79d0275f35c448d — Cull the Weak (OGN-209 → ogn-209-298) · [2]+[order] "Each player kills one of their units."
 *   × Scuttle Crab (UNL-053 → unl-053-219) · 0 Might · "[Deathknell] Choose an opponent. They reveal their hand. You can look
 *     at their facedown cards this turn. Gain 1 XP."
 *   × Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."   (Cull SFD-134 listed by name-collision only.)
 *
 * Q: Opponent's Cull the Weak kills my Scuttle Crab and their Watchful Sentry together. Does the Crab's reveal show their
 *    hand before or after the Sentry's draw?
 * A: Both die simultaneously and both Deathknells trigger together; the TURN PLAYER puts theirs on the chain first, then
 *    the other player, and the chain resolves LIFO. Opponent's turn (they cast it): Sentry first (bottom), Crab on top ⇒
 *    Crab resolves FIRST — the reveal does NOT include the drawn card. My turn: Crab bottom, Sentry top ⇒ the draw happens
 *    first and the reveal DOES include the drawn card.
 * Rules: 376.3.b.1 / 383.3.c (simultaneous triggers of different controllers: turn order), 340 (LIFO), 424.1 (reveal).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const SCUTTLE_CRAB = "unl-053-219";
const WATCHFUL_SENTRY = "ogn-096-298";
const FILL = "ogn-175-298";

/** "Me" = P1 with a lone Scuttle Crab; the opponent P2 has a lone Watchful Sentry, one known card in hand and a known top card. */
function board(caster: typeof P1 | typeof P2) {
  return scenario()
    .active(caster)
    .resources(caster, { energy: 2, power: { order: 1 } })
    .unit(P1, "base", SCUTTLE_CRAB, "crab")
    .unit(P2, "base", WATCHFUL_SENTRY, "sentry")
    .hand(P2, FILL, "held")
    .deck(P2, [FILL, FILL], ["topdeck", "second"])
    .hand(caster, CULL_THE_WEAK, "cull");
}

const revealed = (game: Game) => (game.gameState.publicReveals ?? []).flatMap((r) => [...r.cardIds]);

/** Cast Cull, pass to resolution, answer the forced kills (each side has exactly one unit) until both are dead. */
async function cullKillsBoth(game: Game, caster: "p1" | "p2"): Promise<void> {
  await game[caster].cast("cull");
  for (let i = 0; i < 10 && !(game.zoneOf("crab") === "trash" && game.zoneOf("sentry") === "trash"); i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      await game.acting().passPriority();
    } else if (d.kind === "pick") {
      const only = d.options[0]!;
      await game.seat(d.seat).pick(only.card ?? only.key);
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.zoneOf("crab")).toBe("trash");
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.zoneOf("cull")).toBe("trash");
}

/** Resolve whatever is on the chain, answering the Crab's "choose an opponent" (forced in 1v1) if it is asked. */
async function resolveDeathknells(game: Game): Promise<void> {
  for (let i = 0; i < 12 && (game.chain().length > 0 || game.decision()?.kind !== "action"); i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else if (d.kind === "pick" && d.seat === P1) {
      const o = d.options[0]!;
      await game.p1.pick(o.seatRef ?? o.card ?? o.key);
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling e79d0275f35c448d — Scuttle Crab vs Watchful Sentry Deathknells off one Cull the Weak: turn order decides what the reveal shows", () => {
  test("OPPONENT's turn (P2 casts Cull): both die at once; P2's Sentry trigger goes on the chain first (bottom) and P1's Crab trigger on top", async () => {
    const game = await board(P2).build();
    await cullKillsBoth(game, "p2");
    const triggers = game.chain().filter((c) => c.triggered);
    expect(triggers.map((c) => [c.cardId, c.controller])).toEqual([
      ["sentry", P2],
      ["crab", P1],
    ]);
    expect(game.p2.hand()).toEqual(["held"]); // nothing drawn yet
    expect(revealed(game)).toEqual([]); // nothing revealed yet
  });

  test("OPPONENT's turn: LIFO ⇒ the Crab resolves FIRST — P2 reveals only what they currently hold ('held'); the Sentry's draw ('topdeck') comes afterwards and was never revealed", async () => {
    const game = await board(P2).build();
    await cullKillsBoth(game, "p2");
    // Resolve just the top item (Crab).
    await game.acting().passPriority();
    if (game.chain().length === 2) {
      await game.acting().passPriority();
    }
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      const d = game.decision();
      const o = d?.kind === "pick" ? d.options[0]! : undefined;
      await game.p1.pick(o?.seatRef ?? o?.card ?? o?.key ?? P2);
    }
    expect(revealed(game)).toEqual(["held"]);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.hand()).toEqual(["held"]); // still no draw: the Sentry trigger is below
    expect(game.chain().map((c) => c.cardId)).toEqual(["sentry"]);
    await resolveDeathknells(game);
    expect(game.p2.hand().sort()).toEqual(["held", "topdeck"]);
    expect(revealed(game)).not.toContain("topdeck");
    expect(game.violations()).toEqual([]);
  });

  test("MY turn (P1 casts Cull): P1's Crab trigger goes first (bottom), P2's Sentry on top ⇒ the Sentry draws FIRST, then the Crab's reveal shows 'held' AND the freshly drawn 'topdeck'", async () => {
    const game = await board(P1).build();
    await cullKillsBoth(game, "p1");
    const triggers = game.chain().filter((c) => c.triggered);
    expect(triggers.map((c) => [c.cardId, c.controller])).toEqual([
      ["crab", P1],
      ["sentry", P2],
    ]);
    await resolveDeathknells(game);
    expect(game.p2.hand().sort()).toEqual(["held", "topdeck"]);
    expect(revealed(game).sort()).toEqual(["held", "topdeck"]);
    expect(game.p1.xp()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
