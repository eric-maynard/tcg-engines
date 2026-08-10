/**
 * Ruling 2a4c2dfa26814ec7 — Harnessed Dragon (OGN-234 → ogn-234-298, 8 + [order][order], 6) "When you play me, kill an enemy unit."
 *   × Hidden Blade (ogn-213-298, [Hidden] Action) "Kill a unit at a battlefield. Its controller draws 2."
 *   × Anivia, Primal (ogn-148-298, 8) "When I attack, deal 3 to all enemy units HERE."
 *   × Void Seeker (ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1." (+ Flash ogs-011-024 for the last nuance)
 *
 * Q: The Dragon is played and then killed by a reaction before its trigger resolves — does the kill still happen?
 * A: Yes; the play trigger is on the chain and does not need the Dragon around. Contrast Anivia: her damage is "here",
 *    which needs her at the battlefield — removed in response, it deals nothing. And a unit that leaves the battlefield
 *    (e.g. Flashed home) in response to targeted damage like Void Seeker takes no damage.
 * Rules: 383 (a triggered ability resolves independently of its source), 359.2.c ("here" = the source's location),
 *        359.3.e.5 (target no longer legal at resolution → no effect).
 *
 * Note: a face-down Hidden Blade may only pick a unit at ITS battlefield (811.1.d.2) and the Dragon can only be played to
 * P1's side, so the Dragon case uses Shakedown (ogn-033-298, Reaction: "Deal 6 to it unless its controller has you draw
 * 2") as the kill-in-response; the Anivia case uses a genuinely hidden Hidden Blade.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARNESSED_DRAGON = "ogn-234-298";
const HIDDEN_BLADE = "ogn-213-298";
const ANIVIA = "ogn-148-298";
const VOID_SEEKER = "ogn-024-298";
const FLASH = "ogs-011-024";
const SHAKEDOWN = "ogn-033-298";

type Pick = Extract<Decision, { kind: "pick" }>;

describe("Ruling 2a4c2dfa26814ec7 — Harnessed Dragon killed in response: its 'kill an enemy unit' still resolves", () => {
  /** P1's turn. P2's Victim (3) at P2's bf1; P2 holds Shakedown (2 + [fury]). P1: the Dragon with exactly 8 + [order][order]. */
  function board() {
    return scenario()
      .resources(P1, { energy: 8, power: { order: 2 } })
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
      .hand(P1, HARNESSED_DRAGON, "dragon")
      .hand(P2, SHAKEDOWN, "shakedown");
  }

  /** Play the Dragon, name Victim for the trigger, P1 passes, P2 Shakedowns the Dragon, P1 takes the 6 → Dragon dies. */
  async function dragonThenKilled(): Promise<Game> {
    const game = await board().build();
    await game.p1.play("dragon");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("victim");
    }
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.chain()).toEqual([
      expect.objectContaining({
        cardId: "dragon",
        controller: P1,
        targets: ["victim"],
        triggered: true,
      }),
    ]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "shakedown")).toBe(true);
    await game.p2.cast("shakedown", { targets: "dragon" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Shakedown resolves: the Dragon's controller (P1) picks
    const d = game.decision() as Pick;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const takeSix = d.options.find((o) => /deal 6/i.test(o.label));
    expect(takeSix).toBeDefined();
    await game.p1.answer(takeSix!.key);
    expect(game.zoneOf("dragon")).toBe("trash"); // 6 damage on a 6-Might unit
    return game;
  }

  test("the Dragon is dead, yet its play trigger is still on the chain, target intact", async () => {
    const game = await dragonThenKilled();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "dragon", targets: ["victim"], triggered: true }),
    ]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
  });

  test("… and it resolves normally: Victim is killed", async () => {
    const game = await dragonThenKilled();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("dragon")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 2a4c2dfa26814ec7 — contrast: Anivia's 'deal 3 to all enemy units HERE' does nothing if she is killed in response", () => {
  /** P1's turn 3. P2's bf1: two 2-Might Minions and a Hidden Blade hidden on an earlier turn. P1: Anivia (8) in base. */
  function board() {
    return scenario()
      .turn(3)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Minion A" }, "ma")
      .unit(P2, "bf1", { might: 2, name: "Minion B" }, "mb")
      .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
      .unit(P1, "base", ANIVIA, "anivia");
  }

  test("control: unanswered, Anivia's attack trigger deals 3 to both Minions (they die) and she conquers bf1", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    await game.settle();
    expect(game.zoneOf("ma")).toBe("trash");
    expect(game.zoneOf("mb")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("P2 flips Hidden Blade on Anivia in response (she is a unit here): Anivia dies, P1 draws 2; her trigger then resolves with no 'here' → both Minions take 0 and keep bf1", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await game.p1.move("anivia", "bf1");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "anivia", controller: P1, triggered: true }),
    ]);
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "blade")).toBe(true);
    await game.p2.reveal("blade");
    const d = game.decision() as Pick;
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["anivia", "ma", "mb"]); // units at THIS battlefield
    await game.p2.pick("anivia");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hidden Blade resolves
    expect(game.zoneOf("anivia")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand + 2); // "Its controller draws 2"
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "anivia", triggered: true })]); // trigger still pending
    await game.p1.passPriority();
    await game.p2.passPriority(); // Anivia's trigger resolves — to no effect
    expect(game.chain()).toEqual([]);
    expect(game.state("ma")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("mb")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.zoneOf("ma")).toBe("battlefield-bf1");
    expect(game.zoneOf("mb")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 2a4c2dfa26814ec7 — nuance: a unit Flashed home in response to Void Seeker takes no damage", () => {
  test("Void Seeker at P2's Target (3, at bf1); P2 Flashes it to base first → Target takes 0 and survives", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Target" }, "target")
      .hand(P1, VOID_SEEKER, "vs")
      .hand(P2, FLASH, "flash")
      .build();
    await game.p1.cast("vs", { targets: "target" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "target" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "flash"]);
    await game.settle();
    expect(game.zoneOf("target")).toBe("base");
    expect(game.state("target").damage).toBe(0);
    expect(game.zoneOf("vs")).toBe("trash");
  });
});
