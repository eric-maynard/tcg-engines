/**
 * Veiled Temple — sfd-221-221 · Battlefield
 *
 *   When you conquer here, you may ready a friendly gear. If it's an Equipment, you may detach it.
 *
 * Rules: 469.1 / 466.5.d / 348.2.a.1 (conquer = taking control by combat win or walk-in), 383.4.c.2.b
 * + 471.2.a ("conquer HERE" → only this battlefield, for the conquering player), 190.6.b (the ability
 * belongs to the player it addresses, not the card's deck owner), 415.1.b (readying a ready permanent
 * does nothing — but it is still a legal choice), 137 / 716 (an Equipment IS a gear, attached or not, so
 * it is a legal "friendly gear"), 435 (Detach: unlink; 435.1.e the unit loses the Might Bonus; 435.4 the
 * Equipment lands at the unit's location and 435.4.a is recalled to base at the next Cleanup), 740.1.a
 * ("friendly" = controlled by that player).
 *
 * Head-judge corner cases for THIS card:
 *  1. The economic loop: exhaust Seal of Strength for [body], conquer the Temple, ready the Seal, tap it
 *     again the same turn (2 body total).
 *  2. Choice set = MY gear only (base gear, exhausted or ready, and Equipment even while attached to the
 *     conquering unit); never enemy gear, never units.
 *  3. Equipment branch: choosing an attached Doran's Blade readies it AND offers a second, separate
 *     "you may detach" — accepting strips the +2 from the unit and sends the Blade home; choosing a
 *     non-Equipment gear never asks the second question.
 *  4. "you may" declined / no friendly gear at all → the conquer stands, nothing else happens.
 *  5. Negative space: conquering ELSEWHERE while I hold the Temple; symmetry when P2 conquers it.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-221-221";
const SEAL_OF_STRENGTH = "ogn-163-298"; // gear · [Exhaust]: [Reaction] — [Add] [body].
const DORANS_BLADE = "sfd-095-221"; // Equipment · +2 Might · [Equip] [body]

/** P1: exhausted Seal + unattached Doran's Blade in base, 4-Might Raider; P2: exhausted Seal, 1-Might Pawn on the live Temple (bf1); bf2 inert. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 1 } })
    .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, SEAL_OF_STRENGTH, "seal", { exhausted: true })
    .gear(P1, DORANS_BLADE, "blade")
    .gear(P2, SEAL_OF_STRENGTH, "theirSeal", { exhausted: true })
    .unit(P2, "bf1", { might: 1, name: "Pawn" }, "pawn")
    .unit(P2, "bf2", { might: 1, name: "Pawn Two" }, "pawn2")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider");
}

/** Pass focus/priority until a non-action prompt or the open main phase. */
async function untilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** Attach the Blade to the Raider via the real Equip move ([body] paid), then let it resolve. */
async function equipBlade(game: Game): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "blade", unitId: "raider" } });
  await game.settle();
  expect(game.state("blade").attachedTo).toBe("raider");
  expect(game.state("raider").might).toBe(6);
}

const templeItems = (game: Game) => game.chain().filter((c) => c.cardId === "bf1" && c.triggered);

describe("Veiled Temple (sfd-221-221)", () => {
  test("conquering here (+1 point) asks me 'you may'; accepting offers exactly MY gear — the exhausted Seal and the Blade — never the enemy Seal or a unit", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(templeItems(game)).toEqual([expect.objectContaining({ controller: P1, name: "Veiled Temple" })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["blade", "seal"]);
  });

  test("choosing the exhausted Seal readies it on resolution; the enemy's Seal stays exhausted; the Seal's [Add] ability is legal again", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "seal")).toBe(false);
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    await game.p1.yes();
    await game.p1.pick("seal");
    expect(game.state("seal").isExhausted).toBe(true); // still on the chain
    await game.settle();
    expect(game.state("seal").isReady).toBe(true);
    expect(game.state("theirSeal").isExhausted).toBe(true);
    expect(game.p1.can("activate", "seal")).toBe(true);
    expect(game.decision()?.kind).toBe("action"); // a non-Equipment pick asks nothing further
    expect(game.violations()).toEqual([]);
  });

  test("the loop: tap Seal for [body] (1 → exhausted), conquer the Temple, ready the Seal, tap it again → 2 body from one Seal in one turn", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .gear(P1, SEAL_OF_STRENGTH, "seal")
      .unit(P2, "bf1", { might: 1, name: "Pawn" }, "pawn")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p1.activate("seal");
    await game.settle();
    expect(game.p1.power("body")).toBe(1);
    expect(game.state("seal").isExhausted).toBe(true);
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("seal");
    }
    await game.settle();
    expect(game.state("seal").isReady).toBe(true);
    await game.p1.activate("seal");
    await game.settle();
    expect(game.p1.power("body")).toBe(2);
  });

  test("an attached Equipment is a legal 'friendly gear': the Blade rides along on the conquering Raider (6 Might) and can be chosen; it stays attached when merely readied", async () => {
    const game = await board().build();
    await equipBlade(game);
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    await game.p1.yes();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["blade", "seal"]);
    await game.p1.pick("blade");
    // Whatever the detach answer, decline it if asked; the Blade must still be attached afterwards.
    for (let i = 0; i < 6 && game.decision()?.kind === "yes-no"; i++) {
      await game.p1.no();
    }
    await game.settle();
    for (let i = 0; i < 6 && game.decision()?.kind === "yes-no"; i++) {
      await game.p1.no();
      await game.settle();
    }
    expect(game.state("blade")).toMatchObject({ attachedTo: "raider", isReady: true });
    expect(game.state("raider")).toMatchObject({ might: 6, zone: "battlefield-bf1" });
  });

  // BUG — expected: after choosing the (Equipment) Blade, a SECOND independent "you may detach it" is asked;
  // accepting unlinks it (435.1): Raider drops to 4 Might, the Blade is unattached and ends in P1's base
  // (435.4.a — a gear at a battlefield is recalled at the next Cleanup). Actual: the parsed ability stops at
  // "ready a friendly gear" — no detach offer ever appears, the Blade stays on the Raider.
  test.failing("BUG: 'If it's an Equipment, you may detach it' — choosing the attached Blade should offer a detach that strips +2 and sends it to base (435)", async () => {
    const game = await board().build();
    await equipBlade(game);
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    await game.p1.yes();
    await game.p1.pick("blade");
    // The detach offer may come at finalize or on resolution: pass priority until a yes/no shows up.
    for (let i = 0; i < 8 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.state("raider")).toMatchObject({ attachments: [], might: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.p1.gear().sort()).toEqual(["blade", "seal"]);
  });

  test("'you may' declined: nothing readies, the conquer and the point stand, no item lingers", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(templeItems(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("no friendly gear at all: conquering still scores, and whatever is (or isn't) asked resolves to the open main phase without touching the enemy Seal", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .gear(P2, SEAL_OF_STRENGTH, "theirSeal", { exhausted: true })
      .unit(P2, "bf1", { might: 1, name: "Pawn" }, "pawn")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    await game.settle({ policy: "first" }); // answers a stray yes/no with yes, declines an empty pick
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("theirSeal").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("348.2.a.1 — walking onto an UNCONTROLLED Temple is a conquer here too: offer → Seal readied", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P2 })
      .gear(P1, SEAL_OF_STRENGTH, "seal", { exhausted: true })
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("seal");
    }
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.state("seal").isReady).toBe(true);
  });

  test("negative space — the Temple is bf1 (P2's) and I conquer bf2: a point, but no offer and my Seal stays exhausted", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // BUG — expected (471.2.a): while I already control the Temple (bf1), conquering bf2 must not fire the
  // Temple. Actual: the `on:"controller"` matcher ignores the trigger's `location:"here"` for battlefield
  // cards and only checks that the conqueror controls the Temple, so the offer appears.
  test.failing("BUG: 'When you conquer HERE' fires for the Temple's controller conquering a DIFFERENT battlefield (471.2.a)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P2 })
      .gear(P1, SEAL_OF_STRENGTH, "seal", { exhausted: true })
      .unit(P1, "bf1", { might: 1, name: "Garrison" }, "garrison")
      .unit(P2, "bf2", { might: 1, name: "Pawn Two" }, "pawn2")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf2");
    await untilPrompt(game);
    expect(game.p1.points()).toBe(1);
    expect(templeItems(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("symmetry — P2 conquers a Temple whose card P1 owns: P2 is asked and readies P2's Seal; my Seal is not offered and stays exhausted", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .gear(P1, SEAL_OF_STRENGTH, "seal", { exhausted: true })
      .gear(P2, SEAL_OF_STRENGTH, "theirSeal", { exhausted: true })
      .gear(P2, DORANS_BLADE, "theirBlade", { exhausted: true })
      .unit(P1, "bf1", { might: 1, name: "Pawn" }, "pawn")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await untilPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(templeItems(game)).toEqual([expect.objectContaining({ controller: P2 })]);
    await game.p2.yes();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["theirBlade", "theirSeal"]);
    await game.p2.pick("theirSeal");
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.state("theirSeal").isReady).toBe(true);
    expect(game.state("theirBlade").isExhausted).toBe(true); // only the ONE chosen gear readies
    expect(game.state("seal").isExhausted).toBe(true);
  });

  test("registry payload (first clause): an optional conquer-here trigger for the controller that readies ONE friendly gear", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Veiled Temple" });
    expect(def?.abilities?.length).toBeGreaterThanOrEqual(1);
    expect(def?.abilities?.[0]).toMatchObject({
      optional: true,
      trigger: { event: "conquer", location: "here", on: "controller" },
      type: "triggered",
    });
    const effect = JSON.stringify((def?.abilities?.[0] as { effect?: unknown })?.effect ?? {});
    expect(effect).toContain('"type":"ready"');
    expect(effect).toContain('"type":"gear"');
    expect(effect).toContain('"controller":"friendly"');
  });

  // BUG (parse) — expected: the ability also encodes the conditional follow-up "If it's an Equipment, you may
  // detach it" (a detach instruction gated on the chosen gear being an Equipment). Actual: the payload is
  // just `{type:"ready", target:{type:"gear", controller:"friendly"}}` — the second sentence was dropped.
  test.failing("BUG: registry payload must carry the 'If it's an Equipment, you may detach it' follow-up", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    const all = JSON.stringify(def?.abilities ?? []);
    expect(all).toContain('"type":"ready"');
    expect(all.toLowerCase()).toContain("detach");
    expect(all.toLowerCase()).toContain("equipment");
  });
});
