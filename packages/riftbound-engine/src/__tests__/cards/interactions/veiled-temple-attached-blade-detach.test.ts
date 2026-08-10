/**
 * Interaction: Veiled Temple (sfd-221-221) · Battlefield
 *     "When you conquer here, you may ready a friendly gear. If it's an Equipment, you may detach it."
 *   × Doran's Blade (sfd-095-221) · Gear (Equipment) · Body · 2 · +2 Might · "[Equip] [body]"
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla) — the wearer
 *   (+ a printed Gold gear token sfd-t03 as the non-Equipment contrast)
 *
 * Rules: 434.5 (attaching changes neither card's state), 719.4 (the Top-Most card's ready/exhausted
 * state does not affect its attachments and vice versa), 719.3.a (attachments change location with
 * the Top-Most card), 718.5.a/b + 150.4 (an attached Equipment is still a gear on the board and can
 * be chosen), 415.1.c (readying a ready permanent does nothing more), 435.1.c (on Detach the Rules
 * Text — [Equip] — is active again), 435.1.e (the wearer loses the Might Bonus at once), 435.4 /
 * 435.4.a + 457.1 + 323.7 (a detached gear is at the wearer's location and is Recalled to base at the
 * next Cleanup — 319.5/319.7: which follows the trigger's resolution immediately), 434.4 / 434.4.a
 * (Attach relocates the gear to the wearer — not a Move), 151.2 / 818.1 (Equip: your Main Phase, Open
 * state, "a unit you control" — anywhere), 818.3.b / 719.2 (no attachments → no longer Equipped /
 * Top-Most).
 *
 * Question: P1's READY Vanguard Sergeant in base wears a READY Doran's Blade (4+2 = 6). Veiled Temple
 * (bf1) is held by P2's 3-Might unit. P1 standard-moves the Sergeant there (exhausting it), wins 6 v 3
 * and conquers.
 *   (a) After the move: is the Blade exhausted with its wearer? Where is it?
 *   (b) May P1 choose the ATTACHED, ALREADY-READY Blade? Does "ready" do anything, does it ready the
 *       Sergeant, and is "you may detach it" still offered after a no-op ready?
 *   (c) P1 detaches: Sergeant's Might; where is the Blade and in what state; which text is active?
 *   (d) Same Main Phase: may P1 pay [body] to Equip it back onto the exhausted Sergeant at the Temple?
 *       Then: Blade location, Sergeant still exhausted, Blade still ready?
 *   (e) Choosing the exhausted Gold token instead: readied, no detach question. Choosing nothing.
 * Expected: (a) only the Sergeant exhausts; Blade ready, attached, at the Temple. (b) yes; ready is a
 * no-op, Sergeant stays exhausted, detach still offered. (c) 6 → 4 at once; Blade unattached, ready,
 * [Equip] live again, recalled to P1's base by the Cleanup that follows; Sergeant exhausted at the
 * Temple, no attachments; P1 holds the Temple (+1 point). (d) yes: [body], Blade back at the Temple on
 * the Sergeant (6), Sergeant still exhausted, Blade still ready. (e) Gold readied, nothing else asked;
 * "no" → nothing happens, Blade stays on.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEILED_TEMPLE = "sfd-221-221";
const DORANS_BLADE = "sfd-095-221";
const VANGUARD_SERGEANT = "ogn-219-298";
const GOLD_TOKEN = "sfd-t03"; // printed Gold gear token — a gear that is NOT an Equipment

/**
 * P1's turn: Sergeant (4) in base, Doran's Blade loose in base, an EXHAUSTED Gold token, 2 body power
 * (one [Equip] now, one for the re-equip later). Veiled Temple = bf1, live, held by P2's 3-Might Holder.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 0, power: { body: 2 } })
    .battlefield("bf1", { controller: P2, def: VEILED_TEMPLE, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 1, name: "Elsewhere" }, "elsewhere")
    .unit(P1, "base", VANGUARD_SERGEANT, "sarge")
    .gear(P1, DORANS_BLADE, "blade")
    .gear(P1, GOLD_TOKEN, "gold", { exhausted: true });
}

/** Equip the Blade onto the Sergeant via the real [Equip] [body] activation and let it resolve (base, both ready). */
async function wearBlade(game: Game): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "blade", unitId: "sarge" } });
  await game.settle();
  expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", isReady: true, zone: "base" });
  expect(game.state("sarge")).toMatchObject({ attachments: ["blade"], isReady: true, might: 6 });
  expect(game.p1.power("body")).toBe(1);
}

/** Pass focus/priority until a non-action prompt (or the open main phase) shows up. */
async function untilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** Sergeant (wearing the Blade) attacks the Temple; combat resolves 6 v 3; stop at the Temple's "you may" opt-in. */
async function conquerTemple(game: Game): Promise<void> {
  await wearBlade(game);
  await game.p1.move("sarge", "bf1");
  await untilPrompt(game);
  expect(game.zoneOf("holder")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  expect(game.decision()?.source?.cardId).toBe("bf1");
}

/** Accept the opt-in, choose `gearId`, and pass priority until the trigger resolves far enough to ask (or not) the detach question. */
async function readyGear(game: Game, gearId: string): Promise<void> {
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(gearId);
  for (let i = 0; i < 8 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().pass();
  }
}

describe("Veiled Temple × an attached, already-ready Doran's Blade — ready (no-op), detach, recall, re-equip", () => {
  // ── (a) state check after the Standard Move ─────────────────────────────────────────────────

  test("(a) the Standard Move exhausts only the Sergeant: the attached Blade rides along to the Temple (719.3.a) and stays READY (719.4 / 434.5)", async () => {
    const game = await board().build();
    await wearBlade(game);
    await game.p1.move("sarge", "bf1");
    // Showdown just opened — nothing has resolved yet.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("sarge")).toMatchObject({ isExhausted: true, might: 6, zone: "battlefield-bf1" });
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", isReady: true, location: "bf1", zone: "battlefield-bf1" });
    // An attached Equipment is listed through its bearer, not as loose gear.
    expect(game.p1.gear()).toEqual(["gold"]);
  });

  test("(a) the combat: 6 (4 + Blade) beats the 3-Might Holder → Holder dies, P1 conquers the Temple for 1 point, Sergeant undamaged after cleanup, and the Temple's 'When you conquer here' asks P1 'you may'", async () => {
    const game = await board().build();
    await conquerTemple(game);
    expect(game.p1.points()).toBe(1);
    expect(game.state("sarge")).toMatchObject({ damage: 0, isExhausted: true, might: 6, zone: "battlefield-bf1" });
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", isReady: true, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, name: "Veiled Temple", triggered: true })]);
  });

  // ── (b) choosing the attached, already-ready Blade ──────────────────────────────────────────

  test("(b) 'a friendly gear': the ATTACHED, READY Blade is a legal choice alongside the exhausted Gold token (718.5.b, 150.4) — no unit, no enemy card is offered", async () => {
    const game = await board().build();
    await conquerTemple(game);
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, semantics: "target" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["blade", "gold"]);
    await game.p1.pick("blade");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", targets: ["blade"], triggered: true })]);
  });

  test("(b) on resolution 'ready' is a no-op on the ready Blade (415.1.c) and does NOT ready the exhausted Sergeant (719.4) — yet 'If it's an Equipment, you may detach it' IS still asked", async () => {
    const game = await board().build();
    await conquerTemple(game);
    await readyGear(game, "blade");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt ?? "").toMatch(/detach/i);
    // The ready step has already executed at this point: Blade (still) ready, Sergeant (still) exhausted, still attached.
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", isReady: true });
    expect(game.state("sarge")).toMatchObject({ isExhausted: true, might: 6 });
  });

  test("(b) declining the detach: the Blade simply stays on the (exhausted) Sergeant, ready, 6 Might; open main phase", async () => {
    const game = await board().build();
    await conquerTemple(game);
    await readyGear(game, "blade");
    await game.p1.no();
    await game.settle();
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", isReady: true, zone: "battlefield-bf1" });
    expect(game.state("sarge")).toMatchObject({ attachments: ["blade"], isExhausted: true, might: 6, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("equipCard")).toBe(false); // still attached → [Equip] inactive (718.2)
  });

  // ── (c) detach ──────────────────────────────────────────────────────────────────────────────

  test("(c) accepting the detach: Sergeant 6 → 4 at once (435.1.e), no attachments, still EXHAUSTED at the Temple; P1 keeps the Temple and the point", async () => {
    const game = await board().build();
    await conquerTemple(game);
    await readyGear(game, "blade");
    await game.p1.yes();
    await game.settle();
    expect(game.state("sarge")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) the detached Blade: unattached, still READY, and — a loose gear at a battlefield — Recalled to P1's BASE by the Cleanup that follows the trigger's resolution (435.4.a, 457.1, 323.7); a Recall, not a Move", async () => {
    const game = await board().build();
    await conquerTemple(game);
    await readyGear(game, "blade");
    const moved = { ...(game.gameState.unitsMovedThisTurn ?? {}) };
    await game.p1.yes();
    await game.settle();
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, isReady: true, location: "base", owner: P1, zone: "base" });
    expect(game.p1.gear().sort()).toEqual(["blade", "gold"]);
    expect(game.cardsAt("battlefield-bf1").sort()).toEqual(["sarge"]); // nothing but the Sergeant left at the Temple
    expect(game.gameState.unitsMovedThisTurn ?? {}).toEqual(moved); // the recall moved no unit and is not a Move anyway
  });

  test("(c) texts flip (435.1.c): the loose Blade's Rules Text '[Equip] [body]' is ACTIVE again — the Equip action is back on P1's menu naming blade → sarge; its +2 modulates nobody", async () => {
    const game = await board().build();
    await conquerTemple(game);
    await readyGear(game, "blade");
    await game.p1.yes();
    await game.settle();
    expect(game.state("blade").keywords).toContain("Equip");
    const equip = game.p1.option("equipCard");
    expect(equip).toBeDefined();
    expect(equip?.fields.find((f) => f.name === "equipmentId")?.options).toEqual(["blade"]);
    expect(equip?.fields.find((f) => f.name === "unitId")?.options).toEqual(["sarge"]);
    expect(game.state("sarge").might).toBe(4);
  });

  // ── (d) re-equip the same Main Phase ────────────────────────────────────────────────────────

  test("(d) same Main Phase, Open state: P1 pays [body] to Equip the Blade back onto the EXHAUSTED Sergeant at the Temple — a unit at a battlefield is a legal 'unit you control' (151.2, 818.1)", async () => {
    const game = await board().build();
    await conquerTemple(game);
    await readyGear(game, "blade");
    await game.p1.yes();
    await game.settle();
    expect(game.p1.power("body")).toBe(1);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "blade", unitId: "sarge" } });
    expect(game.p1.power("body")).toBe(0); // exactly [body], no energy
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("sarge");
  });

  test("(d) after the re-attach (434.4 / 434.5): the Blade's location is the Temple again, NEITHER state changed — Sergeant still exhausted (6 Might again), Blade still ready — and it was not a Move", async () => {
    const game = await board().build();
    await conquerTemple(game);
    await readyGear(game, "blade");
    await game.p1.yes();
    await game.settle();
    const moved = { ...(game.gameState.unitsMovedThisTurn ?? {}) };
    await game.p1.choose("equipCard:-", { params: { equipmentId: "blade", unitId: "sarge" } });
    await game.settle();
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", isReady: true, location: "bf1", zone: "battlefield-bf1" });
    expect(game.state("sarge")).toMatchObject({ attachments: ["blade"], isExhausted: true, might: 6, zone: "battlefield-bf1" });
    expect(game.gameState.unitsMovedThisTurn ?? {}).toEqual(moved);
    expect(game.p1.gear()).toEqual(["gold"]); // attached again → no longer loose gear
    expect(game.p1.can("equipCard")).toBe(false);
    // And it stays put through the turn's end: an ATTACHED gear at a battlefield is not recalled (323.7).
    await game.advanceTurn();
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  // ── (e) the NO side ─────────────────────────────────────────────────────────────────────────

  test("(e) choosing the exhausted Gold token (a gear, not an Equipment): it is READIED and no detach question is ever asked; the Blade stays on the Sergeant (6)", async () => {
    const game = await board().build();
    await conquerTemple(game);
    expect(game.state("gold").isExhausted).toBe(true);
    await readyGear(game, "gold");
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.state("gold")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", isReady: true });
    expect(game.state("sarge")).toMatchObject({ isExhausted: true, might: 6 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(e) 'you may' — P1 chooses nothing: the conquer and the point stand, Gold stays exhausted, Blade stays attached and ready, Sergeant exhausted at 6; nothing lingers on the chain", async () => {
    const game = await board().build();
    await conquerTemple(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("gold").isExhausted).toBe(true);
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", isReady: true, zone: "battlefield-bf1" });
    expect(game.state("sarge")).toMatchObject({ attachments: ["blade"], isExhausted: true, might: 6 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
