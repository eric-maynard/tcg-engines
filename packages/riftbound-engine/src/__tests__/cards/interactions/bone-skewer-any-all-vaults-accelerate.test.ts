/**
 * Interaction: Bone Skewer (unl-139-219) · Spell · Chaos · 2 + [chaos] · [Hidden]
 *     "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that
 *      unit to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Thousand-Tailed Watcher (ogn-116-298) · Unit · Mind · 7 + [mind] · 7 Might
 *     "[Accelerate] (You may pay [1][mind] as an additional cost to have me enter ready.)
 *      When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Vaults of Helia (unl-219-219) · Battlefield — "When you hold here, your non-token units cost [1] more to
 *     play this turn."
 *   contrast: Portal Rescue (ogn-102-298) · Spell · Mind · 3 + [mind] · Action — "Banish a friendly unit, then its
 *     owner plays it to their base, ignoring its cost."
 *
 * Rules: 419.3.b (an effect-instructed play runs every normal step of Play), 355.1.a (declaring an optional
 * additional cost is one of those steps — the PLAYER of the card declares it), 356.1 (base 7 + [mind]),
 * 356.1.b.1 / 356.1.b.3 ("ignoring its cost" only zeroes the BASE; increases and additional costs survive),
 * 356.2.b.1 + 805.1.a / 805.2 (Accelerate = optional additional [1][mind]), 356.3 (Vaults' +[1] increase),
 * 356.5.a ("ignoring ANY AND ALL costs" sets the TOTAL to 0, additional / non-standard costs included — applied
 * after 356.2/356.3), 356.4.f.1 (an optional cost counts as paid once elected, whatever was actually paid),
 * 805.6 (paid Accelerate → enters ready, never "becomes ready"), 811.1.d.2 (choices of a card played from
 * Hidden are restricted to the battlefield it was hidden at), 190.3.a.1 / 323.13 / 464.2.c.1 (a unit PLAYED TO
 * a battlefield its controller doesn't control applies Contested for that controller → combat with them
 * attacking), 423.1.b (a Stunned unit deals no combat damage), 466 (attackers that don't win are recalled).
 *
 * Question — P2's turn; P2 held the Vaults at the start of it (P2's non-token units cost [1] more this turn).
 * P2 casts a spell with its last energy (pool now 0/0). In response P1 flips Bone Skewer from facedown at
 * P1's bfX and picks the Watcher out of P2's hand.
 *  (a) Is P2 offered Accelerate on the forced play; what does P2 pay (Vaults? the pip?); does the Watcher
 *      enter READY (then Stunned)?
 *  (b) Contrast: same turn, P2 plays a Watcher from hand normally with Accelerate — payment?
 *  (c) Contrast: same turn, P2 Portal-Rescues a Watcher and elects Accelerate — payment?
 *  (d) Which battlefield may the flipped Bone Skewer name, and who attacks whom?
 *
 * Expected:
 *  (a) Yes — P2 (the player of the card) gets the Accelerate election even at 0/0; total = 7+[mind] +[1][mind]
 *      +[1] Vaults, then 356.5.a → [0]: P2 pays nothing, Accelerate counts as paid → Watcher enters READY at
 *      bfX under P2's control and is then Stunned; its −3 trigger fires for P2 (P1's units shrink); Bone
 *      Skewer → P1's trash; the original spell resolves afterwards. Declined → exhausted + stunned, still free.
 *  (b) 7 + 1 (Vaults) + [1][mind] = 9 energy + [mind][mind], ready; declined = 8 + [mind], exhausted.
 *  (c) "ignoring its cost" zeroes only the base: Vaults +1 and Accelerate +[1][mind] survive → 2 energy +
 *      [mind], ready; declined → 1 energy, exhausted.
 *  (d) From facedown the battlefield is locked to bfX (no choice offered; the hand copy offers every
 *      battlefield). The Watcher lands on P1's bfX → Contested BY P2 → when the chain empties a combat begins
 *      on P2's turn with P2 attacking / holding Focus; the stunned Watcher deals 0, the shrunken Guard can't
 *      kill it → Watcher recalled to P2's base, P1 keeps bfX, no points move.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const WATCHER = "ogn-116-298";
const VAULTS_OF_HELIA = "unl-219-219";
const PORTAL_RESCUE = "ogn-102-298";
const JUNK_SPELL = { abilities: [], cardType: "spell", energyCost: 1, name: "Junk Spell", timing: "action" } as const;
const JUNK_DRAW = { abilities: [], cardType: "spell", energyCost: 9, name: "Junk Draw", timing: "action" } as const;

/**
 * End of P1's turn 2. P2 controls the LIVE Vaults with a Holder on it (so P2 holds it at the start of turn 3).
 * P1 controls bfX with a 5-Might Guard and has Bone Skewer facedown there (+ a hand copy and its cost, for the
 * (d) contrast). P2's hand: a Watcher + a 1-cost Junk Spell; P2's next draw is a spell (so the Watcher is the
 * only unit in hand). `extra` adds the (b)/(c) material.
 */
function board(extra: "none" | "secondWatcher" | "portal" = "none") {
  let s = scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("vaults", { controller: P2, def: VAULTS_OF_HELIA, inert: false })
    .battlefield("bfX", { controller: P1 })
    .unit(P2, "vaults", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "bfX", { might: 5, name: "Guard" }, "guard")
    .facedown(P1, "bfX", BONE_SKEWER, "bs")
    .hand(P1, BONE_SKEWER, "bsHand")
    .hand(P2, WATCHER, "watcher")
    .hand(P2, JUNK_SPELL, "junk")
    .deckTop(P2, JUNK_DRAW, "drawn")
    .fillDecks({ main: 10, runes: 0 });
  if (extra === "secondWatcher") {
    s = s.hand(P2, WATCHER, "watcher2");
  }
  if (extra === "portal") {
    s = s.unit(P2, "base", WATCHER, "boardWatcher", { exhausted: true }).hand(P2, PORTAL_RESCUE, "portal");
  }
  return s;
}

/** P1 ends turn 2 → P2's turn 3: P2 HOLDS the Vaults (+1, surcharge trigger resolves) and reaches its open main phase. */
async function toP2MainAfterHold(game: Game): Promise<void> {
  await game.p1.endTurn();
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2 && d.source?.cardId === "vaults") {
      await game.p2.pick("holder"); // engine quirk with 2+ friendly units (flagged in harrowing-jinx-accel-vaults); surcharge is player-wide either way
    } else {
      break;
    }
  }
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  expect(game.p2.points()).toBe(1); // the Hold happened → Vaults' surcharge is live for P2 this turn
}

/**
 * (a)/(d) line: P2 floats 1 energy and casts the Junk Spell (pool → 0/0), passes; P1 flips Bone Skewer in
 * response; both pass → Bone Skewer resolves down to P1's "pick a unit from P2's hand" prompt.
 */
async function skewerFlippedToPick(): Promise<Game> {
  const game = await board().build();
  await toP2MainAfterHold(game);
  await game.p2.do("addResources", { energy: 1 });
  await game.p2.cast("junk");
  expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  await game.p2.passPriority();
  await game.p1.reveal("bs");
  expect(game.chain().map((c) => c.cardId)).toEqual(["junk", "bs"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** …then P1 picks the Watcher and P2 answers the Accelerate election. Stops with the Watcher's play trigger on the chain. */
async function watcherForcedIn(accelerate: boolean): Promise<Game> {
  const game = await skewerFlippedToPick();
  await game.p1.pick("watcher");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P2 });
  await (accelerate ? game.p2.yes() : game.p2.no());
  return game;
}

/** Pass priority until the chain is empty (never passes Focus). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

/** (c) drive Portal Rescue: both pass, then answer the Accelerate offer per `accelerate`; stops at the replayed Watcher's trigger. */
async function resolvePortal(game: Game, accelerate: boolean): Promise<{ offered: boolean; prompt?: string }> {
  await game.p2.passPriority();
  await game.p1.passPriority();
  const d = game.decision();
  if (d?.kind === "yes-no" && d.seat === P2) {
    await (accelerate && d.canAccept !== false ? game.p2.yes() : game.p2.no());
    return { offered: d.canAccept !== false, prompt: d.prompt };
  }
  return { offered: false };
}

describe("(d) which battlefield — Bone Skewer flipped from facedown at bfX is locked to bfX (811.1.d.2)", () => {
  test("control: the HAND copy (on P1's own turn, 2 + [chaos] available) offers every battlefield as 'Choose a battlefield'", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "bsHand")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual([["vaults"], ["bfX"]]);
  });

  test("the FACEDOWN copy is a legal Reaction for P1 on P2's turn in response to P2's spell, and offers NO battlefield choice at all (bfX is forced)", async () => {
    const game = await board().build();
    await toP2MainAfterHold(game);
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.cast("junk");
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "bs")).toBe(true);
    const opt = game.p1.option("revealHidden", "bs");
    expect(opt?.variantCount).toBe(1);
    expect(opt?.fields.find((f) => f.arg === "targets")).toBeUndefined();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // P1's pool emptied at its end of turn…
    await game.p1.reveal("bs");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // …and the flip costs [0] anyway (811.1.b)
    expect(game.chain().at(-1)).toMatchObject({ cardId: "bs", controller: P1, triggered: false });
  });
});

describe("(a) the forced play under Vaults: Accelerate IS offered to P2, everything costs 0, the Watcher enters READY then Stunned", () => {
  test("Bone Skewer resolves first (LIFO, Junk Spell still below it): P1 is offered exactly the units of P2's revealed hand — the Watcher — and may decline", async () => {
    const game = await skewerFlippedToPick();
    expect(game.chain().map((c) => c.cardId)).toEqual(["junk"]);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["watcher"]); // 'drawn' (a spell) is revealed but not offered
  });

  test("after P1 picks the Watcher it is P2 — the player of the card (355.1.a, 419.3.b) — who is asked the Accelerate election, and 'yes' is legal although P2's pool is 0 energy / 0 power", async () => {
    const game = await skewerFlippedToPick();
    await game.p1.pick("watcher");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(d?.source?.cardId).toBe("watcher");
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("watcher")).not.toBe("battlefield-bfX"); // not entered yet — the election is part of the play
  });

  test("Accelerate elected: P2 pays NOTHING — no 7, no [mind], no Vaults [1], no [1][mind] pip (356.5.a total → 0) — and the Watcher is at bfX under P2's control (owner P2), READY (805.6) and STUNNED", async () => {
    const game = await watcherForcedIn(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("watcher")).toMatchObject({
      controller: P2,
      isReady: true,
      isStunned: true,
      might: 7,
      owner: P2,
      zone: "battlefield-bfX",
    });
    expect(game.p2.units("bfX")).toEqual(["watcher"]);
    expect(game.p2.units("vaults")).toEqual(["holder"]); // not the other battlefield
  });

  test("it WAS played: the Watcher's 'When you play me' trigger is P2's item on the chain above the Junk Spell, Bone Skewer has finished → P1's trash", async () => {
    const game = await watcherForcedIn(true);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "junk", controller: P2, triggered: false }),
      expect.objectContaining({ cardId: "watcher", controller: P2, triggered: true, type: "ability" }),
    ]);
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.p1.trash()).toContain("bs");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("the trigger resolves for P2: P1's Guard (an ENEMY of the Watcher's controller) drops 5 → 2 this turn, P2's Holder is untouched; then the Junk Spell resolves and the chain is empty", async () => {
    const game = await watcherForcedIn(true);
    await drainChain(game);
    expect(game.state("guard")).toMatchObject({ baseMight: 5, might: 2 });
    expect(game.state("holder").might).toBe(2);
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Accelerate declined: still free (0/0 untouched), the Watcher enters bfX EXHAUSTED and Stunned under P2", async () => {
    const game = await watcherForcedIn(false);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("watcher")).toMatchObject({ controller: P2, isExhausted: true, isStunned: true, zone: "battlefield-bfX" });
    expect(game.chain().at(-1)).toMatchObject({ cardId: "watcher", controller: P2, triggered: true });
  });
});

describe("(d) who attacks whom — the Watcher was played TO P1's bfX, so P2 contests it and attacks on P2's own turn", () => {
  test("bfX is Contested BY P2 while P1 still controls it (190.3.a.1); once the chain empties a Combat begins there with P2 the attacker holding Focus first (323.13, 464.2.c.1)", async () => {
    const game = await watcherForcedIn(true);
    expect(game.gameState.battlefields.bfX).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    await drainChain(game);
    if (game.p2.can("startShowdown")) {
      await game.p2.choose("startShowdown:bfX");
    }
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("watcher").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("watcher").isStunned).toBe(true);
  });

  test("outcome: the Stunned Watcher deals 0 (423.1.b), the 2-Might Guard cannot kill a 7-Might Watcher → both survive, the attacker is recalled to P2's base, P1 keeps bfX uncontested, points unchanged (P2 1 from the Hold, P1 0)", async () => {
    const game = await watcherForcedIn(true);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.state("watcher")).toMatchObject({ controller: P2, damage: 0, zone: "base" });
    expect(game.zoneOf("guard")).toBe("battlefield-bfX");
    expect(game.state("guard").damage).toBe(0);
    expect(game.gameState.battlefields.bfX).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) contrast — the same turn, P2 plays a Watcher from HAND normally under Vaults", () => {
  test("Accelerate elected: 7 + [1] Vaults + [1][mind] = exactly 9 energy + [mind][mind] → pool 0/0, enters base READY", async () => {
    const game = await board("secondWatcher").build();
    await toP2MainAfterHold(game);
    await game.p2.do("addResources", { energy: 9, power: { mind: 2 } });
    await game.p2.play("watcher2", { accelerate: true, to: "base" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("watcher2")).toMatchObject({ isReady: true, zone: "base" });
  });

  test("Accelerate declined: 7 + [1] Vaults = 8 energy + [mind] → from 9 + [mind][mind] exactly 1 energy + 1 mind remain, enters EXHAUSTED", async () => {
    const game = await board("secondWatcher").build();
    await toP2MainAfterHold(game);
    await game.p2.do("addResources", { energy: 9, power: { mind: 2 } });
    await game.p2.play("watcher2", { to: "base" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.state("watcher2")).toMatchObject({ isExhausted: true, zone: "base" });
  });

  test("with only 8 energy + [mind][mind] the plain play is legal but the Accelerate variant is not even offered (9 needed); with 7 + [mind] (printed cost, no Vaults money) it is not playable at all", async () => {
    const eight = await board("secondWatcher").build();
    await toP2MainAfterHold(eight);
    await eight.p2.do("addResources", { energy: 8, power: { mind: 2 } });
    expect(eight.p2.can("play", "watcher2")).toBe(true);
    expect(eight.p2.option("play", "watcher2")?.fields.find((f) => f.arg === "payOptional")).toBeUndefined();
    await expect(eight.p2.play("watcher2", { accelerate: true, to: "base" })).rejects.toThrow();

    const seven = await board("secondWatcher").build();
    await toP2MainAfterHold(seven);
    await seven.p2.do("addResources", { energy: 7, power: { mind: 1 } });
    expect(seven.p2.can("play", "watcher2")).toBe(false);
  });
});

describe("(c) contrast — the same turn, Portal Rescue ('ignoring its cost', 356.1.b.1) on a Watcher under Vaults is NOT free", () => {
  test("Accelerate elected: base → 0 but Vaults [1] + Accelerate [1][mind] survive (356.1.b.3) → the replay costs exactly 2 energy + [mind]; the Watcher returns to base READY", async () => {
    const game = await board("portal").build();
    await toP2MainAfterHold(game);
    await game.p2.do("addResources", { energy: 3 + 2, power: { mind: 1 + 1 } });
    await game.p2.cast("portal", { targets: "boardWatcher" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { mind: 1 } }); // Portal Rescue's own 3 + [mind]
    const seen = await resolvePortal(game, true);
    expect(seen.offered).toBe(true);
    expect(seen.prompt).toContain("[1][mind]"); // a real payment this time — unlike (a)'s free election
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("boardWatcher")).toMatchObject({ controller: P2, isReady: true, zone: "base" });
    expect(game.p2.banishment()).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "boardWatcher", controller: P2, triggered: true })]);
  });

  test("Accelerate declined: the replay costs exactly the Vaults [1] → from 2 energy + [mind] left after Portal Rescue, 1 energy + 1 mind remain; the Watcher returns EXHAUSTED", async () => {
    const game = await board("portal").build();
    await toP2MainAfterHold(game);
    await game.p2.do("addResources", { energy: 3 + 2, power: { mind: 1 + 1 } });
    await game.p2.cast("portal", { targets: "boardWatcher" });
    const seen = await resolvePortal(game, false);
    expect(seen.offered).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.state("boardWatcher")).toMatchObject({ controller: P2, isExhausted: true, zone: "base" });
  });

  test("with 0 energy left after Portal Rescue the Vaults [1] cannot be paid → the Watcher stays banished (419.3.c) — whereas (a)'s forced play went through at 0/0", async () => {
    const game = await board("portal").build();
    await toP2MainAfterHold(game);
    await game.p2.do("addResources", { energy: 3, power: { mind: 1 } });
    await game.p2.cast("portal", { targets: "boardWatcher" });
    await resolvePortal(game, false);
    await game.settle();
    expect(game.zoneOf("boardWatcher")).toBe("banishment");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([]);
  });
});
