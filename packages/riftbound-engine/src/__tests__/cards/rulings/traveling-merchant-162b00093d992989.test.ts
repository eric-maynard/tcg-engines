/**
 * Ruling 162b00093d992989 — Traveling Merchant (OGN-185 → ogn-185-298) "When I move, discard 1, then draw 1."
 *   × Flame Chompers (OGN-006 → ogn-006-298) "When you discard me, you may pay [fury] to play me."
 *
 * Q: Merchant moves to an OCCUPIED enemy battlefield. When does the discard/draw trigger resolve, and can the
 *    discarded Flame Chompers be played to that battlefield or to base?
 * A: The move trigger (and then Chompers' discard trigger) resolves BEFORE the showdown begins. Chompers cannot
 *    be played to the contested battlefield (P1 does not control it — a unit there is not control) but can be
 *    played to base (or another battlefield P1 controls). Only once the chain is empty does the showdown open.
 * Rules: 344 / 323.9 (staged showdown opens once the chain is empty), 383 (triggers), 341.2 (units are played
 *        to your base or a battlefield you CONTROL).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const FLAME_CHOMPERS = "ogn-006-298";

/**
 * P1's turn. bf1 is P2's with a 4-Might Guard on it (occupied). Optionally P1 also controls bf2 (empty).
 * P1: ready Merchant in base, hand = Chompers + Junk, exactly [fury] floating.
 */
function board(opts: { p1HasBf2: boolean }) {
  const s = scenario()
    .resources(P1, { power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard");
  if (opts.p1HasBf2) {
    s.battlefield("bf2", { controller: P1 });
  }
  return s
    .unit(P1, "base", MERCHANT, "merchant")
    .hand(P1, FLAME_CHOMPERS, "chompers")
    .hand(P1, { cardType: "unit", might: 1, name: "Junk" }, "junk")
    .build();
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Move → both pass → discard Chompers (draw 1) → Chompers trigger on the chain. */
async function moveAndDiscardChompers(game: Game): Promise<void> {
  await game.p1.move("merchant", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
  expect(showdown(game)?.active ?? false).toBe(false); // showdown NOT begun while the trigger is pending
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("chompers");
  expect(game.zoneOf("chompers")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "chompers", controller: P1, triggered: true })]);
  expect(showdown(game)?.active ?? false).toBe(false);
}

/** Drive the Chompers item: accept the [fury] payment; return the destination prompt if one is surfaced. */
async function acceptChompers(game: Game): Promise<Extract<Decision, { kind: "pick" }> | undefined> {
  let destination: Extract<Decision, { kind: "pick" }> | undefined;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
      continue;
    }
    if (d.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).passPriority();
      continue;
    }
    if (d.kind === "pick" && d.seat === P1 && game.zoneOf("chompers") !== "base" && !game.locationOf("chompers")) {
      destination = d;
      break;
    }
    break;
  }
  return destination;
}

const destKeys = (d: Extract<Decision, { kind: "pick" }>) =>
  d.options.flatMap((o) => [o.key, o.card, o.zone, o.label].filter((v): v is string => typeof v === "string"));

describe("Ruling 162b00093d992989 — Merchant into an occupied battlefield: triggers resolve before the showdown; Chompers goes to base, never to the contested battlefield", () => {
  test("the discard/draw trigger resolves (and Chompers' trigger is queued) while the combat showdown has NOT yet begun", async () => {
    const game = await board({ p1HasBf2: false });
    const deck0 = game.p1.deck().length;
    await moveAndDiscardChompers(game);
    expect(game.p1.hand()).toHaveLength(2); // junk + drawn card
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("P1 controls no battlefield: paying [fury] plays Chompers to BASE (bf1 is never offered), and only then does the combat showdown at bf1 open", async () => {
    const game = await board({ p1HasBf2: false });
    await moveAndDiscardChompers(game);
    const dest = await acceptChompers(game);
    if (dest) {
      // If a destination is asked at all, the contested bf1 must not be on the menu.
      expect(destKeys(dest)).not.toContain("bf1");
      expect(destKeys(dest)).not.toContain("battlefield-bf1");
      await game.p1.pick(dest.options.find((o) => /base/.test(`${o.key} ${o.zone ?? ""} ${o.label}`))?.key ?? (dest.options[0]?.key as string));
    }
    await acceptChompers(game); // drain any remaining passes
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.p1.power("fury")).toBe(0);
    expect(game.chain()).toEqual([]);
    // Chain empty → the showdown begins now (combat showdown at bf1, attacker P1 has Focus).
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.units("bf1")).toEqual(["merchant"]);
    expect(game.violations()).toEqual([]);
  });

  test("P1 also controls bf2: the destination menu offers base and bf2 but NOT the contested bf1 (having a unit there is not control)", async () => {
    const game = await board({ p1HasBf2: true });
    await moveAndDiscardChompers(game);
    const dest = await acceptChompers(game);
    expect(dest).toBeDefined();
    expect(dest?.seat).toBe(P1);
    const keys = destKeys(dest as Extract<Decision, { kind: "pick" }>);
    expect(keys.some((k) => /base/.test(k))).toBe(true);
    expect(keys.some((k) => k === "bf2" || k === "battlefield-bf2")).toBe(true);
    expect(keys).not.toContain("bf1");
    expect(keys).not.toContain("battlefield-bf1");
    await game.p1.pick("bf2");
    await acceptChompers(game);
    expect(game.locationOf("chompers")).toBe("bf2");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  });
});
