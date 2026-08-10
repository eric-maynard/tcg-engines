/**
 * Interaction: Monster Harpoon (unl-014-219) · Spell · Fury · [1][fury] · Action
 *     "Deal 2 to a unit at a battlefield. If you control a facedown card, deal 4 to it instead."
 *   × Consult the Past (ogn-083-298) · Spell · Mind · 4 · "[Hidden] [Reaction] Draw 2."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · 4 Might (vanilla)
 *
 * Question: P1 controls bf1 (one unit) with Consult the Past facedown there since last turn. P2
 * controls bf2 with Vanguard Sergeant (4) and also has a facedown card at bf2. On P1's turn P1
 * plays Monster Harpoon targeting Sergeant at bf2.
 *   (a) Does a facedown card at a DIFFERENT battlefield (bf1) satisfy the condition? Does P2's
 *       facedown card count for P1?
 *   (b) P1 keeps priority after finalizing Harpoon and flips Consult the Past for [0] in response.
 *       How much does Harpoon deal — is the condition locked in at play time or checked on resolution?
 *   (c) Contrast: Harpoon resolves first, then P1 flips Consult the Past afterwards the same turn.
 *   (d) Is flipping Consult the Past from bf1 subject to any 'here' restriction?
 *
 * Rules: 355.9.a.3 ("facedown card" = a card in a Facedown Zone — no location qualifier; only
 * YOUR facedown cards are ones "you control"), 337.1.a (finalizing does not pass priority),
 * 811.6 / 811.1.b (a Hidden card has [Reaction] from the next turn and plays for 0), 421.4 (it is
 * revealed as it leaves the Facedown Zone), 359.3.d + 383.2.a.1 Loose-Cannon example (an "if …"
 * inside the effect is evaluated when the instruction executes on resolution, not at play time),
 * 323.6 / 323.7 (P2 losing its last unit at bf2 loses bf2 and its own facedown card there is
 * trashed), 811.1.d / 811.2 (only target / play-location choices are restricted to "here";
 * Consult the Past chooses nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARPOON = "unl-014-219";
const CONSULT = "ogn-083-298";
const SERGEANT = "ogn-219-298"; // 4 Might
const HERE_TO_HELP = "sfd-111-221"; // any [Hidden] card — P2's facedown at bf2

/** Turn 3, P1 to act. P1: bf1 + guard + facedown Consult; P2: bf2 + Sergeant (+ optional own facedown). */
function board(opts: { p1Facedown?: boolean; p2Facedown?: boolean } = {}) {
  const { p1Facedown = true, p2Facedown = true } = opts;
  let b = scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bf2", SERGEANT, "sergeant")
    .hand(P1, HARPOON, "harpoon");
  if (p1Facedown) {
    b = b.facedown(P1, "bf1", CONSULT, "consult");
  }
  if (p2Facedown) {
    b = b.facedown(P2, "bf2", HERE_TO_HELP, "theirs");
  }
  return b;
}

async function castHarpoon(game: Game): Promise<void> {
  await game.p1.cast("harpoon", { targets: "sergeant" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["harpoon"]);
}

describe("Monster Harpoon × facedown Consult the Past — where the facedown card is, whose it is, and WHEN the 'if' is checked", () => {
  // ── (a) location / controller of the facedown card ────────────────────────────────────────

  test("(a) Harpoon offers only units AT A BATTLEFIELD — Sergeant at bf2 and P1's own guard at bf1", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "harpoon")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
    expect(offered).toEqual(["guard", "sergeant"]);
  });

  test("(a) P1's facedown card at bf1 satisfies 'you control a facedown card' even though the target is at bf2 → 4 damage kills Sergeant (355.9.a.3)", async () => {
    const game = await board({ p2Facedown: false }).build();
    await castHarpoon(game);
    await game.settle();
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.zoneOf("harpoon")).toBe("trash");
    expect(game.zoneOf("consult")).toBe("facedown-bf1"); // untouched — the condition only looks at it
  });

  test("(a) P2's facedown card is controlled by P2 and never satisfies P1's condition → only 2 damage, Sergeant (4) survives", async () => {
    const game = await board({ p1Facedown: false }).build();
    await castHarpoon(game);
    await game.settle();
    expect(game.zoneOf("sergeant")).toBe("battlefield-bf2");
    expect(game.state("sergeant").damage).toBe(2);
    expect(game.zoneOf("theirs")).toBe("facedown-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  // ── (b) flip Consult the Past in response to your own Harpoon ─────────────────────────────

  test("(b) finalizing Harpoon does not pass priority (337.1.a): P1 still acts and the facedown Consult the Past is listed as playable for [0] (811.6)", async () => {
    const game = await board().build();
    await castHarpoon(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "consult")).toBe(true);
    await game.p1.reveal("consult");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // nothing more paid
    expect(game.chain().map((c) => c.cardId)).toEqual(["harpoon", "consult"]);
    expect(game.zoneOf("consult")).toBe("chain");
    expect(game.state("consult").isHidden).toBe(false); // revealed as it left the Facedown Zone (421.4)
    expect(game.p1.facedown("bf1")).toEqual([]);
  });

  test("(b) Consult the Past resolves first (LIFO): P1 draws 2 while Harpoon is still on the chain", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length; // includes harpoon
    await castHarpoon(game);
    await game.p1.reveal("consult");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Consult resolves
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["harpoon"]);
    expect(game.state("sergeant").damage).toBe(0); // Harpoon has not resolved yet
  });

  test("(b) when Harpoon then resolves P1 controls NO facedown card → the 'if … instead' is checked on resolution: only 2 damage, Sergeant (4) survives (359.3.d, cf. 383.2.a.1)", async () => {
    const game = await board().build();
    await castHarpoon(game);
    await game.p1.reveal("consult");
    await game.settle();
    expect(game.zoneOf("harpoon")).toBe("trash");
    expect(game.zoneOf("sergeant")).toBe("battlefield-bf2");
    expect(game.state("sergeant").damage).toBe(2);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.zoneOf("theirs")).toBe("facedown-bf2"); // P2 still controls bf2 → its hidden card stays
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) resolve Harpoon first, flip afterwards ────────────────────────────────────────────

  test("(c) letting Harpoon resolve while Consult is still facedown deals 4: Sergeant dies; P2 has no unit at bf2 → loses bf2 and its own facedown card there is trashed (323.6, 323.7)", async () => {
    const game = await board().build();
    await castHarpoon(game);
    await game.settle();
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.p2.units("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller).not.toBe(P2);
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p2.trash()).toContain("theirs");
    expect(game.state("theirs").isHidden).toBe(false);
    expect(game.zoneOf("consult")).toBe("facedown-bf1"); // still hidden, still P1's
  });

  test("(c) …then, in the following Open state of the same turn, P1 flips Consult the Past for [0] and draws 2 — same cards, better order", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await castHarpoon(game);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "consult")).toBe(true);
    await game.p1.reveal("consult");
    expect(game.chain().map((c) => c.cardId)).toEqual(["consult"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (d) no 'here' restriction on a targetless hidden spell ────────────────────────────────

  test("(d) Consult the Past chooses no targets and plays no units, so 811.1.d imposes nothing: the flip from bf1 asks for nothing and is legal with no unit of either side involved (811.2)", async () => {
    // bf1 holds only P1's guard; no enemy anywhere near — irrelevant for a targetless Draw 2.
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .facedown(P1, "bf1", CONSULT, "consult")
      .build();
    const opt = game.p1.option("reveal", "consult");
    expect(opt).toBeDefined();
    expect(opt?.fields ?? []).toEqual([]); // nothing to choose
    const hand = game.p1.hand().length;
    await game.p1.reveal("consult");
    expect(game.decision()?.kind).toBe("action"); // no pick prompt was raised
    await game.settle();
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 2);
  });
});
