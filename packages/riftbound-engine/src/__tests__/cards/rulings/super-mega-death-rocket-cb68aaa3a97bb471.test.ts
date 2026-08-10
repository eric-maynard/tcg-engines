/**
 * Ruling cb68aaa3a97bb471 — Super Mega Death Rocket! (OGN-252 → ogn-252-298) · Action [4] "Deal 5 to a unit. When you conquer,
 *   you may discard 1 to return this from your trash to your hand."
 *   × Jinx, Rebel (OGN-202 → ogn-202-298) · 5 Might "When you discard one or more cards, ready me and give me +1 [Might] this turn."
 *
 * Q: Can you loop SMDR's conquer trigger by discarding further copies after the first one resolves?
 * A: No. You conquered once, so each SMDR in the trash triggers once, at that moment. Copies that reach the trash later (e.g.
 *    discarded to pay) are past the window and need ANOTHER conquer. Nuance: copies already in the trash all trigger together
 *    and can be resolved one after another (Jinx: 1 card in hand + 3 SMDR in trash → chain all 3, pay each discard in turn).
 * Rules: 383.2 (conditions evaluated when the event happens), 385.2 (functions from the trash), 383.3.d (simultaneous triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMDR = "ogn-252-298";
const JINX_REBEL = "ogn-202-298";

/** P1's turn. Jinx, Rebel (5) conquers P2's bf1 (1-Might Speedbump). */
function base() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", JINX_REBEL, "jinx")
    .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "def");
}

async function conquer(game: Game): Promise<void> {
  await game.p1.move("jinx", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("def")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
}

/** Answer every P1 prompt greedily (yes / discard a hand card / listed order) and pass priorities until the open main phase. */
async function drain(game: Game): Promise<{ optIns: string[] }> {
  const optIns: string[] = [];
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no") {
      optIns.push(d.source?.cardId ?? "?");
      await game.seat(d.seat).answer(d.canAccept !== false);
    } else if (d.kind === "pick") {
      const hand = game.p1.hand();
      const o = d.options.find((x) => hand.includes((x.card ?? x.key) as string)) ?? d.options[0]!;
      await game.seat(d.seat).pick(o.card ?? o.key);
    } else if (d.kind === "order") {
      await game.seat(d.seat).order(d.items.map((it) => it.key));
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return { optIns };
}

describe("Ruling cb68aaa3a97bb471 — SMDR's conquer trigger happens once per conquer; no looping", () => {
  test("one SMDR in trash + a fodder card: the trigger fires once, fodder is discarded (Jinx readies, +1), SMDR returns — and the chain then EMPTIES with no further SMDR trigger", async () => {
    const game = await base().trash(P1, SMDR, "smdr").hand(P1, { might: 1, name: "Fodder" }, "fodder").build();
    await conquer(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["smdr"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "smdr" } });
    expect(game.state("jinx").isExhausted).toBe(true); // moved
    const { optIns } = await drain(game);
    expect(optIns).toEqual(["smdr"]); // asked exactly once
    expect(game.p1.hand()).toEqual(["smdr"]);
    expect(game.p1.trash()).toEqual(["fodder"]);
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 6 }); // one discard event
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toHaveLength(1); // only one conquer happened
    expect(game.violations()).toEqual([]);
  });

  test("no loop: an SMDR discarded from hand to pay the first one's cost lands in the trash AFTER the conquer — it never triggers, no second prompt, it stays in the trash", async () => {
    const game = await base().trash(P1, SMDR, "smdrTrash").hand(P1, SMDR, "smdrHand").build();
    await conquer(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["smdrTrash"]); // the hand copy is not a trigger source
    const { optIns } = await drain(game);
    expect(optIns.filter((s) => s === "smdrHand")).toEqual([]);
    expect(optIns).toEqual(["smdrTrash"]);
    expect(game.p1.hand()).toEqual(["smdrTrash"]);
    expect(game.p1.trash()).toEqual(["smdrHand"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("three SMDRs already in the trash at the conquer ALL trigger at that moment — three items on the chain at once", async () => {
    const game = await base()
      .trash(P1, SMDR, "A")
      .trash(P1, SMDR, "B")
      .trash(P1, SMDR, "C")
      .hand(P1, { might: 1, name: "Fodder" }, "fodder")
      .build();
    await conquer(game);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["A", "B", "C"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  // RULING-CONFLICT (nuance): riftjudge cb68aaa3a97bb471 / a32c9f9215131b03 (pre-Unleashed) have each SMDR's "you may discard 1"
  // paid as that item RESOLVES, so one card in hand can be cycled through all three. CR 383.3.a/.b, 204.3.a, 740.4.a.2: a leading
  // "you may [discard 1] TO [return this]" is the trigger's BASE COST, decided and paid while each item is FINALIZED (383.3.b.1) —
  // and all three are finalized as one batch before any resolves (383.3.d). With one card in hand only the first can be paid;
  // the other two are removed unpaid (404.2), never chain items. Engine follows the CR (jinx-rebel-a32c9f9215131b03.test.ts agrees).
  test("CR 383.3.b.1 / 404.2 (contra the ruling's nuance) — 3 trashed SMDRs, 1 card in hand: the discards are due at FINALIZATION, so exactly one is paid (Fodder → Jinx 6, ready), one SMDR returns, the other two items leave the chain unpaid", async () => {
    const game = await base()
      .trash(P1, SMDR, "A")
      .trash(P1, SMDR, "B")
      .trash(P1, SMDR, "C")
      .hand(P1, { might: 1, name: "Fodder" }, "fodder")
      .build();
    await conquer(game);
    const { optIns } = await drain(game);
    expect(optIns.length).toBeGreaterThanOrEqual(1); // the first is offered and payable; later ones may be shown unpayable or dropped
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.hand().every((c) => ["A", "B", "C"].includes(c))).toBe(true);
    expect(game.p1.trash().sort()).toEqual(["fodder", ...["A", "B", "C"].filter((c) => !game.p1.hand().includes(c))].sort()); // fodder + the two unpaid SMDRs
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 6 }); // ONE discard
    expect(game.chain()).toEqual([]);
  });
});
