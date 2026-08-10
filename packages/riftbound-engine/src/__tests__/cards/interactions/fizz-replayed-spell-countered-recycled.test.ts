/**
 * Interaction: Fizz, Trickster (sfd-140-221, 3+[chaos])
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3],
 *      ignoring its Energy cost. Recycle that spell after you play it. (You must still pay its Power cost.)"
 *   × Void Seeker (ogn-024-298, 3+[fury]) "Deal 4 to a unit at a battlefield. Draw 1."  — replayed from trash
 *   × Defy (ogn-045-298, 1+[calm]) "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Abandon (unl-131-219, 2) "Counter a spell. Return it to its owner's hand instead of putting it in
 *      their trash. [Predict]."
 *
 * Question: when the Fizz-replayed Void Seeker is countered, where does it end up — trash (425.1.a.1),
 * bottom of the main deck (Fizz's "Recycle that spell after you play it"), hand (Abandon) or banishment?
 *
 * Rules: 206 (Defy reads the PRINTED cost — 3 ≤ 4, one Power ≤ [rainbow] — not what was paid),
 * 425.1.a / .a.1 / .c (countered: does nothing, default destination trash, costs not refunded),
 * 390.3.a ("then recycle it" on a linked play = DELAYED REPLACEMENT: if it would leave the chain after
 * being finalized other than by its own execution, recycle it instead), 419.4.b (non-triggered checks
 * key off Finalized), 367 / 372 (two replacements on one event: the affected card's owner orders them —
 * either order ends recycled), 416.1 (recycle = bottom of Main Deck), 829.1.b.1 (same construction as
 * Flow's "then banish it"), 340.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const VOID_SEEKER = "ogn-024-298";
const DEFY = "ogn-045-298";
const ABANDON = "unl-131-219";
const SKULKER = "ogn-175-298"; // vanilla deck filler with known aliases

/** P1: exactly Fizz's 3+[chaos] plus the [fury] Void Seeker still needs; P2: 3 energy + [calm] and both counters. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1, fury: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "X" }, "x")
    .trash(P1, VOID_SEEKER, "vs")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"])
    .deck(P2, [SKULKER, SKULKER], ["e1", "e2"])
    .hand(P1, FIZZ, "fizz")
    .hand(P2, DEFY, "defy")
    .hand(P2, ABANDON, "abandon");
}

/**
 * Play Fizz, accept the trigger (Void Seeker is the only eligible spell and X the only unit at a
 * battlefield, so both bind without asking), let the trigger resolve, and stop with Void Seeker on the
 * chain and P2 holding priority.
 */
async function replayVoidSeekerToP2Priority(game: Game): Promise<void> {
  await game.p1.play("fizz");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.key);
      await game.p1.pick(keys.includes("vs") ? "vs" : "x");
      continue;
    }
    if (d?.kind === "action" && d.context === "chain") {
      if (d.seat === P2 && game.chain().some((c) => c.cardId === "vs")) {
        return;
      }
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  throw new Error(`did not reach P2's priority on Void Seeker: ${JSON.stringify(game.decision()?.prompt)}`);
}

/** Pass priority around (answering a 372 replacement-order prompt for P1 either way) until the chain is empty or a non-chain prompt appears. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "replacement-order") {
      await game.p1.pick(d.options[0]!.key); // either order ends recycled (see header)
    } else if (d?.kind === "order" && d.seat === P1) {
      await game.p1.order(d.items.map((o) => o.key));
    } else {
      return;
    }
  }
}

describe("Fizz-replayed Void Seeker × Defy / Abandon — where does the countered spell go?", () => {
  test("setup: Fizz's trigger plays Void Seeker from the trash for 0 energy + [fury]; it is a finalized chain item targeting X and P2 has priority with both counters listed", async () => {
    const game = await board().build();
    await replayVoidSeekerToP2Priority(game);
    expect(game.zoneOf("vs")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vs", controller: P1, targets: ["x"], triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } }); // 3+chaos for Fizz, fury for Void Seeker, no energy for it
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(game.p2.can("cast", "abandon")).toBe(true);
  });

  test("(a) Defy is LEGAL against the replayed Void Seeker — it reads the printed 3+[fury] (206), not the 0 energy actually paid", async () => {
    const game = await board().build();
    await replayVoidSeekerToP2Priority(game);
    const field = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toEqual(["vs"]);
    await game.p2.cast("defy", { targets: "vs" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "defy"]);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 0 } });
  });

  test("(a) Defy resolves first and counters it: no damage, no draw, [fury] NOT refunded (425.1.c), Fizz unaffected in base, Defy to P2's trash", async () => {
    const game = await board().build();
    await replayVoidSeekerToP2Priority(game);
    await game.p2.cast("defy", { targets: "vs" });
    await drainChain(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("x").damage).toBe(0);
    expect(game.p1.hand()).toEqual([]); // no draw
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.state("fizz")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) countered by Defy, the Fizz-replayed Void Seeker must be RECYCLED to the bottom of P1's main deck (390.3.a delayed replacement on leaving the chain), not trashed", async () => {
    // Expected (CR 390.3.a / 829.1.b.1 analogue): "Recycle that spell after you play it" replaces ANY
    // departure from the chain after finalization that its own execution did not instruct — being
    // countered included — so Void Seeker goes to the bottom of the Main Deck (416.1).
    // Actual: the engine applies 425.1.a.1 literally and puts it in P1's trash (it does recycle it when
    // the counter is Abandon or when it resolves — see below — so only the plain-counter path is off).
    const game = await board().build();
    await replayVoidSeekerToP2Priority(game);
    await game.p2.cast("defy", { targets: "vs" });
    await drainChain(game);
    await game.settle();
    expect(game.p1.trash()).not.toContain("vs");
    expect(game.p1.hand()).not.toContain("vs");
    expect(game.p1.banishment()).not.toContain("vs");
    expect(game.zoneOf("vs")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("vs");
  });

  test("(b) Abandon counters it: two replacements on the leave-the-chain event, either order ends with Void Seeker RECYCLED (bottom of P1's deck) — not in hand, not in trash; no damage, no draw, [fury] spent", async () => {
    const game = await board().build();
    await replayVoidSeekerToP2Priority(game);
    expect((game.p2.option("cast", "abandon")?.fields.find((f) => f.name === "targets")?.options ?? []).flat()).toEqual(["vs"]);
    await game.p2.cast("abandon", { targets: "vs" });
    expect(game.p2.energy()).toBe(1);
    await drainChain(game);
    // P2's Predict is still performed (independent instruction): look at e1, may recycle it.
    const predict = game.decision();
    expect(predict).toMatchObject({ kind: "pick", seat: P2 });
    expect(predict?.kind === "pick" ? predict.options.map((o) => o.key) : []).toEqual(["e1"]);
    await game.p2.pick("e1"); // recycle it
    await game.settle();
    expect(game.p2.deck().at(-1)).toBe("e1");
    expect(game.p2.deck()[0]).toBe("e2");
    // Void Seeker: recycled, whatever the order.
    expect(game.zoneOf("vs")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("vs");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.state("x").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    expect(game.zoneOf("abandon")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) nobody responds: Void Seeker resolves — 4 to X, P1 draws 1 — and is then recycled to the bottom of the deck, not trashed", async () => {
    const game = await board().build();
    await replayVoidSeekerToP2Priority(game);
    await game.settle();
    expect(game.state("x").damage).toBe(4);
    expect(game.zoneOf("x")).toBe("battlefield-bf1"); // 4 < 5
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("vs")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("vs");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(d) control: the same Void Seeker cast normally from HAND and Defied goes to P1's trash (plain 425.1.a.1); 3+[fury] not refunded, no damage, no draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "X" }, "x")
      .deck(P1, [SKULKER, SKULKER], ["d1", "d2"])
      .hand(P1, VOID_SEEKER, "vs")
      .hand(P2, DEFY, "defy")
      .build();
    await game.p1.cast("vs", { targets: "x" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "vs" });
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    expect(game.p1.deck()).not.toContain("vs");
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("x").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("defy")).toBe("trash");
  });
});
