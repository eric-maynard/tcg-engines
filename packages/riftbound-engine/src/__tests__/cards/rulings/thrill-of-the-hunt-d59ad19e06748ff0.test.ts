/**
 * Ruling d59ad19e06748ff0 — Thrill of the Hunt (unl-184-219) × Imperial Decree (ogn-221-298) × Bellows Breath (sfd-080-221)
 *   Thrill of the Hunt — [Reaction] · [2][fury]: "Banish a friendly unit, then its owner plays it to any battlefield,
 *   ignoring its cost."
 *   Imperial Decree — [Action] · [5][order][order]: "When any unit takes damage this turn, kill it."
 *   Bellows Breath — [Action] · [1][mind] · [Repeat][1][mind]: "Deal 1 to up to three units at the same location."
 *
 * Q: Decree is active; I Bellows Breath the opponent's units; they respond with Thrill of the Hunt on one — what happens?
 * A: Thrill resolves first: that unit is banished and replayed to a battlefield — a NEW object, so Bellows Breath's
 *    targeting of it is severed. When Bellows resolves that target is illegal: it takes no damage, hence Decree's
 *    "takes damage" trigger never fires for it — it survives. (The other targets are hit and Decree kills them.)
 * Rules: 359.3.e.4/e.5 (zone change → new object → illegal target, unaffected), 383 (Decree = delayed trigger on damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL = "unl-184-219";
const IMPERIAL_DECREE = "ogn-221-298";
const BELLOWS_BREATH = "sfd-080-221";

/**
 * P1's turn. P1: [6] + 2 order + 1 mind (Decree 5+[order][order], Bellows 1+[mind]). P2 controls bf1 with Hunter (3) and
 * Packmate (3), and bf2 with a Sentry (2); P2 holds Thrill of the Hunt + exactly [2][fury].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 1, order: 2 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Hunter" }, "hunter")
    .unit(P2, "bf1", { might: 3, name: "Packmate" }, "packmate")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, BELLOWS_BREATH, "bellows")
    .hand(P2, THRILL, "thrill");
}

/** Decree resolves; P1 casts Bellows Breath at Hunter + Packmate; P1 passes → P2's Reaction window. */
async function decreeThenBellows(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  await game.p1.cast("bellows", { targets: ["hunter", "packmate"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bellows", controller: P1 })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** P2 Thrills the Hunter; drive Thrill's resolution (owner P2 replays it to bf1) until only Bellows is left on the chain. */
async function thrillHunter(game: Game): Promise<void> {
  expect(game.p2.can("cast", "thrill")).toBe(true);
  await game.p2.cast("thrill", { targets: "hunter" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bellows", "thrill"]);
  for (let i = 0; i < 12 && game.chain().some((c) => c.cardId === "thrill"); i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      const key = d.options.find((o) => o.key === "battlefield-bf1")?.key ?? d.options[0]!.key;
      await game.p2.pick(key);
    } else if (d?.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2) {
    await game.p2.pick(d.options.find((o) => o.key === "battlefield-bf1")?.key ?? d.options[0]!.key);
  }
}

describe("Ruling d59ad19e06748ff0 — a unit Thrilled out from under Bellows Breath is a new object: no damage, so Imperial Decree never kills it", () => {
  test("control: no Thrill — Bellows deals 1 to Hunter and Packmate, Decree triggers on each and both die", async () => {
    const game = await decreeThenBellows();
    await game.settle();
    expect(game.zoneOf("hunter")).toBe("trash");
    expect(game.zoneOf("packmate")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf2");
  });

  test("Thrill of the Hunt (Reaction) resolves first: the Hunter is banished and replayed by its owner to a battlefield for free — back on the board undamaged while Bellows still waits", async () => {
    const game = await decreeThenBellows();
    await thrillHunter(game);
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.zoneOf("hunter")).toBe("battlefield-bf1");
    expect(game.state("hunter").damage).toBe(0);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toContain("bellows");
    expect(game.zoneOf("bellows")).toBe("chain");
  });

  test("Bellows Breath then resolves: the replayed Hunter is an illegal (new) target — takes NO damage and no Decree trigger fires for it — it SURVIVES; the Packmate takes 1 and Decree kills it", async () => {
    const game = await decreeThenBellows();
    await thrillHunter(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.zoneOf("hunter")).toBe("battlefield-bf1");
    expect(game.state("hunter").damage).toBe(0);
    expect(game.zoneOf("packmate")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf2");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
