/**
 * Ruling b11df6801b029bd6 — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · 2 · 2 Might
 *     "When I defend, you may kill me to move an attacking unit to its base."
 *   × En Garde (OGN-046 → ogn-046-298) · Spell · Calm · 1 · [Reaction] "Give a friendly unit +1 Might this turn, then an
 *     additional +1 Might this turn if it is the only unit you control there."
 *   × Vayne, Hunter (OGN-035 → ogn-035-298) — cited only as "works identically".
 *
 * Q: When the Fan's defend trigger fires, can the defender wait to decide whether to use it until after seeing the
 *    attacker's reactions?
 * A: Yes. The trigger goes on the chain immediately and its TARGET (which attacking unit) is chosen as it is put on the
 *    chain, but the "may kill me" decision is made on RESOLUTION. Either player may respond on top of it first — the
 *    defender may even En Garde in response to their own trigger. Once declined the ability is gone for that showdown.
 * Rules: 383.3 (triggered abilities go on the chain, targets chosen at finalization — 355.5), 359 (instructions —
 *        including a "kill me to …" cost-within-instruction — are performed on resolution), 383.4.f.2.a (defend
 *        triggers once per combat).
 * RULING-CONFLICT: this ruling predates the Unleashed CR. CR 204.3.a uses THIS card as its example — "In order to finalize
 *    the ability to the chain, its controller must kill Overzealous Fan": a "[kill me] TO [move …]" right after the leading
 *    "you may" is the trigger's BASE COST (383.3.b / 740.4.a.2), decided (383.3.a / 402.1) and paid (404.1) while the item
 *    is FINALIZED, before anyone holds priority (406.4). So the defender cannot "wait and see", and cannot En Garde a Fan
 *    that is already in the trash. Unleashed-era rulings 347a9365bc85ec43 / a6a4e61cf7a5ceee agree. Engine follows the CR;
 *    the two facets below are rewritten to the CR line (target still chosen at finalization — that part stands).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const EN_GARDE = "ogn-046-298";

/** P1's turn. P2 holds bf1 with a lone Fan and has exactly 1 energy + En Garde. P1 attacks with two 3-Might units. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P1, "base", { might: 3, name: "Attacker One" }, "a1")
    .unit(P1, "base", { might: 3, name: "Attacker Two" }, "a2")
    .hand(P2, EN_GARDE, "engarde");
}

const isFanKillOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P2 && (d.source?.cardId === "fan" || /Overzealous Fan/.test(d.prompt));

async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["a1", "a2"], "bf1");
  expect(game.state("fan").combatRole).toBe("defender");
  expect(game.state("a1").combatRole).toBe("attacker");
  expect(game.state("a2").combatRole).toBe("attacker");
  return game;
}

describe("Ruling b11df6801b029bd6 — Overzealous Fan: target on the chain now, 'kill me' decided on resolution", () => {
  test("the defend trigger goes on the chain IMMEDIATELY (controller P2, triggered) as the attackers arrive — before anyone acts with Focus", async () => {
    const game = await attack();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, triggered: true })]);
    expect(game.actingSeat()).toBe(P2); // P2 must make the trigger's finalization choice(s) first
    expect(game.p1.legal()).toEqual([]);
  });

  // RULING-CONFLICT (see header): CR 383.3.a / 204.3.a / 404.1 — the "kill me?" opt-in is a FINALIZATION question and
  // "yes" kills the Fan at once; the target (which attacker) is chosen at finalization too (402.2); only the MOVE waits.
  test("CR 204.3.a (contra ruling b11df6801b029bd6) — 'kill me?' is asked at FINALIZATION (timing FIN); yes ⇒ the Fan is in the trash and the target named BEFORE the first priority window; the move happens on resolution", async () => {
    const game = await attack();
    const first = game.decision();
    expect(isFanKillOffer(first)).toBe(true);
    expect(first?.timing).toBe("FIN");
    expect(game.zoneOf("fan")).toBe("battlefield-bf1"); // alive until P2 answers
    await game.p2.yes();
    expect(game.zoneOf("fan")).toBe("trash"); // the cost, paid now
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P2, timing: "FIN" });
    expect(pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["a1", "a2"]);
    await game.p2.pick("a2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", targets: ["a2"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.locationOf("a2")).toBe("bf1"); // the effect has not happened yet
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(isFanKillOffer(game.decision())).toBe(false); // nothing more is asked on resolution
    expect(game.locationOf("a2")).toBe("base");
    expect(game.locationOf("a1")).toBe("bf1");
    expect(game.chain()).toEqual([]);
  });

  // RULING-CONFLICT (see header): with the Fan already dead once its trigger is finalized, P2 controls no unit at bf1 in
  // the response window, so En Garde (needs a friendly unit) is not castable there.
  test("CR 404.1 / 406.4 (contra ruling b11df6801b029bd6) — in the response window over the Fan's finalized trigger the Fan is already gone: P2 cannot En Garde it", async () => {
    const game = await attack();
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (isFanKillOffer(d)) {
        await game.p2.yes();
      } else if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "a2")?.key ?? (d.options[0]?.key as string));
      } else {
        break;
      }
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan"]);
    if (game.actingSeat() !== P2) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.p2.can("cast", "engarde")).toBe(false);
    expect(game.p2.energy()).toBe(1);
  });

  test("accepting (whenever the engine asks) ends with the Fan killed and exactly the CHOSEN attacker (a2) returned to base; a1 keeps attacking", async () => {
    const game = await attack();
    let sawTargetPick = false;
    for (let i = 0; i < 12 && !(game.chain().length === 0 && game.decision()?.kind === "action"); i++) {
      const d = game.decision();
      if (isFanKillOffer(d)) {
        await game.p2.yes();
      } else if (d?.kind === "pick" && d.seat === P2) {
        sawTargetPick = true;
        expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["a1", "a2"]); // "an attacking unit" — P2 chooses which
        await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "a2")?.key as string);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(sawTargetPick).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.locationOf("a2")).toBe("base");
    expect(game.state("a2").combatRole).not.toBe("attacker");
    expect(game.locationOf("a1")).toBe("bf1");
    expect(game.state("a1").combatRole).toBe("attacker");
  });

  test("declining: the ability is simply gone — the Fan lives, the chain is empty, and P2 is never offered it again for the rest of this showdown (a1+a2 then overrun the Fan)", async () => {
    const game = await attack();
    // Decline at whatever point the engine asks.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (isFanKillOffer(d)) {
        await game.p2.no();
        break;
      } else if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick(d.options[0]?.key as string);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    let askedAgain = false;
    game.script(P2, [
      (d) => {
        if (isFanKillOffer(d)) {
          askedAgain = true;
        }
        return undefined;
      },
    ]);
    await game.settle();
    expect(askedAgain).toBe(false);
    expect(game.zoneOf("fan")).toBe("trash"); // 3+3 vs 2
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
