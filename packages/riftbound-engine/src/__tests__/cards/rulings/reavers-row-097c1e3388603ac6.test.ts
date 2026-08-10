/**
 * Ruling 097c1e3388603ac6 — Reaver's Row (OGN-285 → ogn-285-298, Battlefield) · "When you defend here, you may move a friendly unit here to base."
 *   × Relentless Storm (ogn-249-298, Volibear legend — the ruling's "Voli legend") · "When you play a [Mighty] unit, you may exhaust me to channel
 *     1 rune exhausted."
 *
 * Q: Are all triggers mandatory (always go on the chain and choose targets), with "may" only deciding at resolution whether to apply — or can a
 *    trigger be truly optional and never go on the chain?
 * A (riftjudge): every trigger goes on the chain when its condition is met, targets are chosen then, and a "may" is decided at RESOLUTION
 *    (Reaver's Row: must target a unit if able, decide the move on resolution; Voli: goes on the chain, decide at resolution).
 *    Current CR 383.3.a/383.3.a.2/383.3.b: a LEADING "you may" is decided during FINALIZATION (declined ⇒ removed from the chain and treated
 *    as not having triggered); a cost right after it is the base cost, paid to finalize; only a LATER "may" waits for resolution (383.3.a.3).
 *    The engine follows the CR — the conflicting facets are marked RULING-CONFLICT; the shared facts (the ability IS put on the chain as an item,
 *    its target IS chosen up front and is compulsory when options exist) are asserted as ruled.
 * Rules: 383.3, 383.3.a / .a.1 / .a.2 / .a.3, 383.3.b, 402.2 / 402.4.b.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const RELENTLESS_STORM = "ogn-249-298";

/** P2's turn. P1 holds the LIVE Reaver's Row with Big (3) and Small (2); P2's Raider (5) attacks from base. */
function rowBoard() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 3, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

async function raiderAttacks(): Promise<Game> {
  const game = await rowBoard().build();
  await game.p2.move("raider", "row");
  expect(game.state("big").combatRole).toBe("defender");
  return game;
}

describe("Ruling 097c1e3388603ac6 — how 'you may' triggers use the chain (Reaver's Row, Relentless Storm)", () => {
  test("Reaver's Row: defending DOES put the ability on the chain — a Row item (P1's, triggered) exists the moment the attack lands, before anyone has priority, and P1 is asked about it at once (timing FIN)", async () => {
    const game = await raiderAttacks();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
    expect(game.locationOf("big")).toBe("row");
    expect(game.locationOf("small")).toBe("row");
  });

  test("opting in, the TARGET is chosen up front and is compulsory (402.4.b): a forced pick (no decline) between the friendly units here; the item is then finalized carrying that target and only now does a priority window open", async () => {
    const game = await raiderAttacks();
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, seat: P1, semantics: "target", source: { cardId: "row" }, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["big", "small"]);
    await game.p1.pick("small");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", targets: ["small"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.locationOf("small")).toBe("row"); // nothing moves until resolution
  });

  // RULING-CONFLICT: riftjudge 097c1e3388603ac6 says the "may" is decided only at RESOLUTION ("only at resolution do you choose whether or not to
  // move that unit"); CR 383.3.a / 383.3.a.1 say a leading "you may" is decided during FINALIZATION and is solely whether to perform the ability —
  // engine follows CR: having opted in, resolution moves the chosen unit with no second question.
  test("once opted in there is NO further 'move it?' at resolution (CR 383.3.a.1): both pass and Small simply goes to base", async () => {
    const game = await raiderAttacks();
    await game.p1.yes();
    await game.p1.pick("small");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    expect(game.locationOf("big")).toBe("row");
  });

  // RULING-CONFLICT: riftjudge 097c1e3388603ac6 says there are no "truly optional" triggers — it must stay on the chain and be resolved; CR
  // 383.3.a.2 says a leading-"may" trigger declined during finalization "is removed from the chain and considered to have not triggered" —
  // engine follows CR.
  test("declining at finalization removes the item outright (CR 383.3.a.2): no target is asked, the chain is empty, nobody moves, and the showdown just continues", async () => {
    const game = await raiderAttacks();
    await game.p1.no();
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("row");
    expect(game.locationOf("big")).toBe("row");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("Relentless Storm ('you may exhaust me to …', no targets): playing a Mighty unit DOES create a chain item for it, asked about at once (FIN) — it is not silently skippable-without-asking, nor an activation", async () => {
    const game = await scenario().legend(P1, RELENTLESS_STORM, "voli").resources(P1, { energy: 5 }).hand(P1, { cardType: "unit", energyCost: 5, might: 5, name: "Big Bear" }, "bear").build();
    expect(game.p1.can("activate", "voli")).toBe(false);
    await game.p1.play("bear");
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "voli", controller: P1, triggered: true }));
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "voli" }, timing: "FIN" });
  });

  // RULING-CONFLICT: riftjudge 097c1e3388603ac6 says the Voli legend's "may" (and its exhaust) is applied at RESOLUTION; CR 383.3.b makes
  // "exhaust me" — the cost right after the leading "you may" — the trigger's BASE COST paid at finalization (383.3.b.1) — engine follows CR.
  test("Relentless Storm: 'yes' pays the exhaust immediately at FINALIZATION (legend exhausted while the item is still on the chain); the channel happens on resolution; 'no' would have removed the item", async () => {
    const game = await scenario().legend(P1, RELENTLESS_STORM, "voli").resources(P1, { energy: 5 }).hand(P1, { cardType: "unit", energyCost: 5, might: 5, name: "Big Bear" }, "bear").build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("bear");
    await game.p1.yes();
    expect(game.state("voli").isExhausted).toBe(true);
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "voli", triggered: true }));
    expect(game.p1.runes()).toHaveLength(runesBefore); // not channeled yet
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1); // channeled exhausted

    const declined = await scenario().legend(P1, RELENTLESS_STORM, "voli").resources(P1, { energy: 5 }).hand(P1, { cardType: "unit", energyCost: 5, might: 5, name: "Big Bear" }, "bear").build();
    await declined.p1.play("bear");
    await declined.p1.no();
    expect(declined.chain().some((c) => c.cardId === "voli")).toBe(false);
    expect(declined.state("voli").isReady).toBe(true);
    await declined.settle();
    expect(declined.p1.runes()).toHaveLength(runesBefore);
  });
});
