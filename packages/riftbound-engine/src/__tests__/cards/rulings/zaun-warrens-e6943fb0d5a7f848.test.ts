/**
 * Ruling e6943fb0d5a7f848 — Zaun Warrens (OGN-298 → ogn-298-298) Battlefield "When you conquer here, discard 1, then draw 1."
 *   × Kennen, Storm of Shuriken (VEN-113 → ven-113-166) · 4 Might "When you play me, [Burn 2]. When I conquer, give a spell
 *     in your trash [Flow] equal to its cost this turn."
 *
 * Q: Conquering Zaun Warrens with Kennen — can I order the triggers so Zaun discards a spell first and Kennen then gives
 *    THAT spell Flow?
 * A: No. Both conquer triggers go on the chain together and you may order them freely, but Kennen's target (a spell in
 *    your trash) is locked at FINALIZATION, before Zaun Warrens has resolved — the spell you are about to discard is not in
 *    the trash yet. With no other spell in the trash Kennen's trigger is removed with no effect; with an older spell there,
 *    Kennen can only target that one.
 * Rules: 383.3 / 383.4.c (simultaneous conquer triggers), 383.3.d (controller orders), 402.1–402.4 (targets chosen when the
 *        triggered item is finalized; no legal target ⇒ removed), 829 (Flow).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, OrderDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";
const KENNEN = "ven-113-166";
const CLEAVE = "ogn-004-298"; // the spell in HAND that Zaun Warrens will discard ([1][fury] Action)
const VOID_SEEKER = "ogn-024-298"; // an OLDER spell already in the trash ([3][fury] Action)

/**
 * P1's turn. Zaun Warrens (live) is empty and uncontrolled. P1: Kennen (4) + a 2-Might Ally in base, hand = Cleave only,
 * plenty of resources to Flow-cast either spell afterwards. `oldSpell` seeds Void Seeker into P1's trash.
 */
function board(oldSpell: boolean) {
  const b = scenario()
    .resources(P1, { energy: 5, power: { fury: 2 } })
    .battlefield("zw", { controller: null, def: ZAUN_WARRENS, inert: false, owner: P2 })
    .unit(P1, "base", KENNEN, "kennen")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
    .hand(P1, CLEAVE, "cleave");
  return oldSpell ? b.trash(P1, VOID_SEEKER, "oldSpell") : b;
}

/** Kennen walks onto the empty Warrens; both pass Focus → P1 conquers; stop at the first post-conquer decision. */
async function kennenConquers(oldSpell: boolean): Promise<Game> {
  const game = await board(oldSpell).build();
  await game.p1.move("kennen", "zw");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.zw?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game;
}

/** Answer the 383.3.d offer putting Zaun Warrens on TOP (resolves first) — the questioner's plan. */
async function orderZaunOnTop(game: Game): Promise<void> {
  const d = game.decision() as OrderDecision;
  expect(d).toMatchObject({ kind: "order", seat: P1 });
  const keys = d.items.map((it) => it.key);
  const zaunKey = d.items.find((it) => it.card === "zw")?.key as string;
  expect(zaunKey).toBeDefined();
  await game.p1.order([...keys.filter((k) => k !== zaunKey), zaunKey]);
}

/** Pass priority round / answer the Zaun discard with Cleave until the main phase is open again. */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) break;
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.some((o) => (o.card ?? o.key) === "cleave") ? "cleave" : (d.options[0]?.key as string));
    } else if (d.kind === "order") {
      await orderZaunOnTop(game);
    } else {
      break;
    }
  }
}

const flowOffered = (game: Game, card: string) =>
  game.p1.option("cast", card)?.fields.find((f) => f.arg === "flow")?.options?.includes(true) ?? false;

describe("Ruling e6943fb0d5a7f848 — Kennen can't give Flow to the spell Zaun Warrens is about to discard", () => {
  test("steps 1–2 (older spell in trash): both 'when you conquer' triggers hit the chain at once, Kennen's target is ALREADY locked to the only spell then in the trash, and P1 is offered their order", async () => {
    const game = await kennenConquers(true);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect((d as OrderDecision).items.map((it) => it.card).sort()).toEqual(["kennen", "zw"]);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "kennen", controller: P1, targets: ["oldSpell"], triggered: true }),
      expect.objectContaining({ cardId: "zw", controller: P1, triggered: true }),
    ]);
    expect(game.zoneOf("cleave")).toBe("hand"); // not in the trash at finalization time
  });

  test("steps 3–4 (older spell in trash): even with Zaun Warrens ordered on top — Cleave is discarded first — Kennen still resolves on its locked target: Void Seeker gets Flow, the freshly discarded Cleave does not", async () => {
    const game = await kennenConquers(true);
    await orderZaunOnTop(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kennen", "zw"]);
    // Zaun resolves first: discard Cleave, draw 1.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("cleave");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kennen", targets: ["oldSpell"] })]); // unchanged
    await drain(game);
    expect(game.chain()).toEqual([]);
    // Flow landed on the OLD spell only.
    expect(flowOffered(game, "oldSpell")).toBe(true);
    expect(game.p1.can("cast", "cleave")).toBe(false);
    expect(flowOffered(game, "cleave")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // 402.3/402.4: with NO spell in the trash when the conquer triggers are finalized, Kennen's item has no legal target and is
  // removed from the chain — only the Zaun Warrens item remains, and the Cleave it later discards never receives Flow.
  test("no older spell in trash — Kennen's target-less trigger is removed at finalization; the Cleave discarded afterwards never gets Flow", async () => {
    const game = await kennenConquers(false);
    // No order offer is even needed once Kennen's item is gone; tolerate one if the engine raises it.
    if (game.decision()?.kind === "order") {
      await orderZaunOnTop(game);
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["zw"]);
    await drain(game);
    expect(game.zoneOf("cleave")).toBe("trash"); // Zaun Warrens did discard it (and drew 1)
    expect(game.p1.can("cast", "cleave")).toBe(false); // …but nothing gave it Flow
    expect(flowOffered(game, "cleave")).toBe(false);
  });

  test("(no older spell) what does happen: Zaun Warrens discards Cleave and draws 1; the conquer scored 1 point", async () => {
    const game = await kennenConquers(false);
    const deckBefore = game.p1.deck().length;
    await drain(game);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1); // Cleave out, one card drawn
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.p1.points()).toBe(1);
  });
});
