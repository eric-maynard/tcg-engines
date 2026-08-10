/**
 * Ruling 00ba7debf3119658 — Blade Dancer (SFD-195 → sfd-195-221, Legend · Irelia)
 *   "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it. …"
 *   × En Garde (ogn-046-298, Reaction) "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might]
 *     this turn if it is the only unit you control there."
 *   × Irelia, Fervent (sfd-057-221, 4 Might) "[Deflect] When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: Mid-showdown, can Blade Dancer's "ready it when chosen" ready Irelia after I choose her with En Garde?
 * A: Yes. En Garde is a Reaction (legal in a showdown); choosing Irelia triggers both her "+1 when chosen" and
 *    Blade Dancer. LIFO: Blade Dancer resolves (pay → ready Irelia) → her "when you ready me" +1 → her "when
 *    chosen" +1 → En Garde +1 (+1 more if alone). Blade Dancer itself does not "choose" her. She must be
 *    exhausted for the ready (and its +1) to happen (415.1.b).
 * Rules: 343.1 + Reaction timing, 340.1 (LIFO), 355.10.d, 415.1.b.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLADE_DANCER = "sfd-195-221";
const EN_GARDE = "ogn-046-298";
const IRELIA = "sfd-057-221";

/**
 * P2's turn. P1 holds bf1 with Irelia alone there (exhausted unless told otherwise); Blade Dancer is P1's legend.
 * P1 has En Garde and exactly [1] + 1 rainbow. P2's 3-Might Raider walks into bf1 → combat showdown.
 */
function board(opts: { ireliaExhausted: boolean }) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .legend(P1, BLADE_DANCER, "bd")
    .unit(P1, "bf1", IRELIA, "irelia", opts.ireliaExhausted ? { exhausted: true } : undefined)
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, EN_GARDE, "engarde");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

function isBladeDancerOptIn(d: Decision | null): boolean {
  if (!d || d.seat !== P1) {
    return false;
  }
  if (d.kind === "yes-no") {
    return d.source?.cardId === "bd" || /Blade Dancer/i.test(d.prompt);
  }
  return d.kind === "pick" && d.allowDecline && (d.source?.cardId === "bd" || /Blade Dancer/i.test(d.prompt));
}

/** P2 attacks bf1 and passes Focus; P1 (now with Focus) plays En Garde choosing Irelia. */
async function enGardeMidShowdown(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.chain()).toEqual([]); // vanilla attacker / no defend triggers
  expect(game.actingSeat()).toBe(P2); // attacker holds Focus first
  await game.p2.pass();
  expect(game.actingSeat()).toBe(P1);
  expect(game.p1.can("cast", "engarde")).toBe(true);
  await game.p1.cast("engarde", { targets: "irelia" });
}

/** Drain the chain, accepting Blade Dancer's offer whenever it appears; returns how many times it was offered. */
async function drainAcceptingBladeDancer(game: Game): Promise<number> {
  let offers = 0;
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (isBladeDancerOptIn(d)) {
      offers += 1;
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick") {
        await game.p1.pick(d.options[0]?.key as string);
      }
      continue;
    }
    if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
      continue;
    }
    if (d.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).passPriority();
      continue;
    }
    if (d.kind === "pick" && d.options.length === 1 && d.min === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
      continue;
    }
    break; // showdown focus / anything else → stop
  }
  return offers;
}

describe("Ruling 00ba7debf3119658 — Blade Dancer readies Irelia mid-showdown off En Garde's choice", () => {
  test("En Garde is a legal Reaction for P1 during the combat showdown; choosing Irelia puts her 'chosen' trigger on the chain and surfaces Blade Dancer's optional offer to P1", async () => {
    const game = await board({ ireliaExhausted: true }).build();
    await enGardeMidShowdown(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } }); // En Garde paid, rainbow not yet
    const ids = game.chain().map((c) => c.cardId);
    expect(ids[0]).toBe("engarde"); // the spell is the bottom item
    expect(game.chain().some((c) => c.cardId === "irelia" && c.triggered)).toBe(true);
    // Blade Dancer's "you may exhaust me and pay [rainbow]" is P1's decision (now or once its item is reached).
    let offered = isBladeDancerOptIn(game.decision());
    for (let i = 0; i < 6 && !offered; i++) {
      const d = game.decision();
      if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
      offered = isBladeDancerOptIn(game.decision());
    }
    expect(offered).toBe(true);
    expect(game.decision()?.seat).toBe(P1);
    expect(showdown(game)?.active).toBe(true); // still mid-showdown
  });

  test("YES: Blade Dancer exhausts + [rainbow] paid, exhausted Irelia is READIED; she ends 4 +1 (readied) +1 (chosen by En Garde) +2 (En Garde, alone there) = 8, and the showdown is still open", async () => {
    const game = await board({ ireliaExhausted: true }).build();
    await enGardeMidShowdown(game);
    const offers = await drainAcceptingBladeDancer(game);
    expect(offers).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("irelia").might).toBe(8);
    expect(game.zoneOf("engarde")).toBe("trash");
    // Combat has not resolved yet — we are back in the showdown with Focus.
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown" });
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("nuance (415.1.b): if Irelia is already READY, Blade Dancer may still be paid for but readies nothing → no 'readied' +1: she ends 4 +1 (chosen) +2 (En Garde) = 7", async () => {
    const game = await board({ ireliaExhausted: false }).build();
    await enGardeMidShowdown(game);
    const offers = await drainAcceptingBladeDancer(game);
    expect(offers).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("irelia").might).toBe(7);
  });

  test("after the chain empties the combat still resolves normally: 8-Might Irelia kills the 3-Might Raider and P1 keeps bf1", async () => {
    const game = await board({ ireliaExhausted: true }).build();
    await enGardeMidShowdown(game);
    await drainAcceptingBladeDancer(game);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("irelia")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
