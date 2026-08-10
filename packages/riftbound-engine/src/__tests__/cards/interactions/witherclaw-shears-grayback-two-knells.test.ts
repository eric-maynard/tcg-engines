/**
 * Interaction: Baccai Witherclaw (ven-078-166) × Sacred Shears (sfd-172-221) × Escaped Grayback (ven-124-166)
 *
 *   Baccai Witherclaw — Unit · Body · 4 · 4 Might
 *     "[Empower] [1][rainbow][rainbow] (…: Empower me. Use only if not Empowered.)
 *      [Empowered][>] I have +2 [Might].
 *      [Empowered][>] [Deathknell][>] Channel 2 runes exhausted. (When I die while Empowered, get the effect.)"
 *   Sacred Shears — Equipment · Order · 2 · +1   Effect Text "[Deathknell] — Draw 1."
 *   Escaped Grayback — Unit · Order · 3 · 3 Might
 *     "[Empower] — Kill a friendly unit (Pay the cost: Empower me. Use only if not Empowered.)
 *      [Empowered][>] I have +2 [Might]."
 *
 * Rules: 827.1.c.1/2 ([Empower] = "[Cost]: Empower this", the cost may be a non-resource cost — here a kill),
 * 428.1.a.1 / 428.1.a.1.b (kill-as-cost is a Kill Instruction; the dying unit's death triggers go on the chain as
 * Pending Items, its attributes NOTED first), 808.1.d.2 / 808.1.d.3 (same, look-back), 808.2 / 808.2.a (each
 * Deathknell instance triggers separately; the controller orders them), 828.1.b.1 / 828.1.c (the Empowered-gated
 * Deathknell is active only while Empowered), 718.3 (attached Equipment's Effect Text is appended to the unit),
 * 354 + 357.2 + 337.1.b / 337.3 (the activated ability is on the chain — Pending — BEFORE its costs are paid, so
 * triggers created by paying the cost are appended ABOVE it and finalized after it), 406.4 (opponent's Reaction
 * window comes only after finalization), 340.1 (LIFO), 827.2 (Empowered on resolution), 124.1 (statuses clear in
 * the trash), 435.4 / 457.1 (Equipment detaches to base, not killed).
 *
 * Question: P1's turn, open state. Witherclaw (Empowered last turn, wearing the Shears) and a plain Grayback.
 * (a) Witherclaw's Might? (b) P1 activates Grayback's [Empower] killing Witherclaw: can P2 respond before it
 * dies? how many Deathknells, who orders them, where do they sit relative to Grayback's ability, in what order do
 * "channel 2 exhausted" / "draw 1" / "Grayback becomes Empowered" happen, where do the Shears end up?
 * (c) Same line with a never-Empowered Witherclaw.
 *
 * Expected: (a) 4 +2 (Empowered) +1 (Shears) = 7. (b) The kill is a COST — paid during activation, no window for
 * P2. Look-back sees an Empowered unit wearing the Shears → TWO Deathknells (channel 2 exhausted; draw 1), P1
 * orders them; both are appended ABOVE Grayback's already-pending ability → chain bottom→top [Grayback Empower,
 * DK, DK]; P2's first priority sees three finalized items and Witherclaw already in the trash. LIFO: the DK P1 put
 * on top resolves first, then the other, Grayback's Empower LAST → Grayback 3+2 = 5. Witherclaw is a plain
 * printed-4 card in the trash; Shears sit unattached in P1's base. Net: +1 card, +2 exhausted runes, Grayback
 * Empowered. (c) Not Empowered → only the Shears' Deathknell (draw 1); no runes; Grayback still Empowered.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BACCAI_WITHERCLAW = "ven-078-166";
const SACRED_SHEARS = "sfd-172-221";
const ESCAPED_GRAYBACK = "ven-124-166";

/** P1's turn 2, open main phase. Witherclaw (optionally Empowered) wears the Shears; Grayback is plain; P2 has a bystander. */
function board(opts: { empowered: boolean }) {
  return scenario()
    .unit(P1, "base", BACCAI_WITHERCLAW, "claw", { ...(opts.empowered ? { empowered: true } : {}), equippedWith: ["shears"] })
    .card("shears", { def: SACRED_SHEARS, meta: { attachedTo: "claw" }, owner: P1, zone: "base" })
    .unit(P1, "base", ESCAPED_GRAYBACK, "grayback")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe");
}

/** Chain bottom→top as "<cardId>:<effect type>" read off the public game state (both Witherclaw triggers share a name). */
function chainShape(game: Game): string[] {
  return (game.gameState.interaction?.chain?.items ?? []).map((it) => `${it.cardId}:${(it.effect as { type?: string } | undefined)?.type ?? "?"}`);
}

/** Chain item id of the Witherclaw trigger whose effect is `type` ("draw" | "channel"). */
function triggerId(game: Game, type: string): string {
  const it = (game.gameState.interaction?.chain?.items ?? []).find((i) => i.cardId === "claw" && (i.effect as { type?: string }).type === type);
  expect(it).toBeDefined();
  return (it as { id: string }).id;
}

interface Snapshot {
  readonly hand: number;
  readonly runes: number;
  readonly empowered: boolean;
}

function snap(game: Game): Snapshot {
  return { empowered: game.state("grayback").isEmpowered, hand: game.p1.hand().length, runes: game.p1.runes().length };
}

/**
 * Pass priority back and forth until the chain is empty, recording the order in which the three observable
 * effects happen ("draw", "channel", "empower").
 */
async function drain(game: Game): Promise<string[]> {
  const events: string[] = [];
  let prev = snap(game);
  for (let i = 0; i < 16 && game.chain().length > 0; i++) {
    await game.acceptTriggerOrder();
    await game.acting().pass();
    const cur = snap(game);
    if (cur.hand > prev.hand) {
      events.push("draw");
    }
    if (cur.runes > prev.runes) {
      events.push("channel");
    }
    if (cur.empowered && !prev.empowered) {
      events.push("empower");
    }
    prev = cur;
  }
  expect(game.chain()).toEqual([]);
  return events;
}

/** Activate Grayback's [Empower] paying the cost with Witherclaw. */
async function empowerGrayback(game: Game): Promise<void> {
  expect(game.p1.can("activate", "grayback")).toBe(true);
  await game.p1.activate("grayback", 0, { sacrifice: "claw" });
}

describe("(a) setup — Empowered Witherclaw wearing Sacred Shears", () => {
  test("Witherclaw reads 4 printed +2 (Empowered passive, 828.1.c) +1 (Shears) = 7; Grayback is a plain un-Empowered 3", async () => {
    const game = await board({ empowered: true }).build();
    expect(game.state("claw")).toMatchObject({ attachments: ["shears"], baseMight: 4, isEmpowered: true, might: 7 });
    expect(game.state("shears")).toMatchObject({ attachedTo: "claw", zone: "base" });
    expect(game.state("grayback")).toMatchObject({ isEmpowered: false, might: 3 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(b) Grayback's [Empower] paid by killing the Empowered, Shears-wearing Witherclaw", () => {
  test("the kill is a COST: Witherclaw is already in the trash (plain printed 4, no status) and the Shears detached in base while P1 still holds the very first priority — P2 has had no window (827.1.c.2, 428.1.a.1, 124.1, 435.4)", async () => {
    const game = await board({ empowered: true }).build();
    await empowerGrayback(game);
    expect(game.zoneOf("claw")).toBe("trash");
    expect(game.state("claw")).toMatchObject({ attachments: [], isEmpowered: false, might: 4 });
    expect(game.state("shears")).toMatchObject({ attachedTo: undefined, owner: P1, zone: "base" });
    expect(game.p1.trash()).toEqual(["claw"]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.state("grayback").isEmpowered).toBe(false); // nothing has resolved
  });

  test("look-back (808.1.d.3): TWO separate Deathknell triggers are created — 'channel 2 exhausted' (Empowered-gated, active at death) and 'draw 1' (appended by the Shears, 718.3) — plus Grayback's own ability = three chain items, all controlled by P1 (808.2)", async () => {
    const game = await board({ empowered: true }).build();
    await empowerGrayback(game);
    expect(game.chain()).toHaveLength(3);
    expect([...chainShape(game)].sort()).toEqual(["claw:channel", "claw:draw", "grayback:empower"]);
    expect(game.chain().filter((c) => c.cardId === "claw")).toEqual([
      expect.objectContaining({ controller: P1, triggered: true, type: "ability" }),
      expect.objectContaining({ controller: P1, triggered: true, type: "ability" }),
    ]);
    expect(game.chain().find((c) => c.cardId === "grayback")).toMatchObject({ controller: P1, triggered: false, type: "ability" });
  });

  test("P1 — the triggers' controller — is offered the ORDER of the two Deathknells (808.2.a): an order Decision for P1 listing exactly the two Witherclaw triggers, before anyone has priority", async () => {
    const game = await board({ empowered: true }).build();
    await empowerGrayback(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items : [];
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.card === "claw")).toBe(true);
    expect(new Set(items.map((i) => i.key))).toEqual(new Set([triggerId(game, "draw"), triggerId(game, "channel")]));
  });

  // Expected (354 / 357.2 / 337.1.b / 428.1.a.1.b): the ability is Pending on the chain BEFORE its cost is paid,
  // so the Deathknells created by paying it are appended ABOVE it → bottom→top [grayback, claw, claw].
  // Actual: the engine kills Witherclaw (chaining both triggers) and only then appends Grayback's ability on TOP.
  test("the two Deathknells should sit ABOVE Grayback's Empower ability — chain bottom→top = [Grayback Empower, DK, DK] (354, 357.2, 337.1.b, 428.1.a.1.b)", async () => {
    const game = await board({ empowered: true }).build();
    await empowerGrayback(game);
    await game.acceptTriggerOrder();
    const shape = chainShape(game);
    expect(shape[0]).toBe("grayback:empower");
    expect([...shape.slice(1)].sort()).toEqual(["claw:channel", "claw:draw"]);
    expect(game.chain()[0]).toMatchObject({ cardId: "grayback", triggered: false });
  });

  test("P2's first Reaction window (406.4) comes only after everything is finalized: P2 sees three finalized items, Witherclaw already in the trash — nothing to save", async () => {
    const game = await board({ empowered: true }).build();
    await empowerGrayback(game);
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.view().chain).toHaveLength(3);
    expect((game.gameState.interaction?.chain?.items ?? []).every((i) => (i as { status?: string }).status !== "pending")).toBe(true);
    expect(game.zoneOf("claw")).toBe("trash");
    expect(game.state("grayback").isEmpowered).toBe(false); // still nothing resolved
  });

  // Expected (340.1): LIFO — the two Deathknells (top) resolve first in P1's chosen order, Grayback's Empower LAST.
  // Actual: Grayback's ability is on top, so "empower" is the FIRST thing that happens.
  test("resolution order should be Deathknell, Deathknell, THEN Grayback becomes Empowered — Empower resolves last (340.1, 827.2)", async () => {
    const game = await board({ empowered: true }).build();
    await empowerGrayback(game);
    const events = await drain(game);
    expect(events).toHaveLength(3);
    expect(events[2]).toBe("empower");
    expect([...events.slice(0, 2)].sort()).toEqual(["channel", "draw"]);
  });

  test("808.2.a is honoured between the two Deathknells: ordering 'draw' on top makes draw 1 resolve before channel 2; ordering 'channel' on top flips them", async () => {
    const drawTop = await board({ empowered: true }).build();
    await empowerGrayback(drawTop);
    await drawTop.p1.order([triggerId(drawTop, "channel"), triggerId(drawTop, "draw")]); // last key ends on top
    const a = (await drain(drawTop)).filter((e) => e !== "empower");
    expect(a).toEqual(["draw", "channel"]);

    const channelTop = await board({ empowered: true }).build();
    await empowerGrayback(channelTop);
    await channelTop.p1.order([triggerId(channelTop, "draw"), triggerId(channelTop, "channel")]);
    const b = (await drain(channelTop)).filter((e) => e !== "empower");
    expect(b).toEqual(["channel", "draw"]);
  });

  test("net result once the chain is empty: P1 +1 card in hand, +2 runes both EXHAUSTED (rune deck −2, no energy gained), Grayback Empowered at 3+2 = 5, Witherclaw a plain 4 in the trash, Shears unattached in base (not trash); back to P1's open main phase, no violations", async () => {
    const game = await board({ empowered: true }).build();
    const hand = game.p1.hand().length;
    const runes = game.p1.runes().length;
    const runeDeck = game.p1.runeDeck().length;
    const energy = game.p1.energy();
    await empowerGrayback(game);
    await drain(game);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.runes()).toHaveLength(runes + 2);
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 2);
    expect(game.p1.energy()).toBe(energy);
    expect(game.state("grayback")).toMatchObject({ isEmpowered: true, might: 5, zone: "base" });
    expect(game.p1.can("activate", "grayback")).toBe(false); // 827.1.c.1 — "use only if not Empowered"
    expect(game.state("claw")).toMatchObject({ attachments: [], isEmpowered: false, might: 4, zone: "trash" });
    expect(game.state("shears")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.trash()).toEqual(["claw"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) contrast — Witherclaw was never Empowered (plain 4 + 1 = 5)", () => {
  test("Witherclaw reads 5; killing it for Grayback's cost creates exactly ONE Deathknell (the Shears' draw 1) — the '[Empowered] Deathknell' is not active at the moment of death (828.1.b.1 / 828.1.c); no order prompt (nothing to order)", async () => {
    const game = await board({ empowered: false }).build();
    expect(game.state("claw")).toMatchObject({ isEmpowered: false, might: 5 });
    await empowerGrayback(game);
    expect(game.zoneOf("claw")).toBe("trash");
    expect(game.chain()).toHaveLength(2);
    expect([...chainShape(game)].sort()).toEqual(["claw:draw", "grayback:empower"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // straight to priority
  });

  test("outcome: P1 draws exactly 1, channels NOTHING (rune pool and rune deck unchanged), Grayback still becomes Empowered (5); Shears in base, Witherclaw in trash", async () => {
    const game = await board({ empowered: false }).build();
    const hand = game.p1.hand().length;
    const runes = game.p1.runes().length;
    const runeDeck = game.p1.runeDeck().length;
    await empowerGrayback(game);
    const events = await drain(game);
    expect([...events].sort()).toEqual(["draw", "empower"]);
    expect(events).not.toContain("channel");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.runes()).toHaveLength(runes);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck);
    expect(game.state("grayback")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.state("shears")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.zoneOf("claw")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
