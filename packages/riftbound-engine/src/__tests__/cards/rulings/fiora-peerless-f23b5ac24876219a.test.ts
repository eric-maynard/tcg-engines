/**
 * Ruling f23b5ac24876219a — Fiora, Peerless (SFD-110 → sfd-110-221) · Body Champion Unit · [3][body] · 3 Might
 *   "When I attack or defend one on one, double my Might this combat."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield — "When you defend here, you may move a friendly unit here to base."
 *   × "Fog of War" (not in our card pool) — stood in by the printed [Hidden][Action] Fight or Flight (ogn-168-298,
 *     "Move a unit from a battlefield to its base"), hidden at the Row and flipped as a Reaction to pull one attacker home.
 *
 * Q: Fiora defends alone at Reaver's Row with a hidden bounce card; TWO units attack her. Can I flip the hidden card
 *    on the defend-trigger chain to make it one-on-one and get Fiora's double-Might trigger?
 * A: No. "Defend one on one" is evaluated when attack/defend triggers are checked (as combat opens). With two
 *    attackers the condition is false, so Fiora's ability never goes on the chain; removing an attacker afterwards
 *    (even at Reaction speed on the initial chain) does not retroactively create the trigger.
 * Rules: 383.4.e/f (attack/defend triggers evaluated as designations are gained), 464.2 (combat opens → initial
 *        chain), 811 (play from Hidden as a Reaction for [0]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "sfd-110-221";
const REAVERS_ROW = "ogn-285-298";
const FOG_STAND_IN = "ogn-168-298"; // Fight or Flight, hidden at the Row

/** Turn 3, P2 active. P1 holds Reaver's Row (live) with Fiora alone + a facedown Fight or Flight. P2: two 2-Might attackers in base. */
function board(attackers: 1 | 2 = 2) {
  const b = scenario()
    .turn(3)
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "row", FIORA, "fiora")
    .facedown(P1, "row", FOG_STAND_IN, "fog")
    .unit(P2, "base", { might: 2, name: "Raider A" }, "a");
  return attackers === 2 ? b.unit(P2, "base", { might: 2, name: "Raider B" }, "b") : b;
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const fioraOnChain = (game: Game) => game.chain().some((c) => c.cardId === "fiora" && c.triggered);

describe("Ruling f23b5ac24876219a — Fiora's one-on-one trigger is checked as combat opens; a later bounce can't create it", () => {
  test("control: ONE attacker → Fiora defends one on one → her trigger goes on the initial chain and doubles her to 6 this combat", async () => {
    const game = await board(1).build();
    await game.p2.move("a", "row");
    // Reaver's Row opt-in for the defender first (decline it — not the point here).
    let sawFiora = false;
    for (let i = 0; i < 10; i++) {
      sawFiora ||= fioraOnChain(game);
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(sawFiora).toBe(true);
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: true });
    expect(game.state("fiora").combatRole).toBe("defender");
    expect(game.state("fiora").might).toBe(6);
  });

  test("TWO attackers: as combat opens only Reaver's Row triggers for P1 — Fiora's ability is NOT on the chain (not one on one), she stays 3 Might", async () => {
    const game = await board(2).build();
    await game.p2.move(["a", "b"], "row");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("a").combatRole).toBe("attacker");
    expect(game.state("b").combatRole).toBe("attacker");
    expect(game.state("fiora").combatRole).toBe("defender");
    // The defend-trigger batch: Reaver's Row asks P1 its "you may" at finalization; Fiora is absent.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
    expect(fioraOnChain(game)).toBe(false);
    expect(game.state("fiora").might).toBe(3);
  });

  test("ruling: with Reaver's Row's trigger on the initial chain, P1 flips the hidden bounce (Reaction, [0]) and sends Raider A home — now 1 attacker, but Fiora's trigger is STILL never added and her Might stays 3", async () => {
    const game = await board(2).build();
    await game.p2.move(["a", "b"], "row");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
    await game.p1.yes(); // accept Row; its only friendly unit here (Fiora) is bound as the mover
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("fiora");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    expect(fioraOnChain(game)).toBe(false);
    // Priority window on the initial chain: whoever holds it passes until P1 may act, then P1 reveals the hidden card.
    for (let i = 0; i < 3 && game.decision()?.seat !== P1; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "fog")).toBe(true);
    await game.p1.reveal("fog", { answers: ["a"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("a");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["row", "fog"]);
    expect(game.p1.energy()).toBe(0); // played from hidden for [0]
    // Resolve the bounce only (LIFO): Raider A goes home; B is now Fiora's lone opponent.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("fog")).toBe("trash");
    expect(game.zoneOf("a")).toBe("base");
    expect(game.state("a").combatRole).toBeNull();
    expect(game.p2.units("row")).toEqual(["b"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    // The key facts: no retroactive Fiora trigger, no doubling.
    expect(fioraOnChain(game)).toBe(false);
    expect(game.state("fiora").might).toBe(3);
    expect(game.state("fiora").combatRole).toBe("defender");
  });

  test("same outcome when the bounce is played later in the showdown (Row declined, P1 flips it on Focus): 1-v-1 from then on, yet Fiora fights at 3 — Raider B (2) dies, Fiora survives with 2 damage healed, P1 keeps the Row", async () => {
    const game = await board(2).build();
    await game.p2.move(["a", "b"], "row");
    await game.p1.no(); // decline Reaver's Row
    // No initial chain left → showdown, attacker (P2) has Focus; P2 passes, P1 flips the hidden card.
    for (let i = 0; i < 4 && !(game.decision()?.kind === "action" && game.decision()?.seat === P1); i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.reveal("fog", { answers: ["a"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("a");
    }
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("a")).toBe("base");
    expect(fioraOnChain(game)).toBe(false);
    expect(game.state("fiora").might).toBe(3);
    await game.settle(); // combat: B (2) vs Fiora (3)
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("battlefield-row");
    expect(game.state("fiora")).toMatchObject({ damage: 0, might: 3 });
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
