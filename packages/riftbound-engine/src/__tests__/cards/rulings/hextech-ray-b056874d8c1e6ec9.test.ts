/**
 * Ruling b056874d8c1e6ec9 — Hextech Ray (OGN-009 → ogn-009-298) · Action · [1][fury] · "Deal 3 to a unit at a battlefield."
 *   × Sprite Call (OGN-094 → ogn-094-298) · [Hidden] [Action] · [3] · "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *   × Sprite token (OGN-274 → ogn-274-298)
 *
 * Q: The opponent contests my battlefield and Hextech Rays my only unit there. Can I Sprite Call to that battlefield during
 *    the showdown?
 * A: No — units are only played to your base or a battlefield you control, and with your only unit there killed you have
 *    lost control at once, so the token can't be played there. If you still had another unit there you could. And a HIDDEN
 *    Sprite Call flipped in reaction to the Ray (before the kill) can still put the token there.
 * Rules: 346 (play destinations: base / a battlefield you control), 190.4.c (no units → control lost), 811 (Hidden: react
 *        for [0]), 332 (LIFO — the revealed Sprite Call resolves before the Ray).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const SPRITE_CALL = "ogn-094-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P2's turn 3. P1 controls bf1 with Anchor (3) — plus a Buddy (2) when `buddy` — and bf2 with Other (2). P2's Raider (4) attacks
 * from base; P2 has Hextech Ray + [1][fury]. P1 has Sprite Call in hand with [3] (or facedown at bf1 when `hidden`).
 */
function board(opts: { buddy?: boolean; hidden?: boolean } = {}) {
  let b = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
    .unit(P1, "bf2", { might: 2, name: "Other" }, "other")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, HEXTECH_RAY, "ray");
  if (opts.buddy) {
    b = b.unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy");
  }
  return opts.hidden ? b.facedown(P1, "bf1", SPRITE_CALL, "call") : b.hand(P1, SPRITE_CALL, "call");
}

/** Raider attacks bf1; P2 (Focus) Rays the Anchor and it resolves; Focus passes to P1. */
async function anchorRayedMidShowdown(opts: { buddy?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("ray", { targets: "anchor" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("anchor")).toBe("trash");
  if (game.actingSeat() === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 casts Sprite Call from hand and passes it through to the token's destination prompt. */
async function spriteCallToDestination(game: Game): Promise<Pick> {
  expect(game.p1.can("cast", "call")).toBe(true);
  await game.p1.cast("call");
  expect(game.p1.energy()).toBe(0);
  for (let i = 0; i < 4 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  return d as Pick;
}

describe("Ruling b056874d8c1e6ec9 — no Sprite Call onto a battlefield whose only defender the Ray just killed", () => {
  // RULING-CONFLICT: riftjudge b056874d8c1e6ec9 (with 04fa74a73219a761 Flash, 792f2571b4fd68f3 Rebuke, c37012557b4ba27f,
  // d039a38c7976af6b) says control of the emptied battlefield is lost at once mid-combat; CR 190.4.b (+ the official
  // clarification 9a32cc…) FREEZES control while a Showdown/Combat is ongoing there, so P1 still holds bf1 and it stays a
  // legal destination until the combat resolves — engine follows CR. This minority family is not re-litigated per card;
  // see the control-timing matrix in core-rules/battlefield-control-timing.test.ts.
  test("ruling b056874d8c1e6ec9 (CR reading) — control of the emptied bf1 is frozen for the ongoing showdown, so the Sprite may still be played there", async () => {
    const game = await anchorRayedMidShowdown();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // 190.4.b — frozen, not lapsed
    const d = await spriteCallToDestination(game);
    const keys = d.options.map((o) => o.key);
    expect(keys).toContain("base");
    expect(keys).toContain("battlefield-bf2");
    expect(keys).toContain("battlefield-bf1");
  });

  test("what P1 CAN still do: Sprite Call is castable in the showdown and the token may go to base or to bf2 (still held by Other)", async () => {
    const game = await anchorRayedMidShowdown();
    const d = await spriteCallToDestination(game);
    const keys = d.options.map((o) => o.key);
    expect(keys).toContain("base");
    expect(keys).toContain("battlefield-bf2");
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    const sprite = game.cardsAt("bf2").find((id) => game.state(id).name === "Sprite");
    expect(sprite).toBeDefined();
    expect(game.state(sprite as string)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 3 });
  });

  test("nuance — another unit survives there: with Buddy still at bf1 P1 keeps control, bf1 IS a legal destination, and the Sprite joins the defence", async () => {
    const game = await anchorRayedMidShowdown({ buddy: true });
    expect(game.p1.units("bf1")).toEqual(["buddy"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    const d = await spriteCallToDestination(game);
    expect(d.options.map((o) => o.key)).toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().passPriority();
    }
    const sprite = game.cardsAt("bf1").find((id) => game.state(id).name === "Sprite");
    expect(sprite).toBeDefined();
    expect(game.p1.units("bf1").sort()).toEqual(["buddy", sprite as string].sort());
    expect(game.violations()).toEqual([]);
  });

  test("nuance — HIDDEN Sprite Call flipped in reaction to the Ray: it resolves first (Anchor still alive, bf1 still mine), the token lands at bf1, and after the Ray kills the Anchor the Sprite still holds bf1 for P1", async () => {
    const game = await board({ hidden: true }).build();
    await game.p2.move("raider", "bf1");
    await game.p2.cast("ray", { targets: "anchor" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "call")).toBe(true);
    await game.p1.reveal("call");
    expect(game.p1.energy()).toBe(3); // played from hidden for [0]
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "call"]);
    // LIFO: Sprite Call resolves first, while the Anchor is alive and bf1 is unquestionably P1's. A card played from
    // Hidden takes effect "here" (811.1.d.1) — if the engine asks for a destination at all, bf1 must be on offer.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "call") && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
      expect(d.options.map((o) => o.key)).toContain("battlefield-bf1");
      await game.p1.pick("battlefield-bf1");
    }
    expect(game.zoneOf("anchor")).toBe("battlefield-bf1"); // not killed yet
    expect(game.cardsAt("bf1").some((id) => game.state(id).name === "Sprite")).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    // Now the Ray resolves and kills the Anchor.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("anchor")).toBe("trash");
    const sprite = game.cardsAt("bf1").find((id) => game.state(id).name === "Sprite");
    expect(sprite).toBeDefined();
    expect(game.p1.units("bf1")).toEqual([sprite as string]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
