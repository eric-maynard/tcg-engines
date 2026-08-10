/**
 * Interaction: Volibear, Furious (ogn-041-298) · Champion Unit · Fury · 10 · 9 Might
 *     "[Deflect 2] When I attack, deal 5 damage split among any number of enemy units here."
 *   × Teemo, Scout (ogn-197-298) · Champion Unit · Chaos · 2 · 1 Might
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].) When you play me, give me +3 [Might] this turn."
 *   × vanilla R (3 Might) — P2's holder of bf2.
 *
 * Question: P2 controls bf2 with R (3) and hid Teemo, Scout there last turn. P1 moves Volibear (9) to bf2.
 *   (a) When Volibear's attack trigger is FINALIZED P1 must choose the split TARGETS now: are the offered
 *       candidates exactly {R} — the facedown card is not a unit and its identity is absent from P1's view —
 *       so the decision is fully computable from P1's redacted view (the seat's payload = game.view(P1).decision)?
 *   (b) P2, holding priority, flips Teemo to bf2 (public, 1+3 = 4, a defender). When Volibear's trigger then
 *       resolves, is the split confined to the locked target R (all 5 to R; Teemo cannot be added)?
 *   (c) At the Combat Damage Step does P1's combat-damage ASSIGNMENT include Teemo (and R only if alive) —
 *       i.e. the two prompt kinds diverge: the split excludes the late unit, combat assignment includes it?
 *   (d) Control: had Teemo already been face up at bf2 when the trigger finalized, it would be a legal
 *       split target.
 *
 * Rules: 355.14.a/b (split recipients are Targets chosen at finalization), 355.14.e/f (amounts decided at
 * resolution among the locked targets, each ≥ 1), 421.3 (a facedown card is not a unit on the board),
 * 128.4 / 107.3.f (facedown cards are private), 421.4 / 108.1.b (played from facedown → public), 811.6 /
 * 811.1.d.1 (Hidden: play as a Reaction for 0, a permanent goes to THAT battlefield), 465 (combat damage
 * is assigned among the units actually in the combat at the damage step — not targeting).
 *
 * Expected: (a) candidates = {R}; P1's view shows one anonymous facedown placeholder and never Teemo's id /
 * name / def id; the seat's decision equals view(P1).decision. (b) the flip is legal for 0; Teemo is public,
 * a 4-Might defender; Volibear's trigger resolves with R as its only recipient (no prompt can add Teemo):
 * R takes 5 and dies, Teemo takes 0. (c) combat: Volibear's 9 is assigned to Teemo (sole defender) — Teemo
 * dies, Volibear takes 4 and conquers bf2; with a sturdier R (12) that survives the split, P1's assignment
 * prompt lists BOTH R and Teemo although the split offered only R. (d) face-up Teemo is offered (no Deflect)
 * alongside R and can be given split damage.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const VOLIBEAR = "ogn-041-298";
const TEEMO_SCOUT = "ogn-197-298";

/** P1's turn 2. bf2: P2's vanilla R (`rMight`) + P2's facedown Teemo, Scout (hidden on an earlier turn). Volibear ready in P1's base. */
function board(rMight = 3) {
  return scenario()
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: rMight, name: "Vanilla R" }, "R")
    .facedown(P2, "bf2", TEEMO_SCOUT, "teemo")
    .unit(P1, "base", VOLIBEAR, "voli");
}

/** (d) control: the same bf2 but Teemo is already face up there (flipped earlier this turn: 1 + 3 = 4). */
function faceUpBoard() {
  return scenario()
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Vanilla R" }, "R")
    .unit(P2, "bf2", TEEMO_SCOUT, "teemo", { mightModifier: 3 })
    .unit(P1, "base", VOLIBEAR, "voli");
}

const pickCards = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []);
const mentionsTeemo = (game: Game): boolean => {
  const s = JSON.stringify(game.view(P1));
  return s.includes("teemo") || s.includes("Teemo") || s.includes(TEEMO_SCOUT);
};

/** Volibear attacks bf2, P1 locks R (the only candidate) and passes priority → P2 holds priority with the trigger on the chain. */
async function atP2Priority(rMight = 3): Promise<Game> {
  const game = await board(rMight).build();
  await game.p1.move("voli", "bf2");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, targeting: "split-targets", timing: "FIN" });
  await game.p1.pick("R");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", targets: ["R"], triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/**
 * …P2 flips Teemo; every chain item then resolves (Teemo's +3, then Volibear's split) by passing priority,
 * recording every Decision seen until the showdown's Focus window (or anything that is not a chain pass).
 */
async function flipAndResolveChain(game: Game): Promise<Decision[]> {
  await game.p2.reveal("teemo");
  const seen: Decision[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    seen.push(d);
    if (d.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.acting().passPriority();
  }
  return seen;
}

/** Pass Focus for whoever holds it until something that is not a showdown pass appears; returns every Decision seen. */
async function closeShowdownWatching(game: Game): Promise<Decision[]> {
  const seen: Decision[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    seen.push(d);
    if (d.kind !== "action" || d.context !== "showdown" || !d.passKey) {
      break;
    }
    await game.acting().pass();
  }
  return seen;
}

describe("Volibear, Furious into bf2 (R + facedown Teemo, Scout) — split targets lock at finalization; combat assignment does not", () => {
  // ---- (a) finalization: candidates and information ------------------------------------------------

  test("(a) premise: before the move P1's view of bf2 shows R by identity and ONE anonymous facedown placeholder — no id, name or def id of Teemo anywhere in P1's observation (128.4, 107.3.f)", async () => {
    const game = await board().build();
    const bf2 = game.view(P1).battlefields.find((b) => b.id === "bf2");
    expect(bf2).toMatchObject({ controller: P2, facedownCount: 1 });
    expect(bf2?.units.map((u) => ("id" in u ? u.id : "?"))).toEqual(["R"]);
    const facedown = game.view(P1).zones["facedown-bf2"] ?? [];
    expect(facedown).toHaveLength(1);
    expect(isHiddenView(facedown[0]!)).toBe(true);
    expect(facedown[0]).toEqual({ hidden: true, index: 0, owner: P2, zone: "facedown-bf2" });
    expect(mentionsTeemo(game)).toBe(false);
    // P2, the owner, does see it.
    expect(JSON.stringify(game.view(P2).zones["facedown-bf2"])).toContain("teemo");
  });

  test("(a) Volibear's attack trigger is finalized at once: P1 gets a split-TARGETS pick (timing FIN, no amounts) whose candidates are exactly {R} — the facedown card is not an 'enemy unit here' (355.14.b, 421.3)", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf2");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", targeting: "split-targets", timing: "FIN", source: { cardId: "voli" } });
    expect(pickCards(d)).toEqual(["R"]);
    expect(d?.kind === "pick" ? d.max : -1).toBe(1);
    expect((await game.p1.try((p) => p.pick("teemo"))).ok).toBe(false); // cannot name the hidden card
    expect(game.decision()?.kind).toBe("pick"); // still asking
    expect(game.zoneOf("teemo")).toBe("facedown-bf2");
  });

  test("(a) that decision is computable from P1's redacted view alone: the seat's decision payload deep-equals game.view(P1).decision, and the whole P1 observation still carries no trace of Teemo", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf2");
    expect(game.p1.decision()).toEqual(game.view(P1).decision as Decision);
    expect(game.p1.view().decision).toEqual(game.view(P1).decision);
    expect(mentionsTeemo(game)).toBe(false);
    // P2 only sees a summary of P1's pending decision, not its options.
    expect(game.view(P2).decision).toMatchObject({ kind: "pick", seat: P1 });
    expect((game.view(P2).decision as { options?: unknown }).options).toBeUndefined();
  });

  test("(a) locking {R} puts the trigger on the chain with targets [R]; P1 then P2 receive priority — and P2's menu now lists the flip of the facedown card (811.6)", async () => {
    const game = await atP2Priority();
    expect(game.p2.legal().map((o) => o.key)).toContain("revealHidden:teemo");
    expect(game.p2.can("reveal", "teemo")).toBe(true);
    expect(mentionsTeemo(game)).toBe(false); // still private until played
  });

  // ---- (b) the flip and the split's resolution ------------------------------------------------------

  test("(b) P2 flips Teemo for 0 as a Reaction: it is played TO bf2 (811.1.d.1), is public in P1's view from that moment (421.4, 108.1.b), joins the combat as a DEFENDER, and its 'When you play me' lands above Volibear's trigger", async () => {
    const game = await atP2Priority();
    const before = game.p2.resources();
    await game.p2.reveal("teemo");
    expect(game.p2.resources()).toEqual(before); // paid nothing
    expect(game.zoneOf("teemo")).toBe("battlefield-bf2");
    expect(game.state("teemo")).toMatchObject({ combatRole: "defender", controller: P2, isHidden: false, location: "bf2" });
    expect(mentionsTeemo(game)).toBe(true);
    expect(game.view(P1).battlefields.find((b) => b.id === "bf2")).toMatchObject({ facedownCount: 0 });
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual([
      ["voli", true],
      ["teemo", true],
    ]);
    expect(game.chain()[0]?.targets).toEqual(["R"]); // the locked set did not grow
  });

  test("(b) Teemo's trigger resolves first (LIFO): Teemo is a 4-Might defender while Volibear's split is still on the chain with targets [R]", async () => {
    const game = await atP2Priority();
    await game.p2.reveal("teemo");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Teemo's +3 resolves
    expect(game.state("teemo")).toMatchObject({ baseMight: 1, combatRole: "defender", might: 4 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", targets: ["R"] })]);
    expect(game.state("R").damage).toBe(0);
  });

  test("(b) Volibear's trigger resolves among the LOCKED targets only: no prompt ever offers Teemo as a recipient, the single locked target R takes all 5 and dies (3 Might), Teemo is untouched (355.14.b/e/f)", async () => {
    const game = await atP2Priority();
    const seen = await flipAndResolveChain(game);
    const splitPrompts = seen.filter((d) => d.kind === "distribute" || (d.kind === "pick" && d.seat === P1));
    for (const d of splitPrompts) {
      const cards = d.kind === "distribute" ? d.buckets.map((b) => b.card) : d.options.map((o) => o.card);
      expect(cards).not.toContain("teemo");
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("R")).toBe("trash");
    const toR = (game.gameState.damageLog ?? []).filter((r) => r.target === "R");
    expect(toR).toEqual([expect.objectContaining({ amount: 5, combat: false, source: expect.objectContaining({ cardId: "voli", kind: "ability" }) })]);
    expect(game.state("teemo")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf2" });
    expect((game.gameState.damageLog ?? []).filter((r) => r.target === "teemo")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // combat continues, damage step not yet
  });

  // ---- (c) combat damage assignment includes the late defender --------------------------------------

  test("(c) Combat Damage Step: Teemo — never a split candidate — is now the (sole) defender and receives Volibear's 9 combat damage; Teemo (4) dies, Volibear takes 4 and survives, P1 conquers bf2 for 1 point (465)", async () => {
    const game = await atP2Priority();
    await flipAndResolveChain(game);
    await game.settle(); // both pass Focus → damage step → resolution
    const combatHits = (game.gameState.damageLog ?? []).filter((r) => r.combat);
    expect(combatHits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amount: 9, source: expect.objectContaining({ kind: "combat", player: P1 }), target: "teemo" }),
        expect.objectContaining({ amount: 4, source: expect.objectContaining({ kind: "combat", player: P2 }), target: "voli" }),
      ]),
    );
    expect(combatHits.some((r) => r.target === "R")).toBe(false); // R was already dead
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.zoneOf("voli")).toBe("battlefield-bf2");
    expect(game.state("voli")).toMatchObject({ combatRole: null, damage: 0 }); // healed at combat cleanup
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) the two prompt kinds diverge — with a 12-Might R that survives the split (5 marked), P1's combat ASSIGNMENT `distribute` lists BOTH R and Teemo (lethal 7 / 4, total 9) although the split's candidates were only {R}", async () => {
    const game = await atP2Priority(12);
    await flipAndResolveChain(game);
    expect(game.state("R")).toMatchObject({ damage: 5, zone: "battlefield-bf2" });
    expect(game.state("teemo")).toMatchObject({ combatRole: "defender", damage: 0, might: 4 });
    const seen = await closeShowdownWatching(game);
    const assign = seen.find((d) => d.kind === "distribute" && d.seat === P1);
    expect(assign).toMatchObject({ kind: "distribute", seat: P1, total: 9 });
    const buckets = assign?.kind === "distribute" ? assign.buckets.map((b) => [b.card ?? b.key, b.lethal]) : [];
    expect(buckets.toSorted()).toEqual(
      [
        ["R", 7],
        ["teemo", 4],
      ].toSorted(),
    );
    // Teemo can be killed with combat damage it could never have been split-targeted with.
    await game.p1.distribute({ R: 5, teemo: 4 });
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.state("R")).toMatchObject({ zone: "battlefield-bf2" }); // 5 + 5 = 10 < 12
    expect(game.zoneOf("voli")).toBe("trash"); // 12 + 4 = 16 ≥ 9
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("(c) information audit: across the whole sequence P1's observation names Teemo only from the flip onward — never while it was facedown", async () => {
    const game = await board().build();
    expect(mentionsTeemo(game)).toBe(false);
    await game.p1.move("voli", "bf2");
    expect(mentionsTeemo(game)).toBe(false); // finalize-time pick pending
    await game.p1.pick("R");
    expect(mentionsTeemo(game)).toBe(false);
    await game.p1.passPriority();
    expect(mentionsTeemo(game)).toBe(false);
    await game.p2.reveal("teemo");
    expect(mentionsTeemo(game)).toBe(true);
    expect(JSON.stringify(game.view(P1).chain)).toContain("teemo");
  });

  // ---- (d) control: Teemo already face up ----------------------------------------------------------

  test("(d) control: with Teemo already FACE UP at bf2 when the trigger finalizes, the split-targets pick offers {R, Teemo} (max 2, no Deflect surcharge on either) — the exclusion in (b) is about lock-in timing, not about Teemo", async () => {
    const game = await faceUpBoard().build();
    expect(game.state("teemo")).toMatchObject({ isHidden: false, might: 4, zone: "battlefield-bf2" });
    await game.p1.move("voli", "bf2");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, targeting: "split-targets", timing: "FIN" });
    expect(pickCards(d)).toEqual(["R", "teemo"]);
    expect(d?.kind === "pick" ? d.max : -1).toBe(2);
    expect(d?.kind === "pick" ? d.options.every((o) => (o.deflect ?? 0) === 0) : false).toBe(true);
  });

  test("(d) control: locking {R, Teemo} yields a resolution-time `distribute` over exactly those two (total 5, each ≥ 1); 3 to R + 2 to Teemo kills R (3) and leaves Teemo (4) on 2 damage going into combat", async () => {
    const game = await faceUpBoard().build();
    await game.p1.move("voli", "bf2");
    await game.p1.pick("R", "teemo");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", targets: expect.arrayContaining(["R", "teemo"]) })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, timing: "RES", total: 5, source: { cardId: "voli" } });
    expect(d?.kind === "distribute" ? d.buckets.map((b) => [b.card, b.min]).toSorted() : []).toEqual([
      ["R", 1],
      ["teemo", 1],
    ]);
    await game.p1.distribute({ R: 3, teemo: 2 });
    expect(game.zoneOf("R")).toBe("trash");
    expect(game.state("teemo")).toMatchObject({ combatRole: "defender", damage: 2, zone: "battlefield-bf2" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });
});
