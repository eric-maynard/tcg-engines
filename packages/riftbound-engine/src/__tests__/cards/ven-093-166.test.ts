/**
 * Kinkou Lifeblade — ven-093-166 · Unit · Chaos · 4 energy · 4 Might
 *
 *   [Empower] [2] ([2]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have +1 [Might] and [Ganking]. (I can move from battlefield to battlefield.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. 827.1.c.1 — "[Empower] [2]" is the ACTIVATED ability "[2]: Empower me. Play only if not
 *     Empowered." The [2] is paid on activation; the empower is an effect on the chain (145.2.a.1), so
 *     the opponent gets priority first — until it resolves he is still a 4-Might unit WITHOUT Ganking,
 *     and if he dies in response the energy stays spent and nothing is empowered.
 *  2. 441.1.b / "use only if not Empowered" — never offered while Empowered; 145.2 — a unit's activated
 *     ability is your-Main-Phase / Open-State only: not on the opponent's turn, not inside a showdown.
 *  3. 828.1.b.1 — "+1 [Might] and [Ganking]" is ONE dependent static: both switch on together when he
 *     becomes Empowered and both switch off the moment he is disempowered (Sanction mode 2), then come
 *     back when Sanction re-empowers him at end of turn. Empowered itself has no duration (441.1.a).
 *  4. 810 / 144.4.c — Ganking only widens the STANDARD move: battlefield → battlefield. It still needs a
 *     ready unit (an exhausted Lifeblade that already moved this turn cannot chain a second hop after
 *     being empowered), and an un-empowered Lifeblade at a battlefield may only walk home to base.
 *  5. Full line: empowered at bf1, gank into enemy-held bf2 → he attacks at 5, kills a 4-Might defender,
 *     survives (damage healed in the combat cleanup, 466.1), conquers bf2 for a point, and — having left
 *     bf1 empty in an Open state — loses bf1 at the cleanup (190.4.c).
 *  6. Costs: 4 energy to play (3 is short); 2 energy to activate (1 is short); never activatable by the
 *     opponent.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-093-166";
const SANCTION = "ven-035-166"; // Reaction · 3+[calm] · mode 2: Disempower an Empowered unit. Empower it at end of turn.
const ZAP = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Zap 4",
  timing: "reaction",
};

/** P1's turn; Lifeblade ready at bf1 (P1's), a 4-Might defender on P2's bf2, 3 energy for P1. */
function board(meta?: { empowered?: boolean; exhausted?: boolean }) {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CARD, "kl", meta)
    .unit(P2, "bf2", { might: 4, name: "Defender" }, "def");
}

describe("Kinkou Lifeblade (ven-093-166)", () => {
  test("costs 4 energy (no power); enters base exhausted as an un-empowered 4-Might unit without Ganking; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "kl").build();
    await game.p1.play("kl");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("kl")).toBe("base");
    expect(game.state("kl")).toMatchObject({ baseMight: 4, isEmpowered: false, isExhausted: true, might: 4 });
    expect(game.state("kl").keywords).not.toContain("Ganking");
    const poor = await scenario().resources(P1, { energy: 3, power: { chaos: 2 } }).hand(P1, CARD, "kl").build();
    expect(poor.p1.can("play", "kl")).toBe(false);
  });

  test("[Empower] [2]: pays 2 energy up front, puts an ability (not a trigger) on the chain; nothing changes until it resolves, then Empowered → 5 Might + Ganking", async () => {
    const game = await board().build();
    expect(game.p1.can("gank", "kl")).toBe(false);
    await game.p1.activate("kl");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kl", controller: P1, triggered: false })]);
    expect(game.state("kl")).toMatchObject({ isEmpowered: false, might: 4 }); // still on the chain
    expect(game.state("kl").keywords).not.toContain("Ganking");
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("kl")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.state("kl").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "kl")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("1 energy is not enough to activate; an opponent can never activate my Lifeblade", async () => {
    const short = await board().resources(P1, { energy: 1, power: { chaos: 3 } }).build();
    expect(short.p1.can("activate", "kl")).toBe(false);
    const theirs = await scenario().active(P2).resources(P2, { energy: 5 }).unit(P1, "base", CARD, "kl").build();
    expect(theirs.p2.can("activate", "kl")).toBe(false);
  });

  test("the opponent may respond: killing him with a Reaction while the empower waits leaves the 2 energy spent and nothing empowered", async () => {
    const game = await board().hand(P2, ZAP, "zap").build();
    await game.p1.activate("kl");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    await game.p2.cast("zap", { targets: "kl" });
    expect(game.chain().map((c) => c.name)).toEqual(["Kinkou Lifeblade", "Test Zap 4"]);
    await game.settle();
    expect(game.zoneOf("kl")).toBe("trash");
    expect(game.state("kl").isEmpowered).toBe(false);
    expect(game.p1.energy()).toBe(1);
  });

  test("'Use only if not Empowered' (441.1.b): an Empowered Lifeblade does not offer the ability, even with energy to spare", async () => {
    const game = await board({ empowered: true }).build();
    expect(game.state("kl")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.p1.can("activate", "kl")).toBe(false);
    const t = await game.p1.try((p) => p.activate("kl", 0));
    expect(t.ok).toBe(false);
    expect(game.p1.energy()).toBe(3);
  });

  test("timing (145.2): not on the opponent's turn, and not inside a showdown on your own turn", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("activate", "kl")).toBe(false);
    const game = await board().unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf2");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "kl")).toBe(false);
  });

  test("Empowered has no duration: still Empowered, 5 Might and Ganking after each player's next turn", async () => {
    const game = await board().build();
    await game.p1.activate("kl");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("kl")).toMatchObject({ isEmpowered: true, might: 5 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("kl")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.state("kl").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "kl")).toBe(true);
  });

  test("negative space (144.4): un-empowered at a battlefield, his only standard move is home to base — bf2 is not a destination", async () => {
    const game = await board().build();
    const moves = game.p1.legal().filter((o) => o.verb === "move" || o.verb === "gank").map((o) => o.key);
    expect(moves).toEqual(["standardMove:to:base"]);
    const t = await game.p1.try((p) => p.gank("kl", "bf2"));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("kl")).toBe("battlefield-bf1");
  });

  test("Ganking full line: bf1 → enemy bf2 opens combat; 5 into a 4-Might defender kills it, he survives healed, conquers bf2 (+1 point) and the emptied bf1 is lost (190.4.c)", async () => {
    const game = await board({ empowered: true }).build();
    expect(game.p1.points()).toBe(0);
    await game.p1.gank("kl", "bf2");
    expect(game.zoneOf("kl")).toBe("battlefield-bf2");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("kl")).toBe("battlefield-bf2");
    expect(game.state("kl")).toMatchObject({ damage: 0, isExhausted: true, might: 5 });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("negative space: one Might short — an UN-empowered Lifeblade walked in from base (4 vs 4) merely trades and conquers nothing", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", CARD, "kl")
      .unit(P2, "bf2", { might: 4, name: "Defender" }, "def")
      .build();
    await game.p1.move("kl", "bf2");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("kl")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("Ganking needs a READY unit: after walking base → bf1 (exhausted) and then empowering, no second hop to bf2 this turn; next turn he can", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", CARD, "kl")
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 4, name: "Defender" }, "def")
      .build();
    await game.p1.move("kl", "bf1");
    await game.settle();
    expect(game.state("kl").isExhausted).toBe(true);
    await game.p1.activate("kl");
    await game.settle();
    expect(game.state("kl")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.p1.can("gank", "kl")).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("kl").isReady).toBe(true);
    expect(game.p1.can("gank", "kl")).toBe(true);
  });

  test("Sanction mode 2 (disempower) switches the whole dependent static off at once — 4 Might, no Ganking, no gank — and its end-of-turn re-empower turns both back on", async () => {
    const game = await board({ empowered: true })
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .hand(P1, SANCTION, "sanction")
      .build();
    expect(game.p1.can("gank", "kl")).toBe(true);
    await game.p1.cast("sanction");
    // Resolve: pass priority, then answer mode (1 = disempower) and target prompts as they appear.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "pick") {
        const isMode = d.options.some((o) => o.mode !== undefined || o.key === "1");
        const key = isMode ? (d.options.find((o) => o.mode === 1 || o.key === "1")?.key ?? "1") : (d.options.find((o) => o.card === "kl")?.key ?? "kl");
        await game.seat(d.seat).answer({ keys: [key], kind: "pick" });
      }
    }
    expect(game.zoneOf("sanction")).toBe("trash");
    expect(game.state("kl")).toMatchObject({ isEmpowered: false, might: 4 });
    expect(game.state("kl").keywords).not.toContain("Ganking");
    expect(game.p1.can("gank", "kl")).toBe(false);
    expect(game.p1.can("activate", "kl")).toBe(false); // 0 energy left — and it would be legal again only because he is un-empowered
    await game.advanceTurn(); // end of P1's turn: "Empower it at end of turn"
    expect(game.state("kl")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.state("kl").keywords).toContain("Ganking");
  });

  test("parsed abilities: #0 activated {cost 2 energy → empower self, restriction not-empowered}; #1 static while-empowered [+1 Might, grant Ganking]", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 4, might: 4, name: "Kinkou Lifeblade" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      cost: { energy: 2 },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { type: "while-empowered" },
      effect: {
        effects: [
          { amount: 1, target: "self", type: "modify-might" },
          { keyword: "Ganking", type: "grant-keyword" },
        ],
        type: "sequence",
      },
      type: "static",
    });
  });
});
