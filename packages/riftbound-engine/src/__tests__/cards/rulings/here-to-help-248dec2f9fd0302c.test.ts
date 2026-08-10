/**
 * Ruling 248dec2f9fd0302c — Here to Help (SFD-111 → sfd-111-221) · Spell · Body · [2][body] · Hidden · Action
 *     "You may play a unit from hand to a battlefield you control, reducing its cost by [3]."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · Unit · Body · [8][body][body] · 8 Might · Deflect
 *     "You may play me to an occupied enemy battlefield."
 *
 * Q: Can Here to Help play Deadbloom Predator to an opponent's (occupied) battlefield on their turn?
 * A: No. Here to Help restricts the play to "a battlefield you control"; that restriction beats the Predator's extra
 *    permission (can't beats can). You play it to a battlefield you control or not at all. From hidden it is tighter
 *    still: only "here". The "may" makes playing optional, not the location.
 * Rules: 105 (restrictions override permissions), 811 (Hidden: "here"), 355.2 (location chosen as part of playing).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";
const DEADBLOOM_PREDATOR = "ogn-161-298";

/**
 * P2's turn (turn 3). P1 controls bfA (Warden 4) and bfB (Sentry 4); P2 controls bfE, OCCUPIED by a 3-Might Holder,
 * and attacks bfA with a 3-Might Raider from base. P1 holds Here to Help + Predator with [2][body] + ([8]-[3])[body][body].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 7, power: { body: 3 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .battlefield("bfE", { controller: P2 })
    .unit(P1, "bfA", { might: 4, name: "Warden" }, "warden")
    .unit(P1, "bfB", { might: 4, name: "Sentry" }, "sentry")
    .unit(P2, "bfE", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, HERE_TO_HELP, "help")
    .hand(P1, DEADBLOOM_PREDATOR, "pred");
}

/** P2 attacks bfA and passes Focus; P1 casts Here to Help (Action, with Focus) and it resolves; P1 picks the Predator. Returns the destination prompt (if any). */
async function helpIntoPredator(game: Game): Promise<Decision | null> {
  await game.p2.move("raider", "bfA");
  await game.p2.passFocus();
  expect(game.p1.can("cast", "help")).toBe(true);
  await game.p1.cast("help");
  expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 2 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toEqual(["pred"]);
  await game.p1.pick("pred");
  return game.decision();
}

describe("Ruling 248dec2f9fd0302c — Here to Help can't send Deadbloom Predator to an enemy battlefield", () => {
  test("premise: played normally from hand (P1's own turn, full price) the Predator IS offered the occupied enemy battlefield bfE", async () => {
    const game = await board().active(P1).resources(P1, { energy: 8, power: { body: 2 } }).build();
    const to = game.p1.option("playUnit", "pred")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(to).toContain("battlefield-bfE");
    expect(to).toContain("base");
  });

  test("via Here to Help on P2's turn: the location choice offers ONLY battlefields P1 controls (bfA, bfB) — not the occupied enemy bfE, and not base", async () => {
    const game = await board().build();
    const d = await helpIntoPredator(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["battlefield-bfA", "battlefield-bfB"]);
    expect(keys).not.toContain("battlefield-bfE");
    expect(keys).not.toContain("base");
    // Forcing bfE is rejected.
    const r = await game.p1.try((p) => p.answer({ keys: ["battlefield-bfE"], kind: "pick" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("pred")).not.toBe("battlefield-bfE");
  });

  test("choosing a controlled battlefield (bfB) works at the reduced price: Predator lands on bfB for [5][body][body]", async () => {
    const game = await board().build();
    await helpIntoPredator(game);
    await game.p1.pick("battlefield-bfB");
    expect(game.zoneOf("pred")).toBe("battlefield-bfB");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.p2.units("bfE")).toEqual(["holder"]); // bfE never touched
    expect(game.gameState.battlefields.bfE?.controller).toBe(P2);
  });

  test("'may' = playing is optional: P1 can decline to play any unit and Here to Help simply does nothing (Predator stays in hand, no refund)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    await game.p1.cast("help");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.decline();
    expect(game.zoneOf("help")).toBe("trash");
    expect(game.zoneOf("pred")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 2 } });
  });

  /** Hidden variant: Here to Help facedown at bfB (hidden on an earlier turn), flipped for [0] on P2's turn; P1 picks the Predator. */
  async function hiddenHelpIntoPredator(): Promise<{ game: Game; dest: Decision | null }> {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 5, power: { body: 2 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P1 })
      .battlefield("bfE", { controller: P2 })
      .unit(P1, "bfA", { might: 4, name: "Warden" }, "warden")
      .unit(P1, "bfB", { might: 4, name: "Sentry" }, "sentry")
      .unit(P2, "bfE", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .facedown(P1, "bfB", HERE_TO_HELP, "help")
      .hand(P1, DEADBLOOM_PREDATOR, "pred")
      .build();
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "help")).toBe(true);
    await game.p1.reveal("help");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 2 } }); // hidden → played for [0]
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "help"); i++) {
      await game.acting().passPriority();
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("pred");
    return { dest: game.decision(), game };
  }

  test("from HIDDEN (facedown at bfB, flipped on P2's turn): still never the enemy bfE nor base; playing to bfB costs the reduced [5][body][body]", async () => {
    const { game, dest } = await hiddenHelpIntoPredator();
    if (dest?.kind === "pick" && dest.semantics === "destination") {
      const keys = dest.options.map((o) => o.key);
      expect(keys).not.toContain("battlefield-bfE");
      expect(keys).not.toContain("base");
      await game.p1.pick("battlefield-bfB");
    }
    expect(game.zoneOf("pred")).toBe("battlefield-bfB");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.p2.units("bfE")).toEqual(["holder"]);
  });

  // rule 811.1.d.3 — played from hidden at bfB, Here to Help may only play the unit to bfB: a single legal
  // location, so the destination is locked (the prompt collapses to it, or is skipped entirely).
  test("ruling 248dec2f9fd0302c — from hidden the only legal location is 'here' (bfB), never bfA", async () => {
    const { game, dest } = await hiddenHelpIntoPredator();
    if (dest?.kind === "pick" && dest.semantics === "destination") {
      expect(dest.options.map((o) => o.key)).toEqual(["battlefield-bfB"]);
      await game.p1.pick("battlefield-bfB");
    }
    expect(game.zoneOf("pred")).toBe("battlefield-bfB");
  });
});
