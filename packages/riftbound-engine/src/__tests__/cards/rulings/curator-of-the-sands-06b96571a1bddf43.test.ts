/**
 * Ruling 06b96571a1bddf43 — Curator of the Sands (VEN-192 → ven-192-166, Nasus legend) · "When you play a unit, gear, or activated ability with
 *     Energy cost [7] or more, you may exhaust me to ready up to 2 runes."
 *
 * Q: Is the Nasus legend ability "slow speed"?
 * A: It has no speed at all — it is a TRIGGERED ability ("When…"), not an activated one. It fires automatically whenever the condition is met:
 *    no Main-Phase Open State or priority needed, so it can trigger mid-chain and even on the opponent's turn. The "may exhaust me" is a cost
 *    of the trigger, not an activation.
 *    (The ruling words that cost as "paid as the trigger resolves"; CR 383.3.b makes a cost right after the leading "you may" the trigger's BASE
 *    COST, paid at FINALIZATION — see the RULING-CONFLICT facet.)
 * Rules: 383.3 / 383.3.c (triggers go on the chain in any state, any turn), 383.3.a–b (leading "you may [cost] to" = opt-in + base cost at
 *        finalization), 151.2 (only ACTIVATED abilities need [Action]/[Reaction] to leave the Main Phase Open State).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CURATOR = "ven-192-166";
const SEVEN_DROP = { cardType: "unit", domain: "calm", energyCost: 7, might: 7, name: "Seven Drop" } as const;
/** A gear with a REACTION-speed activated ability costing [7] — lets the condition be met mid-chain on the opponent's turn. */
const BIG_LEVER = { abilities: [{ cost: { energy: 7 }, effect: { amount: 1, type: "draw" }, timing: "reaction", type: "activated" }], cardType: "gear", domain: "mind", energyCost: 1, name: "Big Lever", rulesText: "[Reaction] — [7]: Draw 1." } as const;
const OPENER = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", domain: "calm", energyCost: 0, name: "Opener", timing: "action" } as const;

describe("Ruling 06b96571a1bddf43 — Curator of the Sands is a triggered ability: no speed, fires wherever its condition is met", () => {
  test("it is never an ACTIVATED option: with the legend ready in P1's own Main Phase Open State there is nothing to 'use' on it", async () => {
    const game = await scenario().legend(P1, CURATOR, "cur").runes(P1, "mind", 7).hand(P1, SEVEN_DROP, "seven").build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "cur")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "activate" && o.card === "cur")).toBe(false);
  });

  test("own turn: playing a [7] unit makes it TRIGGER by itself — a Curator item appears on the chain and P1 is asked 'exhaust me to …?' (FIN); yes → legend exhausted, then up to 2 of the tapped runes are readied", async () => {
    const game = await scenario().legend(P1, CURATOR, "cur").runes(P1, "mind", 7).hand(P1, SEVEN_DROP, "seven").build();
    await game.p1.tapRunes(7);
    await game.p1.play("seven");
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "cur", controller: P1, triggered: true }));
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "cur", pendingChoiceType: "opt-in" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.state("cur").isExhausted).toBe(true);
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 2, seat: P1, source: { cardId: "cur" } });
    const two = d?.kind === "pick" ? d.options.slice(0, 2).map((o) => o.key) : [];
    await game.p1.pick(...two);
    await game.settle();
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.zoneOf("seven")).toBe("base");
  });

  /**
   * P2's turn. P1: Curator, Big Lever in base, 7 ready runes, named deck top. P2 casts a free Opener; in the reaction window P1 taps 7 and
   * activates the Lever's [7] Reaction ability.
   */
  async function leverOnOpponentsTurn(): Promise<Game> {
    const game = await scenario().active(P2).legend(P1, CURATOR, "cur").gear(P1, BIG_LEVER, "lever").runes(P1, "mind", 7).hand(P2, OPENER, "op").deck(P1, ["ogn-175-298"], ["d1"]).build();
    expect(game.p1.legal()).toEqual([]); // P2's Open State: P1 can't do anything, let alone "use" the legend
    await game.p2.cast("op");
    await game.p2.passPriority();
    await game.p1.tapRunes(7);
    expect(game.p1.can("activate", "lever")).toBe(true);
    expect(game.p1.can("activate", "cur")).toBe(false);
    await game.p1.activate("lever");
    expect(game.p1.energy()).toBe(0);
    return game;
  }

  /**
   * rule 419.4.a (patch 2026-07-17, ruling 802009794e24c451) — playing an activated ability is
   * completed by its RESOLUTION, so the Curator's condition is met only once the Lever's ability
   * has resolved. Pass priority until the trigger's opt-in is on the table.
   */
  async function passUntilCuratorAsk(game: Game): Promise<void> {
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        return;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
        continue;
      }
      break;
    }
  }

  test("OPPONENT's turn, MID-CHAIN: a [7] activated ability played in response to P2's spell trips the trigger as it RESOLVES — the Curator item lands on the still-pending chain (above P2's Opener) and P1 is asked there and then", async () => {
    const game = await leverOnOpponentsTurn();
    expect(game.turnPlayer()).toBe(P2);
    // rule 419.4.a (ruling 802009794e24c451): the ability is merely on the chain at activation.
    expect(game.chain().map((c) => c.cardId)).toEqual(["op", "lever"]);
    await passUntilCuratorAsk(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["op", "cur"]);
    expect(game.chain().at(-1)).toMatchObject({ cardId: "cur", controller: P1, triggered: true, type: "ability" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "cur" }, timing: "FIN" });
  });

  // RULING-CONFLICT: riftjudge 06b96571a1bddf43 says the "may exhaust me" cost is paid as the trigger RESOLVES; CR 383.3.b / 383.3.b.1 (and
  // 204.3.a) make a cost immediately following the leading "you may" the trigger's BASE COST, paid to FINALIZE it — engine follows CR: the
  // legend is exhausted the moment P1 opts in, while the item (and everything under it) is still unresolved.
  test("the exhaust is the trigger's base cost, paid at FINALIZATION (CR 383.3.b): after 'yes' the legend is already exhausted with the chain [op, cur] still pending", async () => {
    const game = await leverOnOpponentsTurn();
    expect(game.state("cur").isReady).toBe(true);
    await passUntilCuratorAsk(game);
    await game.p1.yes();
    expect(game.state("cur").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["op", "cur"]);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // nothing readied yet — that is the effect, at resolution
  });

  test("resolution on the opponent's turn works normally: the Lever draws d1, its play then triggers the Curator (P1 readies 2 runes), and P2's Opener resolves last", async () => {
    const game = await leverOnOpponentsTurn();
    await passUntilCuratorAsk(game);
    await game.p1.yes();
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "pick" && d.seat === P1) {
        expect(d).toMatchObject({ max: 2, source: { cardId: "cur" } });
        await game.p1.pick(...d.options.slice(0, 2).map((o) => o.key));
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("op")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("declining is allowed ('you may'): 'no' removes the item, legend stays ready, no runes readied", async () => {
    const game = await leverOnOpponentsTurn();
    await passUntilCuratorAsk(game);
    await game.p1.no();
    expect(game.chain().map((c) => c.cardId)).toEqual(["op"]);
    expect(game.state("cur").isReady).toBe(true);
    await game.settle();
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });
});
