/**
 * Ruling 7791d327d0c1f1be — Rek'Sai, Swarm Queen (SFD-170 → sfd-170-221) · Champion Unit · Order · 5 · 5 Might
 *     "When I attack, you may reveal the top 2 cards of your Main Deck. You may banish one, then play it. If it is a
 *      unit, you may play it here. Recycle the rest."
 *   × Ride the Wind (ogn-173-298) · [Action] · 2 + [chaos] — "Move a friendly unit and ready it." (the opponent's way in)
 *
 * Q: When I move Rek'Sai to an UNOCCUPIED battlefield, do I get the attack trigger?
 * A: No. Moving onto an empty battlefield starts an open (non-combat) showdown — no combat, no Attacker/Defender
 *    designations — so "When I attack" does not trigger. If an opponent later moves a unit into that battlefield during
 *    the open showdown, it becomes a combat: Rek'Sai gains the Attacker designation THEN and her ability triggers.
 * Rules: 344.1 (non-combat showdown), 376.4.d / 383.4.e (attack triggers = gaining the Attacker designation in a
 *        combat), 464.2.c (designations), 344.1 → combat upgrade when opposing units arrive (450 / 464.2.c.3.a).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REKSAI = "sfd-170-221";
const RIDE_THE_WIND = "ogn-173-298";
const SKULKER = "ogn-175-298";

/**
 * P1's turn (6 energy, so a revealed Skulker would be affordable). Rek'Sai (5) ready in base; bf1 OPEN and empty; P2
 * holds bf2 with Interloper (2) + Homeguard (1) and has Ride the Wind (2 + [chaos]) in hand. P1's deck top: r1, r2, r3.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", REKSAI, "reksai")
    .unit(P2, "bf2", { might: 2, name: "Interloper" }, "interloper")
    .unit(P2, "bf2", { might: 1, name: "Homeguard" }, "homeguard")
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .hand(P2, RIDE_THE_WIND, "ride")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["r1", "r2", "r3"]);
}

/** Rek'Sai walks onto the empty bf1. */
async function ontoEmpty(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("reksai", "bf1");
  return game;
}

describe("Ruling 7791d327d0c1f1be — Rek'Sai onto an unoccupied battlefield: no attack trigger", () => {
  test("the move opens a NON-COMBAT showdown at bf1: Rek'Sai has no Attacker designation, nothing of hers is on the chain, no 'reveal?' prompt, deck untouched", async () => {
    const game = await ontoEmpty();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: null });
    expect(game.state("reksai").combatRole ?? null).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.p1.deck().slice(0, 3)).toEqual(["r1", "r2", "r3"]);
  });

  test("if nobody interferes the open showdown just ends: P1 conquers bf1 (+1) — still no trigger ever fired, deck untouched", async () => {
    const game = await ontoEmpty();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p1.deck().slice(0, 3)).toEqual(["r1", "r2", "r3"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("but if P2 (with Focus in that open showdown) Rides the Wind to move Interloper INTO bf1, the showdown becomes a combat: Rek'Sai gains Attacker, Interloper Defender — and NOW her 'When I attack' trigger goes on the chain asking P1 'reveal the top 2?'", async () => {
    const game = await ontoEmpty();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ride")).toBe(true);
    await game.p2.cast("ride", { targets: "interloper" });
    // Drive: destination prompt (bf1) if asked, then let Ride the Wind resolve.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "pick" && d.seat === P2) {
        const opt = d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1" || o.zone === "battlefield-bf1");
        await game.p2.pick((opt?.key ?? "battlefield-bf1") as string);
      } else if (d.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId === "ride")) {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.locationOf("interloper")).toBe("bf1");
    expect(game.state("interloper").isReady).toBe(true); // "and ready it"
    // Combat now: designations assigned, and the attack trigger fired at THIS moment.
    expect(game.state("reksai").combatRole).toBe("attacker");
    expect(game.state("interloper").combatRole).toBe("defender");
    const reksaiItem = game.chain().find((c) => c.cardId === "reksai" && c.triggered && c.controller === P1);
    const optIn = game.decision()?.kind === "yes-no" && game.decision()?.seat === P1 ? game.decision() : null;
    expect(reksaiItem !== undefined || optIn !== null).toBe(true);
    if (optIn) {
      expect(optIn).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "reksai" } });
    }
  });

  test("…accepting it reveals exactly r1/r2 (declining the play recycles both), then the combat resolves: Interloper (2) dies to Rek'Sai (5) and P1 conquers bf1", async () => {
    const game = await ontoEmpty();
    await game.p1.passFocus();
    await game.p2.cast("ride", { targets: "interloper" });
    let revealed: string[] | undefined;
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "pick" && d.seat === P2) {
        const opt = d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1" || o.zone === "battlefield-bf1");
        await game.p2.pick((opt?.key ?? "battlefield-bf1") as string);
      } else if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d.kind === "pick" && d.seat === P1) {
        revealed = d.options.map((o) => (o.card ?? o.key) as string);
        await game.p1.decline(); // don't banish/play anything → recycle both
      } else if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(revealed?.sort()).toEqual(["r1", "r2"]);
    await game.settle();
    expect(game.p1.deck()[0]).toBe("r3");
    expect([...game.p1.deck().slice(-2)].sort()).toEqual(["r1", "r2"]);
    expect(game.zoneOf("interloper")).toBe("trash");
    expect(game.locationOf("reksai")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
