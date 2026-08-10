/**
 * Interaction: Bone Skewer (unl-139-219) · Spell · Chaos · 2 + [chaos] · Action · [Hidden]
 *     "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that unit to
 *      that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Clockwork Keeper (ogn-044-298) · Unit · Calm · 2 · 2 Might
 *     "You may pay [calm] as an additional cost to play me. When you play me, if you paid the additional cost, draw 1."
 *
 * Rules: 107.3.f / 128.4 (a facedown zone is public, the facedown card in it is Private to its controller), 811.6.a
 * (the Reaction property granted to a hidden card is not public), 811.1.d.2 (played from Hidden → its battlefield
 * choice is "here"), 108.1.b / 421.4 (once played it is on the chain — public), 424.1 / 424.3.a / 424.1.a.3 (the
 * instructed player reveals every card CURRENTLY in hand to ALL players until the revealing spell finishes),
 * 424.3.a.1 (cards added later are not revealed), 128.2.a (afterwards privacy reverts to the zone's), 356.5.a
 * ("ignoring any and all costs" zeroes even additional costs — but the optional additional cost is still DECLARED by
 * the player of the card, Bone Skewer rulings), 359.2 (a permanent resolves immediately; its play trigger is a new
 * chain item), 355.10.a ("you may choose" → declinable).
 *
 * Question: P1 hid Bone Skewer at bf1 (P1 controls bf1 with a unit) last turn. P2's hand = {Clockwork Keeper, spell S,
 * unit U}; P2's next draw is D.
 *  (a) Before the flip P2's view (what the AI seat's `zone` tool renders) shows only an anonymous facedown placeholder
 *      controlled by P1 at bf1 — no id / name / keywords.
 *  (b) P1 plays it from facedown: no battlefield choice is offered (bf1 forced); Bone Skewer is on the chain, named, in
 *      both seats' views.
 *  (c) On resolution P2 reveals the whole hand to everyone: P1's and a spectator's view name Keeper/S/U, the public
 *      reveal record attributes them to P2; P1's own hand stays hidden from P2; P1's pick offers only the units
 *      (Keeper, U), S is visible but not pickable, and P1 may decline.
 *  (d) P1 picks Keeper: P2 — on P1's turn, inside P1's effect, with an empty pool — is asked the optional-additional-
 *      cost opt-in (the play's own steps run once Bone Skewer has finished resolving, 354.3); "yes"
 *      is legal and costs nothing, satisfies "if you paid" (the draw trigger goes on the chain), and the prompt is fully
 *      present in P2's own view (P1 sees only a summary). Keeper lands at bf1 under P2, Stunned. "No" → no draw trigger.
 *  (e) The draw happens after Bone Skewer is in the trash: the reveal window is closed by then, D is never on the
 *      public record, and P1's view of P2's hand (S, U, D) is all anonymous again.
 *  (f) P2 holds no unit: the hand is still revealed publicly (unconditional instruction), P1 can only decline, nothing
 *      is played or stunned, P1 is back in its main phase.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, SPECTATOR, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const KEEPER = "ogn-044-298";

// Distinctive names so a substring search over a serialized view is a reliable leak detector.
const SPELL_S = { abilities: [], cardType: "spell", domain: "fury", energyCost: 9, name: "Sigma Sorcery", timing: "action" } as const;
const UNIT_U = { abilities: [], cardType: "unit", domain: "fury", energyCost: 9, might: 3, name: "Upsilon Brute" } as const;
const DRAWN_D = { abilities: [], cardType: "spell", domain: "fury", energyCost: 9, name: "Delta Topdeck", timing: "action" } as const;
const SPELL_T = { abilities: [], cardType: "spell", domain: "fury", energyCost: 9, name: "Tau Sorcery", timing: "action" } as const;
const P1_PRIVATE = { abilities: [], cardType: "spell", domain: "calm", energyCost: 9, name: "Omega Secret", timing: "action" } as const;

type Viewer = typeof P1 | typeof SPECTATOR;

/** P1's turn 2. P1 controls bf1 with a Guard and has Bone Skewer facedown there (hidden on an earlier turn). */
function board(p2Hand: "keeper" | "noUnit" = "keeper") {
  let s = scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .facedown(P1, "bf1", BONE_SKEWER, "bs")
    .hand(P1, P1_PRIVATE, "p1priv");
  if (p2Hand === "keeper") {
    s = s.hand(P2, KEEPER, "keeper").hand(P2, SPELL_S, "spS").hand(P2, UNIT_U, "unitU").deckTop(P2, DRAWN_D, "drawnD");
  } else {
    s = s.hand(P2, SPELL_S, "spS").hand(P2, SPELL_T, "spT").deckTop(P2, DRAWN_D, "drawnD");
  }
  return s;
}

/** `owner`'s hand as `viewer` sees it: "id:name", or "hidden" for a redacted entry. */
function handAsSeenBy(game: Game, viewer: Viewer, owner: typeof P1): string[] {
  return (game.view(viewer).zones.hand ?? [])
    .filter((c) => c.owner === owner)
    .map((c) => ("id" in c ? `${c.id}:${c.name}` : "hidden"));
}

function publicReveals(game: Game): { playerId: string; cardIds: readonly string[] }[] {
  return [...(game.gameState.publicReveals ?? [])];
}

/** P1 flips Bone Skewer, both pass → it resolves down to P1's reveal-and-pick prompt. */
async function flippedToPick(): Promise<Game> {
  const game = await board().build();
  await game.p1.reveal("bs");
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** …then P1 picks Keeper → P2's additional-cost opt-in is pending. */
async function keeperPicked(): Promise<Game> {
  const game = await flippedToPick();
  await game.p1.pick("keeper");
  return game;
}

describe("(a) before the flip — the facedown card is private to P1 (107.3.f, 128.4, 811.6.a)", () => {
  test("P2's view of facedown-bf1 is exactly one anonymous placeholder {hidden, owner: P1, zone, index} — no id, name, defId or keywords", async () => {
    const game = await board().build();
    const fd = game.view(P2).zones["facedown-bf1"] ?? [];
    expect(fd).toEqual([{ hidden: true, index: 0, owner: P1, zone: "facedown-bf1" }]);
    expect(game.view(P2).battlefields.find((b) => b.id === "bf1")).toMatchObject({ controller: P1, facedownCount: 1 });
    const everything = JSON.stringify(game.view(P2));
    expect(everything).not.toContain("Bone Skewer");
    expect(everything).not.toContain(BONE_SKEWER);
    expect(everything).not.toContain('"bs"');
  });

  test("P1 (the controller) and a spectator DO see it by id; P1 may play it for [0] as a Reaction (revealHidden is legal with an empty pool)", async () => {
    const game = await board().build();
    expect((game.view(P1).zones["facedown-bf1"] ?? []).map((c) => ("id" in c ? c.id : "hidden"))).toEqual(["bs"]);
    expect((game.view(SPECTATOR).zones["facedown-bf1"] ?? []).map((c) => ("id" in c ? c.id : "hidden"))).toEqual(["bs"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("reveal", "bs")).toBe(true);
    expect(game.p2.legal().map((o) => o.key).join(",")).not.toContain("bs");
  });
});

describe("(b) the flip — battlefield forced to bf1, Bone Skewer public on the chain (811.1.d.2, 108.1.b)", () => {
  test("the revealHidden option carries NO battlefield/targets field (bf1 is the only legal 'here'), one variant", async () => {
    const game = await board().build();
    const opt = game.p1.option("revealHidden", "bs");
    expect(opt?.variantCount).toBe(1);
    expect(opt?.fields.find((f) => f.arg === "targets" || f.name === "battlefield")).toBeUndefined();
  });

  test("after the flip Bone Skewer is a spell item on the chain controlled by P1, named in P2's view and in a spectator's; the facedown zone is empty", async () => {
    const game = await board().build();
    await game.p1.reveal("bs");
    expect(game.zoneOf("bs")).toBe("chain");
    for (const viewer of [P2, SPECTATOR] as const) {
      expect(game.view(viewer).chain).toEqual([
        expect.objectContaining({ cardId: "bs", controller: P1, name: "Bone Skewer", triggered: false, type: "spell" }),
      ]);
    }
    const chainZone = (game.view(P2).zones.chain ?? []).map((c) => ("id" in c ? `${c.id}:${c.name}` : "hidden"));
    expect(chainZone).toEqual(["bs:Bone Skewer"]);
    expect(game.view(P2).battlefields.find((b) => b.id === "bf1")?.facedownCount).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });
});

describe("(c) resolution — P2 reveals the whole hand to ALL players; P1 gets a declinable units-only pick (424.1, 424.3.a, 355.10.a)", () => {
  test("P1's view AND a spectator's list Keeper / S / U by id + name while the pick is pending; P2's view of P1's hand stays anonymous (128.4)", async () => {
    const game = await flippedToPick();
    const expected = ["keeper:Clockwork Keeper", "spS:Sigma Sorcery", "unitU:Upsilon Brute"];
    expect(handAsSeenBy(game, P1, P2).sort()).toEqual(expected);
    expect(handAsSeenBy(game, SPECTATOR, P2).sort()).toEqual(expected);
    expect(handAsSeenBy(game, P2, P1)).toEqual(["hidden"]);
    expect(JSON.stringify(game.view(P2))).not.toContain("Omega Secret");
  });

  test("the public-reveal record attributes exactly {Keeper, S, U} to P2 (the revealing player) and the window is open (activeReveals) while Bone Skewer is still resolving", async () => {
    const game = await flippedToPick();
    expect(publicReveals(game)).toEqual([expect.objectContaining({ cardIds: ["keeper", "spS", "unitU"], playerId: P2 })]);
    expect([...(game.gameState.activeReveals ?? [])].sort()).toEqual(["keeper", "spS", "unitU"]);
    // P1's (redacted) copy of the record names them too — they are public right now.
    expect(game.view(P1).state.publicReveals).toEqual([expect.objectContaining({ cardIds: ["keeper", "spS", "unitU"], playerId: P2 })]);
  });

  test("the reveal-and-pick is P1's decision: options = the two UNITS only (S revealed but not pickable), min 0 / allowDecline; the prompt's revealed list carries all three ids in P1's and a spectator's view", async () => {
    const game = await flippedToPick();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, min: 0, seat: P1, semantics: "from-revealed" });
    expect(d?.source).toMatchObject({ cardId: "bs", pendingChoiceType: "reveal-and-pick" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["keeper", "unitU"]);
    for (const viewer of [P1, SPECTATOR] as const) {
      const pc = game.view(viewer).state.pendingChoice as { revealed?: readonly string[] } | undefined;
      expect([...(pc?.revealed ?? [])].sort()).toEqual(["keeper", "spS", "unitU"]);
    }
    await expect(game.p1.pick("spS")).rejects.toThrow();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  });

  test("P1 may decline: nothing is played, Bone Skewer → P1's trash, P2's hand intact and anonymous again to P1, window closed", async () => {
    const game = await flippedToPick();
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["keeper", "spS", "unitU"]);
    expect(game.p2.units()).toEqual([]);
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden", "hidden", "hidden"]);
    expect(game.gameState.activeReveals ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(d) P1 picks Keeper — P2 plays it ignoring any and all costs, yet still DECLARES the optional [calm] (356.5.a, 355.1.a)", () => {
  test("the opt-in is P2's yes/no decision, raised mid-P1's spell while Keeper is a pending play; 'yes' is legal although P2's pool is 0/0", async () => {
    const game = await keeperPicked();
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(d?.source?.cardId).toBe("keeper");
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("keeper")).toBe("chain"); // a pending item — not entered yet
    // rule 354.3: the instructed play continues once the instructing spell has finished resolving — Bone Skewer
    // itself is already off the chain (P1's trash) while P2 walks through Keeper's play steps.
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).not.toContain("bs");
  });

  test("the prompt is decidable from P2's view alone: P2's Observation carries the full yes/no (kind, canAccept, source); P1's carries only a summary without canAccept", async () => {
    const game = await keeperPicked();
    const p2Sees = game.view(P2).decision;
    expect(p2Sees).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(game.p2.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    const p1Sees = game.view(P1).decision;
    expect(p1Sees).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(p1Sees && "canAccept" in p1Sees).toBe(false);
    expect(game.p1.decision()).toBeNull();
    await expect(game.p1.yes()).rejects.toThrow();
  });

  test("opting in costs NOTHING (pool still 0/0), Keeper enters bf1 under P2's control (owner P2), exhausted and STUNNED, and 'if you paid' is satisfied → its draw trigger is P2's item on the chain; Bone Skewer is finished → P1's trash", async () => {
    const game = await keeperPicked();
    await game.p2.yes();
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("keeper")).toMatchObject({ controller: P2, isExhausted: true, isStunned: true, owner: P2, zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toEqual(["keeper"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "keeper", controller: P2, triggered: true, type: "ability" })]);
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.p1.trash()).toContain("bs");
  });

  test("declining the opt-in: still free, Keeper still enters bf1 Stunned under P2, but NO draw trigger is created and P2 draws nothing", async () => {
    const game = await keeperPicked();
    await game.p2.no();
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("keeper")).toMatchObject({ controller: P2, isStunned: true, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p2.hand().sort()).toEqual(["spS", "unitU"]);
    expect(game.zoneOf("drawnD")).toBe("mainDeck");
  });

  test("contrast — played from hand normally the same election costs 2 energy + [calm] and draws 1", async () => {
    const game = await scenario().turn(3).active(P2).resources(P2, { energy: 2, power: { calm: 1 } }).hand(P2, KEEPER, "keeper").deckTop(P2, DRAWN_D, "drawnD").build();
    await game.p2.play("keeper", { payOptional: true });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.p2.hand()).toEqual(["drawnD"]);
  });
});

describe("(e) the draw lands AFTER Bone Skewer finished — the drawn card is never revealed, and the whole hand is private again (424.1.a.3, 424.3.a.1, 128.2.a)", () => {
  test("while Keeper's trigger sits on the chain (Bone Skewer already in the trash) the window is closed: activeReveals empty, P1 sees P2's two remaining hand cards as anonymous", async () => {
    const game = await keeperPicked();
    await game.p2.yes();
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["keeper"]);
    expect(game.gameState.activeReveals ?? []).toEqual([]);
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden", "hidden"]);
  });

  test("after the trigger resolves P2 holds S, U and the drawn D; D is in NO public-reveal entry; P1's view of P2's hand is three anonymous cards and P1's whole Observation names none of them", async () => {
    const game = await keeperPicked();
    await game.p2.yes();
    await game.settle();
    expect(game.p2.hand().sort()).toEqual(["drawnD", "spS", "unitU"]);
    expect(publicReveals(game).flatMap((r) => [...r.cardIds])).not.toContain("drawnD");
    expect(publicReveals(game)).toHaveLength(1);
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden", "hidden", "hidden"]);
    const everything = JSON.stringify({ decision: game.view(P1).decision, zones: game.view(P1).zones });
    for (const face of ["Sigma Sorcery", "Upsilon Brute", "Delta Topdeck", "spS", "unitU", "drawnD"]) {
      expect(everything).not.toContain(face);
    }
    // P1's copy of the historical record is redacted too — knowledge is history, not state.
    expect((game.view(P1).state.publicReveals ?? []).flatMap((r) => [...r.cardIds])).not.toContain("spS");
    expect(game.violations()).toEqual([]);
  });
});

describe("(f) no-side — P2's hand holds no unit", () => {
  // BUG: with no unit in the opponent's hand the engine skips the reveal altogether (no public-reveal entry, P1 never
  // sees S/T). Expected (424.1 / 424.3.a): "An opponent reveals their hand" is unconditional — S and T are presented to
  // all players and recorded as revealed by P2; only the "you may choose a unit" part has nothing to choose.
  test("the hand {S, T} is still revealed to all players and recorded on the public-reveal record attributed to P2 (424.1, 424.3.a)", async () => {
    const game = await board("noUnit").build();
    await game.p1.reveal("bs");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(publicReveals(game)).toEqual([expect.objectContaining({ cardIds: ["spS", "spT"], playerId: P2 })]);
  });

  test("P1 has nothing to pick (at most a decline-only prompt): nothing is played, nothing stunned, Bone Skewer → trash, P2's hand unchanged and anonymous to P1, P1 back in its open main phase", async () => {
    const game = await board("noUnit").build();
    await game.p1.reveal("bs");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d).toMatchObject({ allowDecline: true, options: [], seat: P1 });
    }
    const r = await game.settle(); // declines an empty declinable pick, if any
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["spS", "spT"]);
    expect(game.p2.units()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden", "hidden"]);
    expect(game.gameState.activeReveals ?? []).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  });
});
