/**
 * Interaction: Immortal Phoenix (ogn-037-298) × Fox-Fire (ogn-256-298) × Seal of Rage (ogn-040-298)
 *
 *   Immortal Phoenix — Unit · Fury · [3][fury] · 3 Might
 *     "[Assault 2] (+2 [Might] while I'm an attacker.)
 *      When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *   Fox-Fire — Spell · Calm/Mind · [3] · [Hidden][Action]
 *     "Kill any number of units at a battlefield with total Might 4 or less."
 *   Seal of Rage — Gear · Fury · [0]
 *     "[Exhaust]: [Reaction] — [Add] [fury]. (Abilities that add resources can't be reacted to.)"
 *
 * P2 attacks P1's bf1. P1 flips Fox-Fire from FACEDOWN at bf1 and kills TWO attackers. Phoenix is
 * in P1's trash; P1 also has an untapped Seal of Rage.
 *
 *  (a) How many Phoenix triggers does ONE Fox-Fire that killed two units make, and what happens to
 *      the second? → TWO. "When you kill A UNIT with a spell" is evaluated per unit killed, so two
 *      independent triggers pend under P1 (383.1 — not an "Nth time" trigger, nothing merges them).
 *      Whichever resolves first plays Phoenix from the trash; the other finds no Phoenix there, its
 *      instruction cannot be followed, and it is ignored (359.3.e.6). Nothing is refunded.
 *  (b) Which battlefields may Phoenix be played to? → Phoenix has no "occupied enemy battlefield"
 *      permission, so the default set applies (355.2.a): P1's base plus battlefields P1 CONTROLS.
 *      Defending its own contested bf1, P1 may drop Phoenix straight into the combat — YES. As the
 *      ATTACKER at P2's battlefield, that battlefield is not one P1 controls — NO, base (and any
 *      other battlefield P1 controls) only.
 *  (c) Fox-Fire was played from Hidden — does 811.1.d restrict Phoenix's destination too? → NO.
 *      811.1.d.2/.d.3 bind the choices of the HIDDEN card (Fox-Fire's kills must be at bf1) and any
 *      unit the hidden card makes you play; Phoenix is played by its own trash-zone triggered
 *      ability, not by Fox-Fire, so its destination is unrestricted beyond 355.2.
 *  (d) Is "pay [1][fury] to play me" decided at finalization or at resolution, and is it acceptable
 *      with an empty pool but a ready Seal of Rage? → FINALIZATION: "you may pay [cost] TO do Y" is
 *      the ability's BASE COST, decided and paid when the trigger is finalized onto the chain
 *      (383.3.a/.b, 204.3.a), not on resolution. DESIGN (manual rune payment): the engine implements
 *      no play-time/pay-time [Add] sub-step (357.1.a / 429.3), so the prompt is shown but is NOT
 *      acceptable while the pool is short — the Seal is never credited. P1 must crack the Seal
 *      BEFORE the trigger finalizes; the Add then resolves immediately without passing priority
 *      (429.2.a / 429.3.a) and [1][fury] is payable out of the pool.
 *  (e) Does the replayed Phoenix arrive in time to defend the combat already running? → YES. It
 *      enters exhausted (143.4) at bf1 and takes P1's Defender designation as a mid-combat arrival
 *      (323.2.a); being exhausted does not stop it defending, and [Assault 2] does not apply since
 *      it is not an attacker.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PHOENIX = "ogn-037-298";
const FOX_FIRE = "ogn-256-298";
const SEAL_OF_RAGE = "ogn-040-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of an option into the set of card ids offered. */
function targetsOffered(game: Game, verb: "cast" | "reveal", alias: string): string[] {
  const opt = game.p1.option(verb, alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** The option keys of an open "Choose a destination" pick. */
function destinationsOffered(game: Game): string[] {
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  expect(d?.prompt).toContain("destination");
  return (d as { options: readonly { key: string }[] }).options.map((o) => o.key);
}

/**
 * P2's turn, P2 attacks P1's bf1 with A(2) + B(2) + Big(5).
 * P1 controls bf1 (Guard 3) and an uncontested bf3 (Holder 1), has Fox-Fire facedown at bf1,
 * a ready Seal of Rage, and Immortal Phoenix in the trash.
 */
function defending(p1res: { energy?: number; power?: Record<string, number> } = { energy: 4, power: { fury: 4 } }) {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, p1res)
    .resources(P2, { energy: 5 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf3", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "bf3", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "A" }, "a")
    .unit(P2, "base", { might: 2, name: "B" }, "b")
    .unit(P2, "base", { might: 5, name: "Big" }, "big")
    .facedown(P1, "bf1", FOX_FIRE, "fox")
    .gear(P1, SEAL_OF_RAGE, "seal")
    .trash(P1, PHOENIX, "phoenix");
}

/** P2 declares the attack and hands P1 the Focus. */
async function attackIsOn(game: Game) {
  await game.p2.move(["a", "b", "big"], "bf1");
  await game.p2.passFocus();
}

/**
 * Mirror board — P1 is the ATTACKER: P1's turn, Raider(3) moves into P2's bf2 (D1 2 + D2 2),
 * Fox-Fire cast from HAND in the showdown. P1 also controls an uncontested bf4.
 */
function attacking() {
  return scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 4, power: { fury: 1, calm: 1 } })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf4", { controller: P1 })
    .unit(P1, "bf4", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "D1" }, "d1")
    .unit(P2, "bf2", { might: 2, name: "D2" }, "d2")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, FOX_FIRE, "fox")
    .trash(P1, PHOENIX, "phoenix");
}

describe("Immortal Phoenix from the trash off a hidden Fox-Fire double kill (+ Seal of Rage)", () => {
  test("(a) one Fox-Fire that kills TWO units pends TWO independent Phoenix triggers, each with its own [1][fury] opt-in (383.1)", async () => {
    const game = await defending().build();
    await attackIsOn(game);
    await game.p1.reveal("fox", { targets: ["a", "b"] });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");

    const first = game.decision();
    expect(first).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(first?.prompt).toContain("Pay [1][fury]");
    expect(first?.source?.cardId).toBe("phoenix");

    await game.p1.yes();
    const second = game.decision();
    expect(second).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    // A second, distinct chain item — one per unit killed, not one merged trigger.
    expect(second?.source?.chainItemId).not.toBe(first?.source?.chainItemId);
    const triggers = game.chain().filter((i) => i.cardId === "phoenix" && i.triggered);
    expect(triggers).toHaveLength(2);
  });

  test("(a) paying BOTH triggers returns exactly ONE Phoenix; the second is ignored with no refund (359.3.e.6)", async () => {
    const game = await defending().build();
    await attackIsOn(game);
    await game.p1.reveal("fox", { targets: ["a", "b"] });
    await game.settle();
    await game.p1.yes(); // trigger #1 — [1][fury] paid at finalization
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 3 } });
    await game.p1.yes(); // trigger #2 — paid too, while Phoenix is still in the trash
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });

    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("base"); // one Phoenix, not two
    expect(game.p1.units("base")).toEqual(["phoenix"]);
    expect(game.chain()).toEqual([]); // the other trigger did nothing and left
    expect(game.p1.hand()).toHaveLength(0); // it did not land anywhere else either
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } }); // nothing refunded
    expect(game.violations()).toEqual([]);
  });

  test("(b)+(c) DEFENDING: the destinations are base + every battlefield P1 CONTROLS — the contested bf1 AND the far bf3 (355.2.a); 811.1.d does not narrow them to the hidden card's battlefield", async () => {
    const game = await defending().build();
    await attackIsOn(game);

    // 811.1.d.2 DOES bind the hidden card's own choices: only bf1's units are killable.
    const killable = targetsOffered(game, "reveal", "fox");
    expect(killable).toContain(game.card("a"));
    expect(killable).toContain(game.card("b"));
    expect(killable).not.toContain(game.card("holder")); // at bf3 — another battlefield

    await game.p1.reveal("fox", { targets: ["a", "b"] });
    await game.settle();
    await game.p1.yes();
    await game.p1.no();
    await game.settle();
    // …but Phoenix is played by its OWN trash ability, so 811.1.d.3 does not apply to it.
    expect(destinationsOffered(game).sort()).toEqual(["base", "battlefield-bf1", "battlefield-bf3"]);
  });

  test("(b) ATTACKING: the contested ENEMY battlefield is NOT offered — only base and the battlefield P1 controls elsewhere", async () => {
    const game = await attacking().build();
    await game.p1.move("raider", "bf2");
    await game.p1.cast("fox", { targets: ["d1", "d2"] });
    await game.settle();
    await game.p1.yes(); // trigger #1
    await game.settle();
    await game.p1.no(); // trigger #2 — one Phoenix is enough
    await game.settle();
    const dests = destinationsOffered(game);
    expect(dests.sort()).toEqual(["base", "battlefield-bf4"]);
    expect(dests).not.toContain("battlefield-bf2");

    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("phoenix")).toBe("base");
  });

  // DESIGN (DESIGN.md "Known deviations" — manual rune payment; FIXER-PRIMER: the play-time [Add]
  // sub-step of 357.1.a is not implemented): rules 357.1.a / 429.3 would let P1 crack the Seal while
  // the payment is being demanded. The engine credits nothing but the pool, so the prompt stands
  // with canAccept:false and offers no [Add] action beside it.
  test("(d) empty pool + ready Seal of Rage: the opt-in is asked at FINALIZATION but is not acceptable, and yes() is rejected", async () => {
    const game = await defending({}).build();
    await attackIsOn(game);
    await game.p1.reveal("fox", { targets: ["a", "b"] });
    await game.settle();

    const d = game.decision();
    expect(d).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(d?.source?.cardId).toBe("phoenix");
    // 357.1.a / 429.3.a would offer the Seal's [Reaction] [Add] here; the engine offers no such action.
    expect(((d as { actions?: readonly { verb: string }[] }).actions ?? []).map((a) => a.verb)).not.toContain("activate");

    const rejected = await game.p1.try((p) => p.yes());
    expect(rejected.ok).toBe(false);
    expect(game.state("seal").isExhausted).toBe(false); // the Seal was never cracked
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });

    // Both unpayable triggers fall away; nothing was spent and Phoenix stays in the trash.
    let r = await game.settle();
    for (let i = 0; i < 4 && r.reason === "unanswered" && game.decision()?.kind === "yes-no"; i++) r = await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("(d) cracking the Seal BEFORE the flip works: the [Add] resolves immediately with no chain item and the [1][fury] is then payable", async () => {
    const game = await defending({ energy: 1 }).build();
    await attackIsOn(game);

    expect(game.p1.can("activate", "seal")).toBe(true);
    await game.p1.activate("seal");
    // 429.2.a / 429.3.a — an [Add] ability resolves at once; no chain item, no priority passed.
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "showdown" });

    await game.p1.reveal("fox", { targets: ["a", "b"] });
    await game.settle();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    // trigger #2 is unpayable now (the pool is spent) — settle declines it
    await game.settle();
    for (let i = 0; i < 4 && game.decision()?.kind === "yes-no"; i++) await game.settle();
    expect(destinationsOffered(game)).toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("phoenix")).toBe("bf1");
    expect(game.state("seal").isExhausted).toBe(true);
  });

  test("(e) Phoenix played into the running combat at bf1 enters EXHAUSTED (143.4) as a Defender (323.2.a) with no [Assault 2] bonus", async () => {
    const game = await defending().build();
    await attackIsOn(game);
    await game.p1.reveal("fox", { targets: ["a", "b"] });
    await game.settle();
    await game.p1.yes();
    await game.p1.no();
    await game.settle();
    await game.p1.pick("battlefield-bf1");

    expect(game.zoneOf("phoenix")).toBe("battlefield-bf1");
    expect(game.state("phoenix").isExhausted).toBe(true); // 143.4 — units enter exhausted
    expect(game.state("phoenix").combatRole).toBe("defender"); // 323.2.a — mid-combat arrival defends
    expect(game.state("phoenix").might).toBe(3); // [Assault 2] is attacker-only
  });

  test("(e) exhausted or not, it fights: Guard 3 + Phoenix 3 kill the lone Big 5 attacker and P1 keeps bf1 — sent to base instead, P1 loses it", async () => {
    const held = await defending().build();
    await attackIsOn(held);
    await held.p1.reveal("fox", { targets: ["a", "b"] });
    await held.settle();
    await held.p1.yes();
    await held.p1.no();
    await held.settle();
    await held.p1.pick("battlefield-bf1");
    await held.settle();
    expect(held.zoneOf("big")).toBe("trash"); // 6 defending Might vs a 5-Might attacker
    expect(held.zoneOf("phoenix")).toBe("battlefield-bf1");
    expect(held.gameState.battlefields.bf1.controller).toBe(P1);
    expect(held.p2.points()).toBe(0);
    expect(held.violations()).toEqual([]);

    const lost = await defending().build();
    await attackIsOn(lost);
    await lost.p1.reveal("fox", { targets: ["a", "b"] });
    await lost.settle();
    await lost.p1.yes();
    await lost.p1.no();
    await lost.settle();
    await lost.p1.pick("base");
    await lost.settle();
    expect(lost.zoneOf("big")).toBe("battlefield-bf1"); // Guard 3 alone loses
    expect(lost.zoneOf("guard")).toBe("trash");
    expect(lost.gameState.battlefields.bf1.controller).toBe(P2);
    expect(lost.p2.points()).toBe(1);
  });
});
