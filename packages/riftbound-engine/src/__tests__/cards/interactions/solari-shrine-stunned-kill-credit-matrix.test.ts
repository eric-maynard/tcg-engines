/**
 * Interaction: Solari Shrine (ogn-072-298) · Gear "When you kill a stunned enemy unit, you may exhaust this to draw 1."
 *   × Vengeance (ogn-229-298) "Kill a unit."                                  — active kill (kill instruction)
 *   × Falling Comet (ogn-085-298) "[Action] Deal 6 to a unit at a battlefield." — passive kill (lethal damage → Cleanup)
 *   × combat damage from P1's attacker                                          — passive kill (Combat Cleanup)
 *   × Deathgrip (sfd-163-221, P2's) "[Reaction] Kill a friendly unit. If you do, … Draw 1." — P2 kills its own unit
 *   (Rune Prison ogn-050-298 "Stun a unit." supplies the stun.)
 *
 * Kill-credit matrix (rule 428.5): who "killed" P2's stunned 3-Might unit E, and does P1's Shrine trigger?
 *  (a) P1's Vengeance: the spell contains the kill instruction → P1 responsible (428.1.a.1, 428.5.b). YES.
 *  (b) P1's Falling Comet deals 6 ≥ 3; E dies in the Cleanup after the spell (428.4, 428.1.a.2); the kill is
 *      attributed to the spell that dealt the damage and its controller (428.5.c, 428.5.c.1, 417.6.a). YES.
 *  (c) P1 attacks with a 4-Might unit; stunned E deals no combat damage and dies in the Combat Cleanup; the
 *      combat-damage sources (the attacker, 417.6.c) and their controller get the kill (428.5.c.2). YES.
 *  (d) P2 Deathgrips its own E in response to Vengeance: Deathgrip's kill instruction is P2's → P2 killed it;
 *      P1's Shrine does NOT trigger (and stays ready for a later kill this turn). Vengeance loses its target.
 *  (e) Same as (a) but E is not stunned → condition fails → no trigger.
 * In every case the kill is board → owner's (P2's) trash (428.2).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SOLARI_SHRINE = "ogn-072-298";
const VENGEANCE = "ogn-229-298";
const FALLING_COMET = "ogn-085-298";
const RUNE_PRISON = "ogn-050-298";
const DEATHGRIP = "sfd-163-221";

/**
 * P1's turn. P1: Solari Shrine (ready) in base, a 4-Might Attacker in base, Vengeance / Falling Comet / Rune Prison
 * in hand and plenty of resources. P2: E (3 Might, stunned unless `stunned:false`) alone at P2's bf1, a 2-Might
 * Buddy in base (Deathgrip's "+Might to another friendly unit" recipient), Deathgrip in hand and the resources for it.
 */
function board(opts: { stunned?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 12, power: { calm: 2, mind: 2, order: 2, rainbow: 2 } })
    .resources(P2, { energy: 4, power: { order: 2, rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, SOLARI_SHRINE, "shrine")
    .unit(P2, "bf1", { might: 3, name: "Enemy" }, "E", opts.stunned === false ? undefined : { stunned: true })
    .unit(P2, "base", { might: 2, name: "Buddy" }, "buddy")
    .unit(P1, "base", { might: 4, name: "Attacker" }, "atk")
    .hand(P1, VENGEANCE, "vengeance")
    .hand(P1, FALLING_COMET, "comet")
    .hand(P1, RUNE_PRISON, "prison")
    .hand(P2, DEATHGRIP, "grip");
}

/** The Shrine's opt-in is pending for P1: accept it and check it exhausted the Shrine and drew exactly 1. */
async function expectShrineOfferedAndDraw(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "shrine" } });
  const hand = game.p1.hand().length;
  const deck = game.p1.deck().length;
  await game.p1.yes();
  await game.settle();
  expect(game.state("shrine").isExhausted).toBe(true);
  expect(game.p1.hand()).toHaveLength(hand + 1);
  expect(game.p1.deck()).toHaveLength(deck - 1);
}

describe("YES — P1 is responsible for the kill of a stunned enemy unit → Solari Shrine triggers", () => {
  test("(a) active kill: Rune Prison stuns E, then P1's Vengeance kills it (428.5.b) — E goes board → P2's trash, Shrine offers 'exhaust to draw 1', accepting exhausts it and draws 1", async () => {
    const game = await board({ stunned: false }).build();
    await game.p1.cast("prison", { targets: "E" });
    await game.settle();
    expect(game.state("E").isStunned).toBe(true);
    await game.p1.cast("vengeance", { targets: "E" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vengeance"]);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.p2.trash()).toContain("E"); // owner's trash (428.2)
    expect(game.zoneOf("vengeance")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["shrine"]); // the Shrine trigger is the only item
    await expectShrineOfferedAndDraw(game);
    expect(game.violations()).toEqual([]);
  });

  test("(b) passive kill by lethal spell damage: Falling Comet deals 6 to stunned E, E dies in the following Cleanup, kill credited to the spell's controller P1 (428.5.c / 428.5.c.1) — Shrine offers the draw", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "E" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.p2.trash()).toContain("E");
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["shrine"]);
    await expectShrineOfferedAndDraw(game);
  });

  test("(c) passive kill in the Combat Cleanup: P1's 4-Might attacker vs stunned E (deals no combat damage) — E dies, kill credited to the attacker's controller P1 (417.6.c, 428.5.c.2) — Shrine offers the draw; attacker unhurt, P1 conquers bf1", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf1");
    const r = await game.settle(); // both pass focus → combat resolves
    expect(r.reason).toBe("unanswered");
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.p2.trash()).toContain("E");
    expect(game.state("atk").damage).toBe(0); // stunned E dealt nothing
    await expectShrineOfferedAndDraw(game);
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("the three kill paths are the same trigger: declining ('you may') leaves the Shrine ready and draws nothing", async () => {
    const game = await board().build();
    await game.p1.cast("vengeance", { targets: "E" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "shrine" } });
    const hand = game.p1.hand().length;
    await game.p1.no();
    await game.settle();
    expect(game.state("shrine").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("NO — P1 did not kill a stunned enemy unit → Solari Shrine does not trigger", () => {
  test("(d) P2 Deathgrips its OWN stunned E in response to P1's Vengeance: Deathgrip (P2's kill instruction) kills E, Buddy gets +3, P2 draws 1; Vengeance resolves with no target; P1's Shrine is never offered and stays ready", async () => {
    const game = await board().build();
    await game.p1.cast("vengeance", { targets: "E" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "grip")).toBe(true); // Reaction: legal on the chain
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("grip", { targets: "E" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vengeance", "grip"]);
    const p1Hand = game.p1.hand().length;
    const shrinePrompts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      if (d.source?.cardId === "shrine") {
        shrinePrompts.push(d.prompt);
      }
      if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]?.key as string); // Deathgrip's +Might recipient (Buddy)
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else {
        break;
      }
    }
    expect(shrinePrompts).toEqual([]);
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["E", "grip"]));
    expect(game.state("buddy").might).toBe(2 + 3); // "If you do" — P2 did kill it
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1); // spent Deathgrip, drew 1
    expect(game.zoneOf("vengeance")).toBe("trash"); // resolved with its target gone
    expect(game.state("shrine").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d, cont.) …and the still-ready Shrine DOES trigger on a later P1 kill of a stunned enemy the same turn", async () => {
    const game = await board().unit(P2, "bf1", { might: 2, name: "Enemy 2" }, "E2", { stunned: true }).build();
    await game.p1.cast("vengeance", { targets: "E" });
    await game.p1.passPriority();
    await game.p2.cast("grip", { targets: "E" });
    for (let i = 0; i < 10; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      expect(d.source?.cardId).not.toBe("shrine");
      if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else {
        break;
      }
    }
    expect(game.state("shrine").isReady).toBe(true);
    // Later this turn: P1 kills stunned E2 with Falling Comet → now the Shrine is offered.
    await game.p1.cast("comet", { targets: "E2" });
    await game.settle();
    expect(game.zoneOf("E2")).toBe("trash");
    await expectShrineOfferedAndDraw(game);
  });

  test("(e) E is NOT stunned: P1's Vengeance kills it (P1 responsible) but the 'stunned' condition fails — no Shrine prompt, Shrine stays ready, no draw", async () => {
    const game = await board({ stunned: false }).build();
    expect(game.state("E").isStunned).toBe(false);
    await game.p1.cast("vengeance", { targets: "E" });
    const hand = game.p1.hand().length;
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("shrine").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("control: a stunned FRIENDLY unit killed by P1 is not an 'enemy unit' — no Shrine prompt", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Own Dazed" }, "own", { stunned: true }).build();
    await game.p1.cast("vengeance", { targets: "own" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("own")).toBe("trash");
    expect(game.state("shrine").isReady).toBe(true);
  });
});
