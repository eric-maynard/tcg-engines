/**
 * Punching Poro — ven-007-166 · Unit · Fury · 2 energy · 2 Might
 *
 *   [Empower] — Discard 1 (Pay the cost: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have +1 [Might].
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. 827.1.c.1 — "[Empower] — Discard 1" is the ACTIVATED ability "Discard 1: Empower me. Play only
 *     if not Empowered." The discard is a non-resource COST (827.1.c.2): paid when the ability is
 *     played, before anyone can respond; the empower is the EFFECT and waits on the chain (377.3).
 *     If the Poro dies in response the card stays discarded and nothing is empowered.
 *  2. Empty hand → the cost is unpayable → the ability is not offered at all. Already Empowered →
 *     "use only if not Empowered" (441.1.b) → not offered (you cannot pitch cards for nothing).
 *  3. Empowered is a status with no duration (441.1.a) — it survives turn changes; the +1 is a
 *     while-Empowered static (828.1.b.1), so a fresh / un-empowered Poro is exactly 2.
 *  4. 145.2 — a unit's activated ability is Main-Phase, Open-State, your-turn only: not on the
 *     opponent's turn, not inside a showdown.
 *  5. A discard paid as a cost is still a discard (422): pitching Flame Chompers (ogn-006-298,
 *     "When you discard me, you may pay [fury] to play me") fires its trigger.
 *  6. Combat: an Empowered Poro (3) attacking a lone 2-Might defender kills it and survives; an
 *     un-empowered one trades.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-007-166";
const FILLER = "ogn-175-298"; // vanilla 3-Might unit used as discard fodder
const CHOMPERS = "ogn-006-298"; // When you discard me, you may pay [fury] to play me.

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "poro")
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .hand(P1, FILLER, "junk");
}

describe("Punching Poro (ven-007-166)", () => {
  test("costs 2 energy (no power) to play; lands in base as an un-empowered 2-Might unit; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ baseMight: 2, isEmpowered: false, might: 2 });
    const poor = await scenario().resources(P1, { energy: 1, power: { fury: 3 } }).hand(P1, CARD, "poro").build();
    expect(poor.p1.can("play", "poro")).toBe(false);
  });

  test("[Empower] — Discard 1: the named card is discarded on activation (cost), the ability goes on the chain, and on resolution the Poro is Empowered (+1 → 3 Might)", async () => {
    const game = await board().build();
    expect(game.state("poro").might).toBe(2);
    await game.p1.activate("poro", 0, { discard: "junk" });
    expect(game.zoneOf("junk")).toBe("trash"); // cost paid up front
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: false })]);
    expect(game.state("poro").isEmpowered).toBe(false); // effect has not resolved yet
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // no resource cost at all
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("poro")).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  // 124 / 124.1 / 441.2 — the Poro that died in response is a NEW object in the trash; the resolving
  // "Empower me" has nothing on the board to empower.
  test("the opponent gets priority to respond before the empower resolves; killing the Poro in response leaves the discard spent and nothing empowered", async () => {
    const bolt = {
      abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 0,
      name: "Test Zap",
      timing: "reaction",
    };
    const game = await board().hand(P2, bolt, "zap").build();
    await game.p1.activate("poro", 0, { discard: "junk" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    await game.p2.cast("zap", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.state("poro").isEmpowered).toBe(false);
  });

  test("empty hand: the Discard-1 cost is unpayable, so the ability is not offered", async () => {
    const game = await scenario().unit(P1, "base", CARD, "poro").build();
    expect(game.p1.can("activate", "poro")).toBe(false);
  });

  // 827.1.c.1 / 441.1.b — "Play only if not Empowered" (parsed as `use-only-if: not(while-empowered)`).
  test("'Use only if not Empowered': an already-Empowered Poro cannot activate again (no free discards)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "poro", { empowered: true }).hand(P1, FILLER, "junk").build();
    expect(game.state("poro")).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.p1.can("activate", "poro")).toBe(false);
    const t = await game.p1.try((p) => p.activate("poro", 0, { discard: "junk" }));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("junk")).toBe("hand");
  });

  test("after empowering through the ability, it is no longer offered even with more cards in hand", async () => {
    const game = await board().hand(P1, FILLER, "junk2").build();
    await game.p1.activate("poro", 0, { discard: "junk" });
    await game.settle();
    expect(game.state("poro").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "poro")).toBe(false);
    expect(game.zoneOf("junk2")).toBe("hand");
  });

  test("Empowered has no duration: still Empowered and 3 Might two turns later", async () => {
    const game = await board().build();
    await game.p1.activate("poro", 0, { discard: "junk" });
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(game.state("poro")).toMatchObject({ isEmpowered: true, might: 3 });
    await game.advanceTurn(); // → P1 again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("poro")).toMatchObject({ isEmpowered: true, might: 3 });
  });

  test("timing (145.2): not activatable on the opponent's turn, nor inside a showdown on your own turn", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("activate", "poro")).toBe(false);
    const game = await board().unit(P1, "base", { might: 1 }, "scout").build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "poro")).toBe(false);
  });

  test("an opponent's Poro is never activatable by me, even with cards to discard", async () => {
    const game = await scenario().unit(P2, "base", CARD, "poro").hand(P1, FILLER, "junk").build();
    expect(game.p1.can("activate", "poro")).toBe(false);
  });

  test("the cost discard is a real discard (422): pitching Flame Chompers asks to pay [fury] to play it, and accepting puts Chompers on the board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .unit(P1, "base", CARD, "poro")
      .hand(P1, CHOMPERS, "fc")
      .build();
    await game.p1.activate("poro", 0, { discard: "fc" });
    expect(game.zoneOf("fc")).toBe("trash");
    // Drain priority passes until the Chompers prompt appears (it may sit above or below the empower item).
    for (let i = 0; i < 6 && game.decision()?.kind === "action"; i++) {
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("fc")).toBe("base");
    expect(game.p1.power("fury")).toBe(0);
    expect(game.state("poro")).toMatchObject({ isEmpowered: true, might: 3 });
  });

  test("combat: an Empowered Poro (3) attacking a lone 2-Might defender kills it, survives and conquers", async () => {
    const game = await board().build();
    await game.p1.activate("poro", 0, { discard: "junk" });
    await game.settle();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: an un-empowered Poro (2) into the same 2-Might defender merely trades", async () => {
    const game = await board().build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("parsed abilities: #0 activated {cost: discard 1 → empower self, only-if-not-empowered}, #1 static while-empowered +1 Might", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 2, might: 2, name: "Punching Poro" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      cost: { discard: 1 },
      effect: { target: "self", type: "empower" },
      type: "activated",
    });
    const restrictions = (def?.abilities?.[0] as { restrictions?: { type: string }[] }).restrictions ?? [];
    expect(restrictions.length).toBeGreaterThan(0);
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { type: "while-empowered" },
      effect: { amount: 1, target: "self", type: "modify-might" },
      type: "static",
    });
  });
});
