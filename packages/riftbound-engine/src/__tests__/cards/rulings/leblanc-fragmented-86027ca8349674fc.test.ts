/**
 * Ruling 86027ca8349674fc — LeBlanc, Fragmented (UNL-172 → unl-172-219, 3 Might, [Assault], Deathknell) ×
 *   Deceiver (UNL-199 → unl-199-219, Legend: "When you conquer or hold, you may discard 1 and exhaust me to play a
 *   ready Reflection unit token there. It becomes a copy of another unit there. Give it [Temporary].") ×
 *   Gust (OGN-169 → ogn-169-298, Reaction: "Return a unit at a battlefield with 3 [Might] or less to its owner's
 *   hand.") × Reflection token (unl-t06).
 *
 * Q: LeBlanc attacks into an enemy unit and conquers; on my Deceiver trigger, can the opponent Gust LeBlanc away?
 * A: Yes. Deceiver's trigger (cost paid: discard 1 + exhaust) goes on the chain → Closed State → the opponent may
 *    react with Gust (LeBlanc assumed 3 Might → legal). LIFO: Gust resolves first (LeBlanc → hand); Deceiver then
 *    resumes and still plays the Reflection token there — whether it copies anything depends on another valid
 *    unit remaining there.
 * Rules: 383.3.b (trigger cost at finalization), 330/336 (closed state, reactions), 332 (LIFO), 359.3.e.5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEBLANC = "unl-172-219";
const DECEIVER = "unl-199-219";
const GUST = "ogn-169-298";
const FODDER = "ogn-175-298";

/** P1 (Deceiver) attacks P2's bf1 (a 2-Might [Assault] Blocker) with LeBlanc; P1 has one card to discard; P2 has Gust + a rune. */
function conquerBoard() {
  return scenario()
    .legend(P1, DECEIVER, "deceiver")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { abilities: [{ keyword: "Assault", type: "keyword", value: 1 }], keywords: ["Assault"], might: 2, name: "Blocker" }, "blocker")
    .unit(P1, "base", LEBLANC, "leb")
    .hand(P1, FODDER, "fodder")
    .hand(P2, GUST, "gust")
    .runes(P2, "chaos", 1);
}

/** Accept Deceiver's offer, pay it (discard fodder + exhaust), lock the copy target, and pass P1's priority → P2 holds priority. */
async function deceiverPendingP2Priority(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "deceiver", pendingChoiceType: "opt-in" } });
  await game.p1.yes();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]?.key as string);
    } else {
      break;
    }
  }
  expect(game.zoneOf("fodder")).toBe("trash"); // cost: discard 1 …
  expect(game.state("deceiver").isExhausted).toBe(true); // … and exhaust me — paid at finalization
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "deceiver", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // closed state — P2 may react
}

describe("Ruling 86027ca8349674fc — the opponent may Gust LeBlanc in response to the Deceiver trigger; Deceiver still resolves afterwards", () => {
  test("conquer: LeBlanc (3 +1 Assault) beats the Blocker, P1 conquers bf1, and Deceiver's trigger goes on the chain with its cost paid — P2 then gets priority (Closed State)", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("leb", "bf1");
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    await deceiverPendingP2Priority(game);
  });

  // RULING-CONFLICT: riftjudge 86027ca8349674fc assumes LeBlanc is back to 3 Might once she has conquered, so Gust
  // ("3 [Might] or less") could take her while the Deceiver trigger is on the chain; CR 466.7.a/466.7.b + 807.1.d.1
  // say the Attacker designation — and with it her [Assault] Might — lasts until the combat ENDS in the Combat
  // Cleanup, which is AFTER the conquer trigger and all chain interaction on it. riftjudge 211635a4cca0ac5a
  // (void-burrower-211635a4cca0ac5a.test.ts, green) states the same rule the other way round: an [Assault 2]
  // attacker is still 5 Might, and still [Mighty], while its conquer trigger sits on the chain. The engine follows
  // the CR: LeBlanc is a 4-Might Attacker here and is NOT a legal Gust target. The interaction the ruling is really
  // about — reacting to the Deceiver trigger and LIFO order — is covered by the HOLD-trigger case below.
  test("ruling 86027ca8349674fc — after the conquer LeBlanc is still a 4-Might Attacker, so Gust ('3 or less') cannot take her in response to Deceiver", async () => {
    const game = await conquerBoard().build();
    await game.p1.move("leb", "bf1");
    await game.settle();
    await deceiverPendingP2Priority(game);
    await game.p2.tapRune();
    // rule 807.1.d.1 — [Assault 1] is real Might for as long as the Attacker designation stands.
    expect(game.state("leb")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["deceiver"]);
  });

  test("same sequence on Deceiver's HOLD trigger (LeBlanc is plainly 3 Might): P2 Gusts her in response; LIFO → LeBlanc returns to hand first, then Deceiver resumes and still plays a ready [Temporary] Reflection token there — with no other unit left it copies nothing (0 Might)", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, DECEIVER, "deceiver")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEBLANC, "leb")
      .hand(P1, FODDER, "fodder")
      .hand(P2, GUST, "gust")
      .runes(P2, "chaos", 1)
      .build();
    await game.p2.endTurn(); // → P1's Beginning Phase: P1 holds bf1 → Deceiver triggers
    for (let i = 0; i < 6 && game.decision()?.kind !== "yes-no"; i++) {
      await game.settle({ maxSteps: 1 });
    }
    await deceiverPendingP2Priority(game);
    expect(game.state("leb").might).toBe(3);
    await game.p2.tapRune();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "leb" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["deceiver", "gust"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Gust resolves first
    expect(game.zoneOf("leb")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["deceiver"]); // the trigger is still there — not countered
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "action") {
        await game.acting().passPriority();
      } else if (d?.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else if (d?.kind === "yes-no") {
        await game.seat(d.seat).no();
      }
    }
    expect(game.chain()).toEqual([]);
    const atBf1 = game.cardsAt("bf1");
    expect(atBf1).toHaveLength(1);
    const token = game.state(atBf1[0] as string);
    expect(token).toMatchObject({ controller: P1, isReady: true, isToken: true, name: "Reflection" });
    expect(token.keywords).toContain("Temporary");
    expect(token.might).toBe(0); // nothing left there to copy
    expect(game.violations()).toEqual([]);
  });
});
