/**
 * Ruling 8d1325794772efd7 — Lucian, Gunslinger (SFD-028 → sfd-028-221, 2 Might [Assault]: "When I attack, deal damage
 *   equal to my [Assault] to an enemy unit here.") × Reaver's Row (OGN-285 → ogn-285-298: "When you defend here, you may
 *   move a friendly unit here to base.") × Overzealous Fan (SFD-128 → sfd-128-221, 2 Might: "When I defend, you may
 *   kill me to move an attacking unit to its base.")
 *
 * Q: Opponent attacks my Reaver's Row (Fan defending) with Lucian. In what order do the triggers resolve, and can I
 *    retreat/bounce with Fan before killing him to bounce Lucian?
 * A: Lucian's attack trigger goes on the chain first; the defender's Row and Fan triggers go on after it in the order
 *    their controller chooses; LIFO resolution. Fan always puts its trigger on the chain and the kill is decided on
 *    RESOLUTION, so you may retreat Fan (Row) and then still kill him to bounce Lucian. A trigger already on the chain
 *    resolves normally even if its condition (Fan being a defender) is gone.
 * Rules: 383.4.e/f + 383.5 (attacker's triggers before defender's), 383.3.d (controller orders), 332 (LIFO),
 *        359 (chain items resolve independently of their source's state).
 * RULING-CONFLICT on the Fan nuance: pre-Unleashed. CR 204.3.a (its own example is Overzealous Fan: "In order to finalize the
 *    ability to the chain, its controller must kill Overzealous Fan"), 383.3.a/.b, 404.1 ⇒ the kill is the FINALIZATION cost,
 *    paid before either defender trigger resolves — so "retreat the Fan with the Row, THEN kill him" is impossible: once P1
 *    opts in the Fan is in the trash and is no longer "a friendly unit here" for the Row to name (402.2). Unleashed-era
 *    rulings 347a9365bc85ec43 / a6a4e61cf7a5ceee agree. Engine follows the CR (facet rewritten below).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LUCIAN = "sfd-028-221";
const REAVERS_ROW = "ogn-285-298";
const OVERZEALOUS_FAN = "sfd-128-221";

/** P2's turn. P1 holds the live Reaver's Row with Overzealous Fan (2) + Big (4); P2's Lucian (2, Assault) attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", OVERZEALOUS_FAN, "fan")
    .unit(P1, "row", { might: 4, name: "Big" }, "big")
    .unit(P2, "base", LUCIAN, "lucian");
}

/** Lucian attacks; P2 aims his trigger at Big. Returns with P1's first finalization prompt pending. */
async function lucianAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("lucian", "row");
  expect(game.state("lucian").combatRole).toBe("attacker");
  expect(game.state("fan").combatRole).toBe("defender");
  // Lucian's trigger is the FIRST (bottom) chain item; its target is chosen by P2 at finalization.
  expect(game.chain()[0]).toMatchObject({ cardId: "lucian", controller: P2, triggered: true });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "lucian" } });
  await game.p2.pick("big");
  return game;
}

describe("Ruling 8d1325794772efd7 — Lucian's attack trigger first, then the defender's Row + Fan triggers (controller's order); LIFO", () => {
  test("chain placement: Lucian (P2) at the bottom, then P1's Fan and Row triggers above it — and P1 is offered the ORDER of its two simultaneous triggers", async () => {
    const game = await lucianAttacks();
    let sawOrder = false;
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes(); // accept both "you may" triggers
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("big"); // Row: retreat Big
      } else if (d?.kind === "order") {
        expect(d).toMatchObject({ kind: "order", seat: P1 });
        expect(d.items.map((it) => it.card).sort()).toEqual(["fan", "row"]);
        sawOrder = true;
        await game.p1.order([d.items.find((it) => it.card === "fan")?.key as string, d.items.find((it) => it.card === "row")?.key as string]);
      } else {
        break;
      }
    }
    expect(sawOrder).toBe(true);
    const chain = game.chain();
    expect(chain.map((c) => `${c.cardId}/${c.controller}`)).toEqual([`lucian/${P2}`, `fan/${P1}`, `row/${P1}`]);
    expect(chain.every((c) => c.triggered)).toBe(true);
  });

  test("LIFO with Fan declined: Row (top) resolves first (Small → base), and only then Lucian's bottom trigger deals his [Assault] (1) to Big", async () => {
    const game = await board().unit(P1, "row", { might: 1, name: "Small" }, "small").build();
    await game.p2.move("lucian", "row");
    await game.p2.pick("big");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "fan") {
        await game.p1.no(); // "you may" — declined on this line
      } else if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("small");
      } else if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    const ids = game.chain().map((c) => c.cardId);
    expect(ids[0]).toBe("lucian");
    expect(ids.at(-1)).toBe("row");
    expect(game.state("big").damage).toBe(0);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("small")).toBe("base"); // Row resolved first
    while (game.chain().length > 1) {
      await game.acting().passPriority();
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["lucian"]);
    expect(game.state("big").damage).toBe(0); // Lucian's is last
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("big").damage).toBe(1);
    expect(game.zoneOf("fan")).toBe("battlefield-row"); // declined → Fan lives
  });

  test("LIFO with Fan accepted: Fan's trigger bounces Lucian to base BEFORE Lucian's own trigger resolves; Lucian's trigger nevertheless stays on the chain and resolves normally (not removed/countered) although he no longer attacks", async () => {
    const game = await lucianAttacks();
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "row") {
        await game.p1.no();
      } else if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes(); // kill Fan to bounce an attacker
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("lucian");
      } else if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    while (game.chain().length > 1) {
      await game.acting().passPriority();
      await game.acting().passPriority();
    }
    expect(game.locationOf("lucian")).toBe("base");
    expect(game.state("lucian").combatRole).not.toBe("attacker");
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", countered: false, triggered: true })]); // still pending
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // and it gets its normal resolution window
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("big")).toBe("row");
  });

  // RULING-CONFLICT (see header): CR 204.3.a / 383.3.b.1 / 404.1 — accepting the Fan's opt-in KILLS it at finalization,
  // so by the time the Row's trigger names "a friendly unit here" the Fan is no longer a candidate; the ruling's
  // "retreat the Fan, then kill him" line cannot happen. Lucian is still bounced when the Fan's item resolves.
  test("CR 204.3.a (contra ruling 8d1325794772efd7) — the Fan dies the moment P1 opts in (finalization cost), so Reaver's Row can only retreat Big; the Fan's item then bounces Lucian on resolution", async () => {
    const game = await lucianAttacks();
    // First P1 prompt is the Fan's opt-in (timing FIN): accepting it kills the Fan NOW.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fan" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.zoneOf("fan")).toBe("trash");
    // The Fan's target: the lone attacker (Lucian) is bound with or without asking.
    if (game.decision()?.kind === "pick" && game.decision()?.source?.cardId === "fan") {
      await game.p1.pick("lucian");
    }
    // Row's opt-in + target: only Big is "a friendly unit here" now — the Fan is gone.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
    await game.p1.yes();
    const pick = game.decision();
    if (pick?.kind === "pick" && pick.source?.cardId === "row") {
      expect(pick.options.map((o) => o.card ?? o.key)).toEqual(["big"]);
      await game.p1.pick("big");
    }
    expect(game.chain().find((c) => c.cardId === "row")).toMatchObject({ targets: ["big"] });
    expect(game.chain().find((c) => c.cardId === "fan")).toMatchObject({ targets: ["lucian"] });
    await game.acceptTriggerOrder();
    // Resolve both defender triggers (LIFO): Big retreats, Lucian is bounced — nothing further is asked about the Fan.
    for (let i = 0; i < 8 && game.chain().length > 1; i++) {
      const d = game.decision();
      expect(d?.kind === "yes-no" && d.source?.cardId === "fan").toBe(false);
      await game.acting().passPriority();
    }
    expect(game.locationOf("big")).toBe("base");
    expect(game.locationOf("lucian")).toBe("base");
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", triggered: true })]);
  });
});
