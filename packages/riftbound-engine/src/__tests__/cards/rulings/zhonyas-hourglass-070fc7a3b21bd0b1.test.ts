/**
 * Ruling 070fc7a3b21bd0b1 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   (exercised with Watchful Sentry ogn-096-298 · 1 Might "[Deathknell] — Draw 1.")
 *
 * Q: Can you play a hidden Zhonya's in response to a Deathknell trigger, and does it save the unit?
 * A: During combat, yes you can flip it in response (control of the battlefield is locked until combat ends) — but it saves
 *    nothing: the unit is already dead. The gear is played straight to your BASE (not the battlefield). Nuance claimed: outside
 *    combat a lone dying unit loses you the battlefield at once and the hidden card is trashed before you can play it.
 * Rules: 811 (Hidden ⇒ Reaction, [0]), 808.1.d (Deathknell), 366–372 (a replacement must exist BEFORE the event),
 *        190.4.b (control frozen during combat), 143 (gear is played to base).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const WATCHFUL_SENTRY = "ogn-096-298";
/** P2's out-of-combat removal. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2's turn 3. P1 holds bf1 with a lone Watchful Sentry (1) and Zhonya's facedown there; deck top d1. P2: Brute (7) in base, Bolt + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .unit(P2, "base", { might: 7, name: "Brute" }, "brute")
    .hand(P2, BOLT, "bolt")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Brute attacks; both pass Focus; combat kills the Sentry. Stop with its Deathknell on the chain and P1 holding priority. */
async function sentryDiesInCombat(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("brute", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 070fc7a3b21bd0b1 — hidden Zhonya's flipped in response to a Deathknell: legal in combat, lands in base, saves nothing", () => {
  test("in combat: with the Sentry dead and its Deathknell on the chain, bf1 is still contested AND still P1's (control locked) — the facedown Zhonya's is still there and IS a legal Reaction play", async () => {
    const game = await sentryDiesInCombat();
    expect(bf1(game)).toMatchObject({ contested: true, controller: P1 });
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
  });

  test("flipping it: Zhonya's is played for [0] directly into P1's BASE — not onto the battlefield — as a new item above the Deathknell", async () => {
    const game = await sentryDiesInCombat();
    await game.p1.reveal("zhonya");
    expect(game.p1.energy()).toBe(0);
    expect(game.locationOf("zhonya")).toBe("base");
    expect(game.zoneOf("zhonya")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("…and it does NOT save the unit: the Sentry had already died (nothing left to replace) — it stays in the trash, the Deathknell pays out (draw 1), Zhonya's itself survives in base, and P2 conquers bf1", async () => {
    const game = await sentryDiesInCombat();
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("zhonya")).toBe("base"); // not "killed instead"
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 070fc7a3b21bd0b1 (nuance; also 8470eb7c4a1c301d / 678069c72cf4193e / b43c764cfdfe5b69) says that
  // OUTSIDE combat, when the lone unit dies P1 loses bf1 immediately and the hidden Zhonya's is trashed before it can be
  // played in response to the Deathknell. CR 808.1.d.2 (the Deathknell becomes a Pending Item BEFORE the unit is put in the
  // trash) + 401.1 (a Pending Item ⇒ Closed State) + 323.6 / 190.4 (control lapses only in an OPEN-State Cleanup), with the
  // official clarification 9a32c2cc829f221a, say P1 KEEPS bf1 while the Deathknell is on the chain — so the hidden card is
  // still there and may be flipped (saving nothing); control and the unplayed facedown card lapse once the chain empties.
  // Engine follows CR (battlefield-control timing model, operations/battlefield-control.ts).
  test("ruling 070fc7a3b21bd0b1 nuance (rewritten to CR 808.1.d.2 / 323.6) — outside combat, Bolt kills the lone Sentry: with its Deathknell pending bf1 is STILL P1's and the hidden Zhonya's may still be flipped (to base; Sentry stays dead)", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "sentry" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Bolt resolves, Sentry dies
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", triggered: true })]);
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    expect(game.locationOf("zhonya")).toBe("base");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(bf1(game)).toMatchObject({ contested: false, controller: null }); // lapsed once the chain emptied (323.6)
  });

  test("outside combat, if P1 does NOT flip it: once the Deathknell has resolved and the state opens, bf1 lapses to nobody and the unplayed facedown Zhonya's is trashed", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("zhonya")).toBe("trash");
  });

  test("contrast — the way to actually save it: flip Zhonya's in response to the BOLT (before the death). Then the death is replaced: Zhonya's killed instead, Sentry healed/exhausted/recalled, no Deathknell draw", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "sentry" });
    await game.p2.passPriority();
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.state("sentry")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.hand()).toEqual([]);
  });
});
