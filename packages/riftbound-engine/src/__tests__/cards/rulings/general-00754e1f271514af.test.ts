/**
 * Ruling 00754e1f271514af — [Deathknell] timing (general; exercised with Watchful Sentry OGN-096 → ogn-096-298 · 1 Might
 *     "[Deathknell] — Draw 1.")
 *
 * Q: When do Deathknell effects trigger — is the unit put in the trash first, or does it trigger while still on the board?
 * A: The trigger EVENT is the unit being killed; the Deathknell is recorded as a Pending Item as the unit leaves (808.1.d) and
 *    then finalized onto the chain. Timing of RESOLUTION: (a) if a spell kills it mid-chain, the Deathknell lands on TOP of the
 *    remaining chain and resolves before the older items below it; (b) in combat, Deathknells from combat damage are queued and
 *    resolve only after combat's heal/recall cleanup.
 * Rules: 808.1.d (Deathknell = "when I die"; recorded before the move to trash), 383.2–383.3 (pending → finalized), 340 (LIFO),
 *        465–466 (combat damage, cleanup, then triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHFUL_SENTRY = "ogn-096-298";
/** P1's slow Action: draw 1 (sits at the bottom of the chain). */
const STUDY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Study",
  timing: "action",
} as const;
/** P2's Reaction: deal 2 to a unit (kills the 1-Might Sentry). */
const ZAP = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Zap",
  timing: "reaction",
} as const;

describe("Ruling 00754e1f271514af — Deathknell: triggered by the kill, finalized onto the chain, resolved LIFO / after combat cleanup", () => {
  /** P1 casts Study; P2 Zaps the Sentry in response; both pass → Zap resolves and kills the Sentry. */
  async function sentryZappedMidChain(): Promise<Game> {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P1, STUDY, "study")
      .hand(P2, ZAP, "zap")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .build();
    await game.p1.cast("study");
    await game.p1.passPriority();
    await game.p2.cast("zap", { targets: "sentry" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["study", "zap"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Zap resolves
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    return game;
  }

  test("(a) spell kill mid-chain: the Sentry is in the trash and its Deathknell now sits ON TOP of the still-waiting Study — nothing drawn yet", async () => {
    const game = await sentryZappedMidChain();
    expect(game.zoneOf("zap")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["study", "sentry"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "sentry", controller: P1, triggered: true });
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(a) LIFO: the Deathknell resolves FIRST (P1 draws d1) while Study is still on the chain; only then does Study resolve (d2)", async () => {
    const game = await sentryZappedMidChain();
    await game.acting().passPriority();
    await game.acting().passPriority(); // Deathknell resolves
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["study"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("study")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) combat kill: the Sentry dies to combat damage; its Deathknell is put on the chain only AFTER the combat cleanup's heal/recall (Wall healed, Raider gone) and resolves before the combat result is settled — P1 draws 1", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .autoProcedures(true)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus(); // combat: 3 into Sentry(1)+Wall(4) — Sentry dies; defenders deal 5 → Raider dies
    if (game.decision()?.kind === "distribute") {
      // P2 assigns its 3: 1 to the Sentry is lethal, rest to the Wall.
      await game.p2.distribute({ sentry: 1, wall: 2 });
    }
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("sentry")).toBe("trash");
    // Combat cleanup (3c heal / 3d recall) already happened by the time the Deathknell is a chain item: Raider dead, Wall
    // healed — but the combat RESULT / clearing Contested waits for this chain (466.2 → 466.3/466.5).
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P1, triggered: true })]);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("wall").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });
});
