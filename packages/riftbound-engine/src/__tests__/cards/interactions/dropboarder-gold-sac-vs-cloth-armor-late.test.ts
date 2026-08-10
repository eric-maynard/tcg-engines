/**
 * Interaction: Dropboarder (sfd-072-221) · Unit · Mind · 4 · 4 Might
 *     "When you play me, if you control two or more gear, ready me."
 *   × Gold (sfd-t03) · Gear token — "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   × Cloth Armor (sfd-064-221) · Equipment · Mind · 1 — "[Quick-Draw] (This has [Reaction]. When you play it,
 *     attach it to a unit you control.) [Equip] [mind] [Shield 2]"
 *
 * Rules: 383.2.a.1 (an "if …" immediately after the trigger Condition is PART OF THE CONDITION, evaluated when
 * the inciting event is processed — 383.2.c — and never re-checked: "If she is removed in reaction to the
 * triggered ability, it will still resolve"), 383.4.a.2 (play effects become Pending Items after the permanent
 * enters), 359.2 / 359.2.c (a permanent leaves the chain at once and enters exhausted — there is no reaction
 * window against the unit itself), 337.4 (after finalization the controller of the newest item — P1 — holds
 * priority first), 404.1 + Gold's text (Kill this + Exhaust are COSTS; [Add] abilities can't be reacted to),
 * 186.1 (a killed token ceases to exist).
 *
 * Deprecated FAQ #8211 claimed the gear count is checked on resolution (so a Cloth Armor response could turn it
 * on); current CR 383.2.a.1 / riftjudge #10151 say the opposite. These tests follow the CR.
 *
 * Question:
 *  (a) FALSE→TRUE attempt — P1 controls exactly ONE gear (a Gold token), holds Cloth Armor (Reaction via
 *      Quick-Draw) with [mind] + energy to spare, and plays Dropboarder. Is there a trigger on the chain P1 could
 *      answer with Cloth Armor so Dropboarder readies?
 *  (b) TRUE→FALSE — P1 controls TWO gear (Gold + Cloth Armor in play), plays Dropboarder, and with the ready
 *      trigger on the chain cashes the Gold (killing it → one gear). Does Dropboarder still ready?
 *
 * Expected:
 *  (a) No. One gear when the play event is processed → condition false → the ability is never put on the chain:
 *      zero chain items, no priority window, straight back to P1's open main phase with Dropboarder EXHAUSTED.
 *      P1 may then play Cloth Armor normally (it attaches to Dropboarder, gear count becomes 2) — Dropboarder does
 *      not retroactively ready.
 *  (b) Yes. Two gear at evaluation → the trigger is on the chain as P1's item; P1 (priority first) activates Gold:
 *      it dies as a cost (ceases to exist), P1 gains 1 [rainbow], nothing goes on the chain for it; gear count is
 *      now 1 but the condition is not re-sampled → both pass → Dropboarder READY.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DROPBOARDER = "sfd-072-221";
const GOLD = "sfd-t03";
const CLOTH_ARMOR = "sfd-064-221";

/**
 * (a) P1's turn: ONE gear (a ready Gold token) in base, Cloth Armor + Dropboarder in hand, 4 (Dropboarder) + 1
 * (Cloth Armor) energy and a [mind] floating. P2 has a bystander so "enemy" exists.
 */
function oneGearBoard() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .battlefield("bf1", { controller: null })
    .gear(P1, GOLD, "gold")
    .hand(P1, CLOTH_ARMOR, "cloth")
    .hand(P1, DROPBOARDER, "drop")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .build();
}

/** (b) P1's turn: TWO gear in base (ready Gold token + an unattached Cloth Armor), Dropboarder in hand, exactly 4 energy. */
function twoGearBoard() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: null })
    .gear(P1, GOLD, "gold")
    .gear(P1, CLOTH_ARMOR, "cloth")
    .hand(P1, DROPBOARDER, "drop")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .build();
}

/** Pass priority until the chain is empty. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("(a) one gear at the moment of play — the 'if you control two or more gear' CONDITION fails, so nothing triggers (383.2.a.1, 383.2.c)", () => {
  test("premise: P1 controls exactly one gear (the Gold token) and Cloth Armor is a legal play from hand right now", async () => {
    const game = await oneGearBoard();
    expect(game.p1.gear()).toEqual(["gold"]);
    expect(game.state("gold")).toMatchObject({ cardType: "gear", isReady: true, isToken: true });
    expect(game.p1.can("play", "cloth")).toBe(true);
    expect(game.p1.can("play", "drop")).toBe(true);
  });

  test("playing Dropboarder (4 paid) creates ZERO chain items — no Dropboarder trigger, no FIN/RES decision, no priority window: the very next decision is P1's open main phase", async () => {
    const game = await oneGearBoard();
    await game.p1.play("drop", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.chain().some((c) => c.cardId === "drop")).toBe(false);
    const d = game.decision();
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(d?.timing).toBe("ACT");
    expect(game.p1.can("passPriority")).toBe(false); // nothing to respond to
  });

  test("Dropboarder therefore enters and STAYS exhausted (359.2.c)", async () => {
    const game = await oneGearBoard();
    await game.p1.play("drop", { to: "base" });
    expect(game.state("drop")).toMatchObject({ controller: P1, isExhausted: true, isReady: false, might: 4, zone: "base" });
    await game.settle();
    expect(game.state("drop").isExhausted).toBe(true);
  });

  test("playing Cloth Armor AFTERWARDS in the open state is fine (it attaches to Dropboarder, gear count → 2) but does not retroactively ready Dropboarder — play effects fire once", async () => {
    const game = await oneGearBoard();
    await game.p1.play("drop", { to: "base" });
    await game.p1.play("cloth");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("drop");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.p1.gear().sort()).toEqual(["cloth", "gold"]);
    expect(game.state("cloth").attachedTo).toBe("drop");
    expect(game.state("drop").attachments).toEqual(["cloth"]);
    expect(game.state("drop").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) two gear at the moment of play — the trigger is on the chain and survives the Gold being cashed in response", () => {
  test("premise: P1 controls two gear (Gold token + Cloth Armor)", async () => {
    const game = await twoGearBoard();
    expect(game.p1.gear().sort()).toEqual(["cloth", "gold"]);
  });

  test("playing Dropboarder puts its ready-trigger on the chain as P1's triggered item (no target asked — 'me' is a self-reference); Dropboarder is already on the board exhausted; P1 holds priority first (337.4) with the Gold's Reaction among its legal actions", async () => {
    const game = await twoGearBoard();
    await game.p1.play("drop", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drop", controller: P1, triggered: true, type: "ability" })]);
    expect(game.state("drop")).toMatchObject({ isExhausted: true, zone: "base" });
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "gold")).toBe(true);
  });

  test("P1 activates Gold in response: Kill this + Exhaust are its COST → the token ceases to exist (186.1), P1 gains 1 [rainbow], nothing is added to the chain for it ([Add] can't be reacted to), P1 keeps priority; gear count is now ONE while the trigger is still pending resolution", async () => {
    const game = await twoGearBoard();
    await game.p1.play("drop", { to: "base" });
    await game.p1.activate("gold");
    expect(game.has("gold")).toBe(false);
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.gear()).toEqual(["cloth"]); // gearCountAtRES === 1
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drop", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("drop").isExhausted).toBe(true); // not resolved yet
  });

  test("both pass → the trigger resolves WITHOUT re-sampling the gear count: Dropboarder becomes READY with only one gear under P1's control (383.2.a.1 — contra deprecated FAQ #8211)", async () => {
    const game = await twoGearBoard();
    await game.p1.play("drop", { to: "base" });
    await game.p1.activate("gold");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's window on the trigger
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.gear()).toEqual(["cloth"]);
    expect(game.state("drop")).toMatchObject({ isExhausted: false, isReady: true, zone: "base" });
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: leaving the Gold alone, the trigger simply resolves and readies Dropboarder with both gear still in play", async () => {
    const game = await twoGearBoard();
    await game.p1.play("drop", { to: "base" });
    await drainChain(game);
    expect(game.state("drop").isReady).toBe(true);
    expect(game.p1.gear().sort()).toEqual(["cloth", "gold"]);
  });
});
