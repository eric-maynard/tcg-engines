/**
 * Interaction: The Zero Drive (sfd-090-221) × Cursed Sarcophagus (unl-148-219) × Deathgrip (sfd-163-221)
 *
 *   The Zero Drive — Equipment · Mind · 3 · +2 Might
 *     "[Equip] [1][mind]. [3][mind], Banish this: Play all units banished with this, ignoring their costs.
 *      (Use only if unattached.)"  Effect text: "[Deathknell] — Banish me."
 *   Cursed Sarcophagus — Gear · Chaos · 4 + [chaos]
 *     "When you play this, banish all units from your trash. [Exhaust]: Play a unit banished with this.
 *      (You must pay its costs.)"
 *   Deathgrip — Spell (Reaction) · Order · 2
 *     "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this
 *      turn. Draw 1."
 *
 * Rules: 393 / 394.1 / 395 / 397 (Linked Abilities: "banished with this" = only objects the OTHER
 * component of the same linked set banished; 395 expressly links an ability GRANTED to another object —
 * the Drive's Effect-Text Deathknell on the wearer — with the Drive's own activated ability; 397's example
 * is literally The Zero Drive); 427.3 / 427.3.a (cards refer to cards banished by the SAME object;
 * separate instances of a same-named card keep separate pools); 808.1.d / 808.1.d.2 (Deathknell triggers
 * on being killed and sent to the trash; the trigger is pended before the card moves); 390.5.c.1 (the
 * linked follow-up finds the object in the zone it was moved to — banishment).
 *
 * Question: P1's turn, ample runes. V (3 Might vanilla) in base wears The Zero Drive; P1's trash holds
 * unit T (2-cost). Step 1: P1 plays Cursed Sarcophagus → T is banished "with" it. Step 2: P1 Deathgrips
 * V → V dies; the Drive-granted Deathknell banishes V; the Drive falls off into base unattached.
 *   (a) Sarcophagus [Exhaust]: T only, or also V?   (b) Zero Drive [3][mind]+banish: V only, or also T?
 *   V free / T paid?   (c) Is the granted Deathknell really linked to the Drive's activated ability?
 *   (d) A second Sarcophagus played after V died and after another unit R hit the trash — what can each
 *   Sarcophagus play?
 *
 * Expected: (a) T only (397/427.3) — paying T's full cost, T enters base exhausted. (b) V only, free; T
 * stays banished; the Drive itself is banished as the cost. (c) Yes (395). (d) Sarcophagus #2 banishes
 * only R and can play only R; #1 still only T (427.3.a); neither can ever play V; the Drive never T or R.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZERO_DRIVE = "sfd-090-221";
const SARCOPHAGUS = "unl-148-219";
const DEATHGRIP = "sfd-163-221";

const T_DEF = { cardType: "unit", energyCost: 2, might: 2, name: "Trashed T" } as const;
const V_DEF = { cardType: "unit", energyCost: 3, might: 3, name: "Vessel V" } as const;
const R_DEF = { cardType: "unit", energyCost: 1, might: 1, name: "Runt R" } as const;

/**
 * P1's turn. V (3) in base wearing The Zero Drive (+2 → 5); T in P1's trash; Sarcophagus + Deathgrip in
 * hand. Energy 11 = Sarcophagus 4 + Deathgrip 2 + Drive 3 + T 2, exactly; chaos 1 (Sarcophagus pip),
 * mind 1 (Drive pip). P2 just has a bystander.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { chaos: 1, mind: 1 } })
    .unit(P1, "base", V_DEF, "v", { equippedWith: ["zd"] })
    .card("zd", { def: ZERO_DRIVE, meta: { attachedTo: "v" }, owner: P1, zone: "base" })
    .trash(P1, T_DEF, "t")
    .unit(P2, "base", { might: 4, name: "Bystander" }, "foe")
    .hand(P1, SARCOPHAGUS, "sarc")
    .hand(P1, DEATHGRIP, "dg");
}

/** Step 1: play the Sarcophagus and let its play trigger resolve. */
async function step1(game: Game): Promise<void> {
  await game.p1.play("sarc");
  await game.settle();
}

/** Step 2: Deathgrip V and let everything (spell, Deathknell) resolve back to P1's open main phase. */
async function step2(game: Game): Promise<void> {
  await game.p1.cast("dg", { targets: "v" });
  const r = await game.settle();
  expect(r.reason).toBe("open");
}

async function afterBothSteps(): Promise<Game> {
  const game = await board().build();
  await step1(game);
  await step2(game);
  return game;
}

/** Activate `card`'s [Exhaust]/release ability and pass priority until a P1 pick appears or the chain is gone. */
async function activateToPick(game: Game, card: string): Promise<Decision | null> {
  await game.p1.activate(card);
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      break;
    }
    await game.acting().pass();
  }
  return game.decision();
}

/**
 * Like `activateToPick`, but walks on to the Sarcophagus's actual "play a unit banished with this"
 * pick — a TARGET named as the ability is activated (355.5 / 402.2: a pick over BANISHED cards, timing
 * FIN), or the older resolution-time `from-revealed` pick. Any other P1 target prompt (over board units)
 * would be spurious; it is answered with its first option so the pool assertions can still be made.
 */
async function activateToPlayPick(game: Game, card: string): Promise<Decision | null> {
  await game.p1.activate(card);
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (
      d.kind === "pick" &&
      (d.semantics === "from-revealed" ||
        (d.seat === P1 && d.options.length > 0 && d.options.every((o) => game.zoneOf(String(o.card ?? o.key)) === "banishment")))
    ) {
      return d;
    }
    if (d.kind === "pick" && d.semantics === "target" && d.seat === P1 && d.options[0]) {
      await game.p1.pick(d.options[0].key); // spurious, effect-less board-unit prompt
      continue;
    }
    if (d.kind === "action" && d.context !== "main") {
      await game.acting().pass();
      continue;
    }
    break;
  }
  return game.decision();
}

const pickCards = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []);

describe("The Zero Drive × Cursed Sarcophagus — 'banished with THIS' keeps separate pools", () => {
  // ── Step 1 ────────────────────────────────────────────────────────────────────────────────

  test("step 1: Sarcophagus resolves to base READY; its play trigger banishes every unit in P1's trash — T — and nothing else; V still wears the Drive (5 Might)", async () => {
    const game = await board().build();
    expect(game.state("v")).toMatchObject({ attachments: ["zd"], might: 5 });
    await step1(game);
    expect(game.zoneOf("sarc")).toBe("base");
    expect(game.state("sarc").isReady).toBe(true);
    expect(game.zoneOf("t")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.banishment()).toEqual(["t"]);
    expect(game.state("v")).toMatchObject({ might: 5, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 7, power: { chaos: 0, mind: 1 } });
  });

  test("step 1: while the Drive is attached its '[3][mind], Banish this' ability is not offered ('Use only if unattached')", async () => {
    const game = await board().build();
    await step1(game);
    expect(game.p1.can("activate", "zd")).toBe(false);
  });

  // ── Step 2 ────────────────────────────────────────────────────────────────────────────────

  test("step 2: Deathgrip kills V → V hits the TRASH with its Drive-granted Deathknell pending on the chain (808.1.d.2); the Drive has already fallen off", async () => {
    const game = await board().build();
    await step1(game);
    await game.p1.cast("dg", { targets: "v" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dg", targets: ["v"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Deathgrip resolves
    expect(game.zoneOf("dg")).toBe("trash");
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "v", controller: P1, triggered: true })]);
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, zone: "base" });
  });

  test("step 2: the Deathknell resolves — V is banished 'with' The Zero Drive; T and V now both sit in P1's banishment; the Drive is unattached in base and its release ability becomes available; Deathgrip drew 1", async () => {
    const game = await board().build();
    await step1(game);
    const hand0 = game.p1.hand().length; // [dg]
    await step2(game);
    expect(game.zoneOf("v")).toBe("banishment");
    expect(game.p1.banishment().sort()).toEqual(["t", "v"]);
    expect(game.p1.trash()).toEqual(["dg"]);
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, isReady: true, zone: "base" });
    expect(game.p1.gear().sort()).toEqual(["sarc", "zd"]);
    expect(game.p1.can("activate", "zd")).toBe(true);
    expect(game.p1.can("activate", "sarc")).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // Deathgrip's unlinked "Draw 1"
    expect(game.p1.resources()).toEqual({ energy: 5, power: { chaos: 0, mind: 1 } });
    expect(game.violations()).toEqual([]);
  });

  // ── (a) Sarcophagus: T only, paid ─────────────────────────────────────────────────────────

  test("(a) Sarcophagus [Exhaust] offers exactly T — V (a P1 unit in banishment, but banished by a DIFFERENT object's ability) is not offered (397, 427.3)", async () => {
    const game = await afterBothSteps();
    const d = await activateToPick(game, "sarc");
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickCards(d)).toEqual(["t"]);
    expect(pickCards(d)).not.toContain("v");
    expect(game.state("sarc").isExhausted).toBe(true);
    await expect(game.p1.pick("v")).rejects.toThrow();
  });

  test("(a) picking T pays T's full cost (2 energy: 5 → 3) and T enters P1's base exhausted; V stays banished", async () => {
    const game = await afterBothSteps();
    await activateToPick(game, "sarc");
    await game.p1.pick("t");
    await game.settle();
    expect(game.zoneOf("t")).toBe("base");
    expect(game.state("t")).toMatchObject({ controller: P1, isExhausted: true, might: 2 });
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("v")).toBe("banishment");
  });

  // ── (b) Zero Drive: V only, free ──────────────────────────────────────────────────────────

  test("(b) Zero Drive activation: [3][mind] paid and 'Banish this' is a COST — the Drive is in banishment as soon as the ability is on the chain", async () => {
    const game = await afterBothSteps();
    await game.p1.activate("zd");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, mind: 0 } });
    expect(game.zoneOf("zd")).toBe("banishment");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zd", controller: P1, triggered: false })]);
    expect(game.zoneOf("v")).toBe("banishment"); // nothing released before resolution
  });

  test("(b) on resolution it plays exactly the units banished WITH IT — V — ignoring its cost: V enters base exhausted at its printed 3 Might, no energy spent beyond the activation; T (Sarcophagus's exile) is NOT played (397)", async () => {
    const game = await afterBothSteps();
    await game.p1.activate("zd");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("v")).toBe("base");
    expect(game.state("v")).toMatchObject({ attachments: [], controller: P1, isExhausted: true, might: 3 });
    expect(game.p1.energy()).toBe(2); // "ignoring their costs" — V's 3 was never charged
    expect(game.zoneOf("t")).toBe("banishment");
    expect(game.zoneOf("zd")).toBe("banishment"); // stays there — it does not come back with V
    expect(game.p1.banishment().sort()).toEqual(["t", "zd"]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) both engines in one turn: Sarcophagus plays T for 2, then the Drive plays V for free — each from its own pool; P1 ends on exactly 0 energy with T and V in base", async () => {
    const game = await afterBothSteps();
    await activateToPick(game, "sarc");
    await game.p1.pick("t");
    await game.settle();
    await game.p1.activate("zd");
    await game.settle();
    expect(game.p1.units("base").sort()).toEqual(["t", "v"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, mind: 0 } });
    expect(game.p1.banishment()).toEqual(["zd"]);
  });

  // ── (c) the granted Deathknell IS the Drive's linked component ────────────────────────────

  test("(c) the Deathknell was V's own (granted) trigger — its chain item is sourced on V, not on the Drive — yet what it banished is exactly what the Drive's activated ability plays (395: granted-to-another-object abilities link with their source)", async () => {
    const game = await board().build();
    await step1(game);
    await game.p1.cast("dg", { targets: "v" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const knell = game.chain()[0];
    expect(knell).toMatchObject({ cardId: "v", triggered: true }); // lives on V (Effect Text appended to the wearer)
    await game.settle();
    expect(game.zoneOf("v")).toBe("banishment");
    // …and the Drive — a different object — treats V as "banished with this".
    await game.p1.activate("zd");
    await game.settle();
    expect(game.zoneOf("v")).toBe("base");
  });

  test("(c) contrast: a unit that dies WITHOUT the Drive attached just goes to the trash (no Deathknell), and the Drive's activation later plays nothing for it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { mind: 1 } })
      .unit(P1, "base", V_DEF, "v")
      .gear(P1, ZERO_DRIVE, "zd") // unattached from the start
      .unit(P2, "base", { might: 4, name: "Bystander" }, "foe")
      .hand(P1, DEATHGRIP, "dg")
      .build();
    await game.p1.cast("dg", { targets: "v" });
    await game.settle();
    expect(game.zoneOf("v")).toBe("trash");
    await game.p1.activate("zd");
    await game.settle();
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.zoneOf("zd")).toBe("banishment");
    expect(game.p1.units()).toEqual([]);
  });

  // ── (d) two Sarcophagi, two pools ─────────────────────────────────────────────────────────

  /**
   * Variant: R (1) also in P1's base; a second Sarcophagus and a second Deathgrip in hand. Sequence:
   * Sarcophagus #1 (banishes T) → Deathgrip V (Deathknell banishes V; R takes the +Might) → Deathgrip R
   * (R → trash, no Drive) → Sarcophagus #2 (banishes R).
   */
  async function twoSarcophagi(): Promise<Game> {
    const game = await scenario()
      .resources(P1, { energy: 20, power: { chaos: 2, mind: 1 } })
      .unit(P1, "base", V_DEF, "v", { equippedWith: ["zd"] })
      .card("zd", { def: ZERO_DRIVE, meta: { attachedTo: "v" }, owner: P1, zone: "base" })
      .unit(P1, "base", R_DEF, "r")
      .trash(P1, T_DEF, "t")
      .unit(P2, "base", { might: 4, name: "Bystander" }, "foe")
      .hand(P1, SARCOPHAGUS, "sarc")
      .hand(P1, SARCOPHAGUS, "sarc2")
      .hand(P1, DEATHGRIP, "dg")
      .hand(P1, DEATHGRIP, "dg2")
      .build();
    await game.p1.play("sarc");
    await game.settle();
    await game.p1.cast("dg", { targets: "v" });
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("r"); // Deathgrip's "+Might to another friendly unit" recipient, if asked
      await game.settle();
    }
    expect(game.zoneOf("v")).toBe("banishment");
    await game.p1.cast("dg2", { targets: "r" });
    await game.settle();
    expect(game.zoneOf("r")).toBe("trash"); // no Drive on R → plain death
    await game.p1.play("sarc2");
    await game.settle();
    return game;
  }

  test("(d) Sarcophagus #2's play trigger banishes only what is in the trash NOW — R; V and T were already in banishment and are not re-tagged", async () => {
    const game = await twoSarcophagi();
    expect(game.zoneOf("r")).toBe("banishment");
    expect(game.p1.banishment().sort()).toEqual(["r", "t", "v"]);
    expect(game.p1.trash().sort()).toEqual(["dg", "dg2"]); // spells are not units — they stay
    expect(game.p1.gear().sort()).toEqual(["sarc", "sarc2", "zd"]);
  });

  test("(d) Sarcophagus #2 [Exhaust] offers only R; Sarcophagus #1 [Exhaust] still offers only T — same-named cards keep separate 'banished with this' pools (427.3.a); neither offers V", async () => {
    const game = await twoSarcophagi();
    const d2 = await activateToPlayPick(game, "sarc2");
    expect(d2).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pickCards(d2)).toEqual(["r"]);
    await game.p1.pick("r");
    await game.settle();
    expect(game.state("r")).toMatchObject({ isExhausted: true, zone: "base" });
    const d1 = await activateToPlayPick(game, "sarc");
    expect(d1).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pickCards(d1)).toEqual(["t"]);
    await game.p1.pick("t");
    await game.settle();
    expect(game.zoneOf("t")).toBe("base");
    expect(game.zoneOf("v")).toBe("banishment"); // nobody but the Drive can bring V back
  });

  test("(d) the other order: #1 first offers only T, then #2 offers only R", async () => {
    const game = await twoSarcophagi();
    const d1 = await activateToPlayPick(game, "sarc");
    expect(pickCards(d1)).toEqual(["t"]);
    await game.p1.pick("t");
    await game.settle();
    const d2 = await activateToPlayPick(game, "sarc2");
    expect(pickCards(d2)).toEqual(["r"]);
    await game.p1.pick("r");
    await game.settle();
    expect(game.p1.units("base").sort()).toEqual(["r", "t"]);
    expect(game.p1.banishment()).toEqual(["v"]);
  });

  // The [Exhaust] ability chooses nothing on the board — its only decision is WHICH linked exile to play, a
  // target named as it is activated (355.5 / 402.2): with R (just replayed by #2) and P2's bystander on the
  // board, activating #1 asks for T at once and never raises a prompt over board units.
  test("(d) after #2 replayed R, activating #1 goes straight to the banished-unit pick [T] (FIN) — no spurious 'choose a target' over board units", async () => {
    const game = await twoSarcophagi();
    await activateToPlayPick(game, "sarc2");
    await game.p1.pick("r");
    await game.settle();
    const d1 = await activateToPick(game, "sarc");
    expect(d1).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pickCards(d1)).toEqual(["t"]);
  });

  test("(d) …and the Drive plays V only — never T or R, even while they are still sitting in banishment next to V", async () => {
    const game = await twoSarcophagi();
    expect(game.p1.banishment().sort()).toEqual(["r", "t", "v"]);
    await game.p1.activate("zd");
    await game.settle();
    expect(game.zoneOf("v")).toBe("base");
    expect(game.zoneOf("t")).toBe("banishment");
    expect(game.zoneOf("r")).toBe("banishment");
    expect(game.zoneOf("zd")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });
});
