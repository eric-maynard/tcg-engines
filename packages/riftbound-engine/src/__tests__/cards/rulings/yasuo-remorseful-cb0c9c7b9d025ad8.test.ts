/**
 * Ruling cb0c9c7b9d025ad8 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · [6][calm][calm] · 6 Might
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · Unit · [8][body][body] · 8 Might
 *   "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.) …"
 *
 * Q: When Yasuo attacks and his trigger targets a Deadbloom Predator, must the attacker recycle a rune (pay
 *    [rainbow]) for Deflect?
 * A: Yes — the attack trigger chooses the Predator, so its controller must pay the Deflect [rainbow] (e.g. by
 *    recycling a rune) for it to go through.
 * Rules: 809.1.c (Deflect adds a mandatory cost to choosing), 429.3 / 429.3.a (paying; Add abilities while paying).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";

/** P1's turn. P2's Deadbloom (8, Deflect) holds bf1 alone; P1's Yasuo (6) attacks from base. */
function board(opts: { rainbow?: number; rune?: boolean }) {
  const b = scenario()
    .resources(P1, { energy: 0, power: opts.rainbow ? { rainbow: opts.rainbow } : {} })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DEADBLOOM_PREDATOR, "predator")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo");
  return opts.rune ? b.rune(P1, "calm", { alias: "rune" }) : b;
}

/** Yasuo attacks; advance to the Deflect pay prompt for his attack trigger (if the engine surfaces one). */
async function attackToDeflectPrompt(game: Game): Promise<void> {
  await game.p1.move("yasuo", "bf1");
  expect(game.state("yasuo").combatRole).toBe("attacker");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      return;
    }
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("predator");
    } else if (d?.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
}

describe("Ruling cb0c9c7b9d025ad8 — Yasuo, Remorseful's attack trigger must pay Deflect to hit Deadbloom Predator", () => {
  test("with a floating [rainbow]: choosing the Predator surfaces a Deflect pay prompt for P1; paying spends the [rainbow] and the trigger deals 6 to the Predator", async () => {
    const game = await board({ rainbow: 1 }).build();
    await attackToDeflectPrompt(game);
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "yasuo" } });
    expect(d?.prompt ?? "").toMatch(/deflect/i);
    await game.p1.yes();
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", targets: ["predator"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("predator").damage).toBe(6);
    expect(game.zoneOf("predator")).toBe("battlefield-bf1"); // 6 < 8
  });

  test("declining to pay: the trigger is dropped — no damage, the [rainbow] is kept, and the showdown simply continues", async () => {
    const game = await board({ rainbow: 1 }).build();
    await attackToDeflectPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.state("predator").damage).toBe(0);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  // Expected: with an empty pool but a ready rune, P1 is still asked to pay the Deflect [rainbow] and may RECYCLE the
  // rune right then (an [Add] ability during payment, 429.3.a) — after which the trigger deals 6 to the Predator.
  // Actual: the engine sees no floating power, never prompts, and silently drops Yasuo's trigger.
  test("ruling cb0c9c7b9d025ad8 — engine drops the trigger instead of letting P1 recycle a rune to pay Deflect", async () => {
    const game = await board({ rune: true }).build();
    await attackToDeflectPrompt(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "yasuo" } });
    // rule 429.3 — unpaid Deflect shows up either as a flat refusal or (once the
    // prompt credits tappable runes) as `needsAdd`; both mean "recycle first".
    if (d?.kind === "yes-no" && (d.canAccept === false || d.needsAdd !== undefined)) {
      expect((d.actions ?? []).some((a) => a.moveId === "recycleRune")).toBe(true);
      await game.p1.recycleRune("rune"); // Add [calm] — any domain pays [rainbow]
    }
    await game.p1.yes();
    expect(game.p1.runes()).toEqual([]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("predator").damage).toBe(6);
  });
});
