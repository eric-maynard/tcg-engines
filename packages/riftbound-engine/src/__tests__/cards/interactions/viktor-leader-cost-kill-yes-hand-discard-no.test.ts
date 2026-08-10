/**
 * Interaction: Viktor, Leader (ogn-246-298) · Unit · Order · 4 + [order] · 4 Might
 *     "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *   × Sacrifice (unl-173-219) · Reaction spell · Order · 1
 *     "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Get Excited! (ogn-008-298) · Action spell · Fury · 2 + [fury]
 *     "Discard 1. Deal its Energy cost as damage to a unit at a battlefield."
 *   (+ Immortal Phoenix ogn-037-298 in P1's trash — "When you kill a unit with a spell, you may pay [1][fury] to
 *      play me from your trash." — a killedBy / responsible-player PROBE: it offers exactly when P1 is credited with
 *      killing a unit and the credited source is a SPELL.)
 *
 * Position: P1's turn. P1 controls Viktor, a 5-Might non-Recruit M in base and a 3-Might non-Recruit W at bf1 (P1's);
 * P2's 4-Might Z stands at bf2 (P2's). P1's hand: Sacrifice, Get Excited!, and U — a 4-cost unit CARD.
 *
 * Question. (a) P1 plays Sacrifice killing M as its ADDITIONAL COST — a cost-kill is not an effect and not damage; does
 * M "die" for Viktor? When does the Recruit trigger pend relative to Sacrifice resolving? killedBy? (b) P1 plays Get
 * Excited! at Z, discarding U (hand → trash), 4 damage kills Z. Does U hitting the trash count as "a unit you control
 * dies"? Does Z's death give a Recruit? (c) Same spell aimed at P1's OWN W (3 Might) — Recruit? killedBy?
 *
 * Rules: 428.1 (Killing = permanent board → trash), 428.1.a.1 (Active Kill includes "as a cost for a card or
 * ability"), 428.1.a.2 / 428.4 (Passive Kill: lethal damage → Cleanup), 428.2 / 428.2.a (only Killed if the origin
 * was a board zone), 428.5.b (a spell containing a kill instruction is responsible), 428.5.c / 428.5.c.1 (a Cleanup
 * kill is attributed to the spell that just dealt the damage; its player is responsible).
 *
 * Expected: (a) YES — the cost-kill is a real Kill (428.1.a.1); M is in the trash while Sacrifice is still on the
 * chain, Viktor's trigger sits ABOVE Sacrifice and resolves first (Recruit token in base), then Sacrifice (draw 2,
 * +1 exhausted rune). killedBy = Sacrifice / P1 → the Phoenix probe offers. (b) NO Recruit at all: U hand → trash is
 * a discard, never a death (428.2.a); Z dies (killedBy = Get Excited! / P1 → probe offers) but is an enemy unit.
 * (c) W takes 4 ≥ 3 and is killed by the Cleanup (Passive Kill) — a death of another non-Recruit unit P1 controls →
 * exactly one Recruit; killedBy = Get Excited! / P1 → probe offers.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR_LEADER = "ogn-246-298";
const SACRIFICE = "unl-173-219";
const GET_EXCITED = "ogn-008-298";
const IMMORTAL_PHOENIX = "ogn-037-298"; // probe: "When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."

/** A 4-cost, 4-Might vanilla unit CARD (the discard fodder whose Energy cost sets Get Excited!'s damage). */
const UNIT_U = { cardType: "unit", energyCost: 4, might: 4, name: "Unit U" } as const;

/**
 * P1's turn. P1: 5 energy + 2 fury (Sacrifice [1] or Get Excited! [2][fury], plus the probe's [1][fury] left payable
 * so its "you may" is genuinely offered), Viktor + M (5) in base, W (3) at bf1, Phoenix in trash, the three hand
 * cards. P2: Z (4) at bf2.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", VIKTOR_LEADER, "viktor")
    .unit(P1, "base", { might: 5, name: "Mighty M" }, "M")
    .unit(P1, "bf1", { might: 3, name: "Wanderer W" }, "W")
    .unit(P2, "bf2", { might: 4, name: "Enemy Z" }, "Z")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .hand(P1, SACRIFICE, "sac")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, UNIT_U, "U");
}

const recruits = (game: Game): string[] => game.p1.base().filter((id) => game.state(id).name === "Recruit");

/**
 * Settle to the open main phase, declining every "you may" on the way; returns the sources of the opt-ins P1 was
 * offered (the Phoenix probe shows up here iff P1 killed a unit with a spell).
 */
async function drainDeclining(game: Game): Promise<string[]> {
  const offered: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
      break;
    }
    offered.push(d.source?.cardId ?? d.prompt);
    await game.seat(d.seat).no();
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return offered;
}

/** Cast Get Excited! at `target`; when the discard is asked on resolution, discard U. Stops before any opt-in. */
async function getExcitedDiscardingU(game: Game, target: "Z" | "W"): Promise<void> {
  await game.p1.cast("ge", { targets: target });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ge", controller: P1, targets: [target] })]);
  await game.settle(); // both pass → resolves → "Discard 1" asks P1 which hand card
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("U");
}

describe("(a) Sacrifice: killing M as an ADDITIONAL COST is a real death — Viktor triggers, above the spell", () => {
  test("only the friendly Mighty unit is a legal sacrifice: M (5) — not Viktor (4), not W (3), not the enemy Z", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice")?.options ?? [];
    expect([...offered]).toEqual(["M"]);
    expect((await game.p1.try((p) => p.cast("sac", { sacrifice: "W" }))).ok).toBe(false);
  });

  test("paying the cost puts M in P1's trash at once (428.1.a.1, 428.2) while Sacrifice is still on the chain — and Viktor's trigger is already pending ABOVE it", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "M" });
    expect(game.p1.energy()).toBe(4);
    expect(game.zoneOf("M")).toBe("trash");
    expect(game.p1.trash()).toContain("M");
    expect(game.zoneOf("sac")).toBe("chain");
    const chain = game.chain().map((c) => c.cardId);
    expect(chain[0]).toBe("sac");
    expect(chain).toContain("viktor");
    expect(chain.indexOf("viktor")).toBeGreaterThan(chain.indexOf("sac"));
    expect(game.chain().find((c) => c.cardId === "viktor")).toMatchObject({ controller: P1, triggered: true });
    expect(recruits(game)).toEqual([]); // nothing has resolved yet
  });

  test("killedBy = Sacrifice (a spell), responsible = P1 (428.5.b): the Immortal Phoenix probe 'you killed a unit with a spell' is offered to P1", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "M" });
    const offered = await drainDeclining(game);
    expect(offered).toContain("phoenix");
  });

  test("LIFO: Viktor's trigger resolves FIRST — the Recruit token is in base while Sacrifice is still waiting on the chain (hand unchanged, no rune yet)", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "M" });
    // Decline the probe if it is asked during finalization, then pass priority around until only Sacrifice is left.
    for (let i = 0; i < 12 && game.chain().length > 1; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else {
        await game.acting().passPriority();
      }
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["sac"]);
    expect(recruits(game)).toHaveLength(1);
    expect(game.p1.hand().sort()).toEqual(["U", "ge"].sort());
    expect(game.p1.runes()).toEqual([]);
  });

  test("then Sacrifice resolves: P1 draws 2 and channels 1 rune EXHAUSTED; final board = Viktor + one 1-Might Recruit token, M in trash, Sacrifice in trash", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length; // 3
    await game.p1.cast("sac", { sacrifice: "M" });
    await drainDeclining(game);
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    const tokens = recruits(game);
    expect(tokens).toHaveLength(1);
    expect(game.state(tokens[0] as string)).toMatchObject({ isToken: true, might: 1, zone: "base" });
    expect(game.p1.base().sort()).toEqual(["viktor", tokens[0] as string].sort());
    expect(game.zoneOf("M")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Get Excited! at enemy Z, discarding unit card U: a discard is not a death, an enemy death is not yours", () => {
  test("targets offered at play time are the units AT A BATTLEFIELD only: W and Z — not Viktor / M in base", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "ge")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
    expect(offered).toEqual(["W", "Z"]);
  });

  test("U goes hand → trash (a DISCARD, 428.2.a: never on the board) and Z takes U's Energy cost (4) ≥ 4 → killed by the Cleanup into P2's trash", async () => {
    const game = await board().build();
    await getExcitedDiscardingU(game, "Z");
    await drainDeclining(game);
    expect(game.zoneOf("U")).toBe("trash");
    expect(game.p1.trash()).toContain("U");
    expect(game.zoneOf("Z")).toBe("trash");
    expect(game.p2.trash()).toContain("Z");
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
  });

  test("Viktor is SILENT: no Viktor item ever appears and no Recruit token is created — neither for U (not a death) nor for Z (not a unit P1 controls)", async () => {
    const game = await board().build();
    await getExcitedDiscardingU(game, "Z");
    expect(game.chain().some((c) => c.cardId === "viktor")).toBe(false);
    await drainDeclining(game);
    expect(recruits(game)).toEqual([]);
    expect(game.p1.base().sort()).toEqual(["M", "viktor"].sort());
    expect(game.violations()).toEqual([]);
  });

  test("Z's kill IS credited to Get Excited! / P1 (428.5.c, 428.5.c.1): the Phoenix probe is offered — so the silence above is about WHOSE unit died, not about kill credit", async () => {
    const game = await board().build();
    await getExcitedDiscardingU(game, "Z");
    const offered = await drainDeclining(game);
    expect(offered).toContain("phoenix");
  });
});

describe("(c) Get Excited! at P1's own W: a Passive (lethal-damage) kill is a death too — Viktor triggers", () => {
  test("W (3 Might) takes 4 → killed by the Cleanup into P1's trash; U discarded; Viktor's trigger goes on the chain controlled by P1", async () => {
    const game = await board().build();
    await getExcitedDiscardingU(game, "W");
    expect(game.zoneOf("W")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["W", "U", "ge"]));
    expect(game.chain().find((c) => c.cardId === "viktor")).toMatchObject({ controller: P1, triggered: true });
  });

  test("after everything resolves: exactly ONE 1-Might Recruit token in P1's base (for W — none for U); M and Viktor untouched; bf1 now empty of P1 units", async () => {
    const game = await board().build();
    await getExcitedDiscardingU(game, "W");
    await drainDeclining(game);
    const tokens = recruits(game);
    expect(tokens).toHaveLength(1);
    expect(game.state(tokens[0] as string)).toMatchObject({ isToken: true, might: 1, zone: "base" });
    expect(game.p1.base().sort()).toEqual(["M", "viktor", tokens[0] as string].sort());
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.state("M").might).toBe(5);
    expect(game.state("viktor").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("killedBy = Get Excited! / responsible P1 (428.5.c.1) even though the victim was P1's own unit: the Phoenix probe is offered", async () => {
    const game = await board().build();
    await getExcitedDiscardingU(game, "W");
    const offered = await drainDeclining(game);
    expect(offered).toContain("phoenix");
  });

  test("summary across (a)(b)(c): cost-kill → 1 Recruit, hand discard + enemy death → 0 Recruits, lethal damage to own unit → 1 Recruit", async () => {
    const a = await board().build();
    await a.p1.cast("sac", { sacrifice: "M" });
    await drainDeclining(a);
    const b = await board().build();
    await getExcitedDiscardingU(b, "Z");
    await drainDeclining(b);
    const c = await board().build();
    await getExcitedDiscardingU(c, "W");
    await drainDeclining(c);
    expect([recruits(a).length, recruits(b).length, recruits(c).length]).toEqual([1, 0, 1]);
  });
});
