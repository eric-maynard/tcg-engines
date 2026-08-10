/**
 * Interaction: Blade Dancer (sfd-195-221, Legend · Irelia)
 *     "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it. …"
 *   × Irelia, Fervent (sfd-057-221, 4 Might) "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *   × Discipline (ogn-058-298, Reaction · 2) "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Rules: 383.4.b.2 (targeting triggers go on the chain right after the targeting spell is finalized,
 * above it), 383.3.d (same-controller simultaneous triggers: controller orders them), 383.3.b /
 * 383.3.b.1 (a leading "you may [cost] to …" is the trigger's base cost, paid to FINALIZE it),
 * 414.4 / 414.1.b (an exhaust cost cannot be paid by an already-exhausted object), 415.1.b / 415.1.c
 * (readying a ready unit does nothing — no Ready event).
 *
 * Q (a) Legend READY, Irelia EXHAUSTED at bf1; Discipline on Irelia, accept Blade Dancer → triggers,
 *       order, final Might / ready state?
 *   (b) Same turn, second Discipline on Irelia (legend now exhausted, Irelia ready): is the Blade
 *       Dancer payment even offered? Might gained?
 *   (c) Fresh: legend READY, Irelia already READY; pay Blade Dancer anyway — legal? 'ready me' +1?
 * Expected: (a) chain [Discipline, BD-trigger, Irelia-choose]; cost paid at finalization (legend
 * exhausted, 1 power); BD readies Irelia → real Ready event → 'ready me' +1; Discipline last: 4+1+1+2
 * = 8, Irelia READY, legend EXHAUSTED. (b) choose +1 → 9, Discipline → 11, draw 1; BD cannot be
 * finalized (exhaust cost unpayable) → no prompt/payment, no ready, no extra +1. (c) Legal; readying a
 * ready unit is a no-op → no Ready trigger: 4+1+2 = 7, legend exhausted for nothing.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const BLADE_DANCER = "sfd-195-221";
const IRELIA = "sfd-057-221";
const DISCIPLINE = "ogn-058-298";

function board(opts: { legendExhausted?: boolean; ireliaExhausted?: boolean } = {}) {
  const ireliaExhausted = opts.ireliaExhausted ?? true;
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 2 } }) // two Disciplines + spare power for Blade Dancer
    .battlefield("bf1", { controller: P1 })
    .card("bd", { def: BLADE_DANCER, meta: opts.legendExhausted ? { exhausted: true } : undefined, owner: P1, zone: "legendZone" })
    .unit(P1, "bf1", IRELIA, "ire", ireliaExhausted ? { exhausted: true } : undefined)
    .hand(P1, DISCIPLINE, "d1")
    .hand(P1, DISCIPLINE, "d2");
}

const isBdOptIn = (d: Decision | null): boolean => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "bd";

/**
 * Drain the chain: accept Blade Dancer's opt-in when acceptable (decline otherwise), keep the listed
 * trigger order, pass priority. Returns how many ACCEPTABLE Blade Dancer offers were seen.
 */
async function drain(game: Game): Promise<number> {
  let acceptableOffers = 0;
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (isBdOptIn(d)) {
      if (d.kind === "yes-no" && d.canAccept !== false) {
        acceptableOffers += 1;
        await game.p1.yes();
      } else {
        await game.p1.no();
      }
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return acceptableOffers;
}

describe("Blade Dancer × Irelia, Fervent × Discipline — exhaust cost and ready no-op", () => {
  // ---------------------------------------------------------------- (a)
  test("(a) finalizing Discipline on Irelia puts TWO targeting triggers above it (383.4.b.2): Irelia's 'choose me' and Blade Dancer's", async () => {
    const game = await board().build();
    await game.p1.cast("d1", { targets: "ire" });
    const chain = game.chain();
    expect(chain[0]).toMatchObject({ cardId: "d1", triggered: false }); // the spell is the bottom item
    expect(chain.slice(1).map((c) => c.cardId).sort()).toEqual(["bd", "ire"]);
    expect(chain.slice(1).every((c) => c.triggered)).toBe(true);
    expect(game.p1.energy()).toBe(2); // Discipline paid
  });

  test("(a) Blade Dancer's 'exhaust me and pay [rainbow]' is paid at FINALIZATION (383.3.b.1): legend ready→exhausted and 1 power spent before anything resolves", async () => {
    const game = await board().build();
    await game.p1.cast("d1", { targets: "ire" });
    expect(isBdOptIn(game.decision())).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    expect(game.state("bd").isReady).toBe(true);
    await game.p1.yes();
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(1);
    // nothing has resolved yet: Irelia still exhausted at printed Might, all three items still on the chain
    expect(game.state("ire")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.chain()).toHaveLength(3);
  });

  test("(a) both triggers are P1's and simultaneous → P1 is offered to order them (383.3.d)", async () => {
    const game = await board().build();
    await game.p1.cast("d1", { targets: "ire" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    if (d?.kind === "order") {
      expect(d.items.map((i) => i.card).sort()).toEqual(["bd", "ire"]);
    }
  });

  test("(a) Blade Dancer resolving readies the exhausted Irelia — a real Ready event → her 'ready me' trigger goes on the chain (+1)", async () => {
    const game = await board().build();
    await game.p1.cast("d1", { targets: "ire" });
    await game.p1.yes();
    await game.acceptTriggerOrder(); // listed order: bd below, ire (choose) on top
    // resolve Irelia's choose trigger (+1 → 5)
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ire")).toMatchObject({ isExhausted: true, might: 5 });
    // resolve Blade Dancer → Irelia readied → new 'ready me' trigger above Discipline
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ire").isReady).toBe(true);
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual([
      ["d1", false],
      ["ire", true],
    ]);
  });

  test("(a) final: Irelia READY at 4 +1 (choose) +1 (ready) +2 (Discipline) = 8; legend EXHAUSTED; Discipline drew 1", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length; // d1, d2
    await game.p1.cast("d1", { targets: "ire" });
    const offers = await drain(game);
    expect(offers).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.state("ire")).toMatchObject({ isReady: true, might: 8 });
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (b)
  test("(b) second Discipline the same turn (legend exhausted): Blade Dancer's exhaust cost is unpayable (414.4) → the trigger is never finalized — no acceptable offer, no payment", async () => {
    const game = await board().build();
    await game.p1.cast("d1", { targets: "ire" });
    await drain(game);
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.state("ire")).toMatchObject({ isReady: true, might: 8 });

    await game.p1.cast("d2", { targets: "ire" });
    // Only Irelia's choose trigger joins the spell; no Blade Dancer item, no acceptable yes/no.
    expect(game.chain().map((c) => c.cardId)).not.toContain("bd");
    const d = game.decision();
    if (isBdOptIn(d)) {
      expect(d).toMatchObject({ canAccept: false });
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    }
    const offers = await drain(game);
    expect(offers).toBe(0);
    expect(game.p1.power("rainbow")).toBe(1); // untouched
    expect(game.state("bd").isExhausted).toBe(true);
  });

  test("(b) second Discipline: choose +1 → 9, Discipline +2 → 11 (no 'ready me' +1), Irelia stays ready, another card drawn", async () => {
    const game = await board().build();
    await game.p1.cast("d1", { targets: "ire" });
    await drain(game);
    const handBefore = game.p1.hand().length;
    await game.p1.cast("d2", { targets: "ire" });
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual([
      ["d2", false],
      ["ire", true],
    ]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ire").might).toBe(9);
    await drain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("ire")).toMatchObject({ isReady: true, might: 11 });
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (c)
  test("(c) legend READY, Irelia already READY: paying Blade Dancer's cost is LEGAL (canAccept) — legend exhausts, 1 power spent", async () => {
    const game = await board({ ireliaExhausted: false }).build();
    expect(game.state("ire").isReady).toBe(true);
    await game.p1.cast("d1", { targets: "ire" });
    expect(isBdOptIn(game.decision())).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    await game.p1.yes();
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["bd", "d1", "ire"]);
  });

  test("(c) readying an already-ready Irelia does nothing (415.1.b/c) → NO 'ready me' trigger: after Blade Dancer resolves only Discipline remains", async () => {
    const game = await board({ ireliaExhausted: false }).build();
    await game.p1.cast("d1", { targets: "ire" });
    await game.p1.yes();
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Irelia choose → 5
    expect(game.state("ire").might).toBe(5);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Blade Dancer → ready no-op
    expect(game.chain().map((c) => c.cardId)).toEqual(["d1"]); // no new Irelia trigger
    expect(game.state("ire")).toMatchObject({ isReady: true, might: 5 });
  });

  test("(c) final: Irelia 4 +1 (choose) +2 (Discipline) = 7 and ready; legend ends exhausted for nothing", async () => {
    const game = await board({ ireliaExhausted: false }).build();
    await game.p1.cast("d1", { targets: "ire" });
    const offers = await drain(game);
    expect(offers).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.state("ire")).toMatchObject({ isReady: true, might: 7 });
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(game.violations()).toEqual([]);
  });
});
