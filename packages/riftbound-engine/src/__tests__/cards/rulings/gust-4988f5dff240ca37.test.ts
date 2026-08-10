/**
 * Ruling 4988f5dff240ca37 — Gust (OGN-169 → ogn-169-298) · [Reaction] "Return a unit at a battlefield with 3 [Might]
 *   or less to its owner's hand."
 *   × Relentless Pursuit (SFD-184 → sfd-184-221) · [Action] "Move a friendly unit. You may attach an Equipment with the
 *   same controller to it. This turn, that unit has 'When I conquer, you may move me to my base.'"
 *   (+ B.F. Sword sfd-161-221 as the Equipment.)
 *
 * Q: Can you Gust in response to the "move" part of Relentless Pursuit, before the Equipment gets attached?
 * A: No. A spell resolves atomically — there is no window between its move and its attach. You may only react while
 *    it is still on the chain: then Gust resolves first (LIFO), the unit goes to hand, and Relentless Pursuit's move AND
 *    attach both fail for want of their unit.
 * Rules: 330–337 (closed state / priority only between chain items), 359.3 (instructions in order, uninterrupted),
 *        359.3.e.14 (missing target → not performed), 155.2.b.3 (Reaction).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const RELENTLESS_PURSUIT = "sfd-184-221";
const BF_SWORD = "sfd-161-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1 controls bf1 with Runner (3 — Gust-able) and an Anchor; bf2 is open. P1: B.F. Sword unattached in
 * base, Relentless Pursuit in hand with exactly [2]+[rainbow]. P2: Gust with exactly [1].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Runner" }, "runner")
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .gear(P1, BF_SWORD, "sword")
    .hand(P1, RELENTLESS_PURSUIT, "rp")
    .hand(P2, GUST, "gust");
}

/** Cast Relentless Pursuit on the Runner bound for bf2 (the destination is named with the play, 355.4). */
async function castPursuit(game: Game): Promise<void> {
  await game.p1.cast("rp", { targets: "runner" });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.key)).toContain("battlefield-bf2");
    await game.p1.pick("battlefield-bf2");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["rp"]);
  expect(game.locationOf("runner")).toBe("bf1"); // nothing has moved yet
}

/** Accept the optional attach however it is asked (yes/no then pick, or a declinable pick). */
async function acceptAttach(game: Game): Promise<void> {
  const d = game.decision();
  if (d?.kind === "yes-no" && d.seat === P1) {
    await game.p1.yes();
  }
  const p = game.decision();
  if (p?.kind === "pick" && p.seat === P1 && p.options.some((o) => (o.card ?? o.key) === "sword")) {
    await game.p1.pick("sword");
  }
}

describe("Ruling 4988f5dff240ca37 — no reaction window inside Relentless Pursuit's resolution", () => {
  test("unopposed: once both pass, Relentless Pursuit resolves in one go — destination, then straight to P1's attach choice with NO priority for P2 in between; Runner ends at bf2 wearing the Sword", async () => {
    const game = await board().build();
    await castPursuit(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 }); // P2's ONLY window
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.passPriority();
    // Resolution has begun: every prompt from here until the spell is in the trash belongs to P1 (the resolver).
    if (game.decision()?.kind === "pick" && game.locationOf("runner") === "bf1") {
      await game.p1.pick("battlefield-bf2"); // (destination asked on resolution instead)
    }
    expect(game.locationOf("runner")).toBe("bf2");
    const mid = game.decision();
    expect(mid?.seat).toBe(P1);
    expect(mid?.kind).not.toBe("action"); // not a priority window — P2 cannot Gust "after the move, before the attach"
    expect(game.p2.legal().some((o) => o.verb === "cast")).toBe(false);
    await acceptAttach(game);
    await game.settle();
    expect(game.zoneOf("rp")).toBe("trash");
    expect(game.state("runner").attachments).toEqual(["sword"]);
    expect(game.state("sword").attachedTo).toBe("runner");
  });

  test("P2 Gusts the Runner while Relentless Pursuit is still on the chain: Gust resolves first → Runner to hand; then Relentless Pursuit finds no unit — nothing moves and the Sword is NOT attached to anything", async () => {
    const game = await board().build();
    await castPursuit(game);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "runner" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rp", "gust"]);
    // Resolve everything; decline/ignore any stray optional prompt (there should be none about the Runner).
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.acting().pass();
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else if (d.kind === "pick" && d.allowDecline) {
        await game.seat(d.seat).decline();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("rp")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("hand");
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("anchor").attachments).toEqual([]); // no re-targeting onto another unit
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // no refund
    expect(game.violations()).toEqual([]);
  });
});
