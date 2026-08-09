/**
 * Interaction: Svellsongur (sfd-059-221) on Watchful Sentry (ogn-096-298), later moved by Angle Shot
 * (sfd-011-221) onto a vanilla unit — a PARTIAL copy effect living in an Equipment's effect text.
 *
 *   Svellsongur — Equipment · Calm · 3 + [calm] · +0 Might
 *     "[Equip] [1][calm]. As this is attached to a unit, copy that unit's text to this Equipment's
 *      effect text for as long as this is attached to it."
 *   Watchful Sentry — Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   Angle Shot — Spell · Fury · 2 · Reaction — "Choose a unit and an Equipment with the same
 *     controller. Attach that Equipment to that unit or detach that Equipment from that unit. Draw 1."
 *   Brute — inline vanilla 4-Might unit (no text). Wall — inline 6-Might enemy blocker at bf2.
 *
 * Rulings under test:
 *  (a) Svellsongur copies only the specified trait — rules text — into its own Effect Text
 *      (477.1.b.2); an attached card's Effect Text abilities are appended to the wearer's rules text
 *      (718.3 / 477.2.c). Sentry therefore carries TWO instances of "[Deathknell] — Draw 1" and each
 *      triggers separately (808.2) → P1 draws 2. Both triggers are noted before Sentry leaves the
 *      board, with Svellsongur still attached (323.4 / 808.1.d.2-3), so the Equipment falling off
 *      afterwards (recalled to base unattached, 457.1) removes neither.
 *  (b) "for as long as this is attached to IT": Angle Shot attaching it to Brute detaches it from
 *      Sentry (434.1.f) — the Sentry copy ends (435.1.c) and the "As this is attached" replacement
 *      applies to the new attachment (370.1.b), copying BRUTE's (empty) text. Brute gains nothing —
 *      certainly not Deathknell; Sentry is back to a single Deathknell.
 *  (c) Unlike Shady Spectacles ("becomes a copy", 477.1.b.1) Svellsongur copies text only and onto
 *      itself: Sentry keeps its own name, cost and 1 Might (+0 bonus, 718.4).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const WATCHFUL_SENTRY = "ogn-096-298";
const ANGLE_SHOT = "sfd-011-221";

/**
 * P1's turn. P1: Watchful Sentry + vanilla Brute (4) in base, Svellsongur unattached in base, Angle Shot in
 * hand; 3 energy + 1 calm (Equip [1][calm] + Angle Shot [2]). P2: a 6-Might Wall holding bf2 (anything P1
 * walks into it dies), bf1 is P1's and empty.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "base", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
    .gear(P1, SVELLSONGUR, "sv")
    .hand(P1, ANGLE_SHOT, "shot");
}

/** Activate Svellsongur's [Equip] onto `unit` and let it resolve. */
async function equip(game: Game, unit: string): Promise<void> {
  expect(game.p1.can("equipCard")).toBe(true);
  await game.p1.choose("equipCard:-", { params: { equipmentId: "sv", unitId: unit } });
  await game.settle();
  expect(game.state("sv").attachedTo).toBe(unit);
}

/** Walk `unit` from base into the 6-Might Wall at bf2 and resolve the combat (it dies). */
async function suicideIntoWall(game: Game, unit: string): Promise<void> {
  await game.p1.move(unit, "bf2");
  await game.settle();
  expect(game.zoneOf(unit)).toBe("trash");
  expect(game.zoneOf("wall")).toBe("battlefield-bf2");
}

describe("Svellsongur × Watchful Sentry × Angle Shot — a text-only copy and its Deathknell", () => {
  // ---------------------------------------------------------------- (c) / setup
  test("(c) equipped Sentry keeps its OWN identity — name 'Watchful Sentry', cost 2, 1 Might (+0 bonus, 718.4), printed Deathknell; Svellsongur stays 'Svellsongur' and records Sentry as its copy source (477.1.b.2, not 477.1.b.1)", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0 } });
    expect(game.state("sentry")).toMatchObject({
      attachments: ["sv"],
      baseMight: 1,
      energyCost: 2,
      might: 1,
      name: "Watchful Sentry",
    });
    expect(game.state("sentry").keywords).toContain("Deathknell");
    expect(game.state("sv")).toMatchObject({ attachedTo: "sentry", cardType: "equipment", name: "Svellsongur" });
    expect(game.state("sv").meta.copiedFromCardId).toBe("sentry");
    expect(game.state("brute")).toMatchObject({ keywords: [], might: 4, name: "Brute" });
  });

  test("control: an UNEQUIPPED Watchful Sentry dying in combat draws exactly 1", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await suicideIntoWall(game, "sentry");
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.state("sv").attachedTo).toBeUndefined();
  });

  // ---------------------------------------------------------------- (a)
  // Expected (477.1.b.2 + 718.3 + 808.2): the wearer has its printed Deathknell AND the appended copy in
  // Svellsongur's effect text — two instances, two triggers, two draws, both noted before the unit (still
  // wearing the Equipment) is put in the trash (808.1.d.2-3). Actual: only the printed Deathknell fires
  // (hand +1); the copied die-trigger never reaches the chain, although the same copy does double a
  // "When I move" trigger.
  test("(a) Sentry wearing Svellsongur dies in combat → P1 draws 2 (two Deathknell instances, 808.2); engine draws 1", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    const hand = game.p1.hand().length;
    await suicideIntoWall(game, "sentry");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 2);
  });

  test("(a) the Equipment falling off does not matter for what already triggered: after the death Svellsongur is recalled to P1's base unattached with its copy dissolved (457.1 / 435.1.c), Sentry is its printed self in the trash, and at least the printed Deathknell drew", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    const hand = game.p1.hand().length;
    await suicideIntoWall(game, "sentry");
    expect(game.zoneOf("sv")).toBe("base");
    expect(game.state("sv").attachedTo).toBeUndefined();
    expect(game.state("sv").meta.copiedFromCardId).toBeUndefined();
    expect(game.state("sv").controller).toBe(P1);
    expect(game.state("sentry")).toMatchObject({ attachments: [], name: "Watchful Sentry", zone: "trash" });
    expect(game.p1.hand().length).toBeGreaterThanOrEqual(hand + 1);
    expect(game.violations()).toEqual([]);
  });

  test("(a) the Deathknell trigger(s) are chain items sourced from Sentry that P2 may respond to before any card is drawn (808.1.d.2)", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    const hand = game.p1.hand().length;
    await game.p1.move("sentry", "bf2");
    await game.p1.pass(); // showdown: attacker passes Focus
    await game.p2.pass(); // defender passes → combat damage, Sentry dies, Deathknell goes on the chain
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder(); // 808.2.a — two same-controller triggers may be offered for ordering
    }
    const knells = game.chain().filter((c) => c.cardId === "sentry" && c.triggered);
    expect(knells.length).toBeGreaterThanOrEqual(1);
    expect(knells[0]).toMatchObject({ controller: P1, type: "ability" });
    expect(game.zoneOf("sentry")).toBe("trash"); // already dead — the trigger outlives its source
    expect(game.p1.hand()).toHaveLength(hand); // nothing drawn before resolution
    // P2 gets a priority window on it.
    for (let i = 0; i < 4 && game.actingSeat() !== P2; i++) {
      await game.acting().pass();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  // ---------------------------------------------------------------- (b)
  test("(b) Angle Shot offers the same-controller pairs [Brute, Svellsongur] and [Sentry, Svellsongur]; choosing Brute ATTACHES it there, which detaches it from Sentry (434.1.f); P1 draws 1 from Angle Shot", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    const targets = game.p1.option("cast", "shot")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets).toEqual(expect.arrayContaining([["brute", "sv"], ["sentry", "sv"]]));
    expect(targets).not.toContainEqual(["wall", "sv"]); // different controllers
    const hand = game.p1.hand().length;
    await game.p1.cast("shot", { targets: ["brute", "sv"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("shot")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.state("sv").attachedTo).toBe("brute");
    expect(game.state("brute").attachments).toEqual(["sv"]);
    expect(game.state("sentry").attachments).toEqual([]);
  });

  test("(b) the copy now follows the NEW wearer: Svellsongur's source is Brute (blank text) — Brute stays a 4-Might vanilla with NO Deathknell, and Sentry is back to its single printed Deathknell (435.1.c / 370.1.b)", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    await game.p1.cast("shot", { targets: ["brute", "sv"] });
    await game.settle();
    expect(game.state("sv").meta.copiedFromCardId).toBe("brute"); // not "sentry", not undefined
    expect(game.state("brute")).toMatchObject({ grantedKeywords: [], keywords: [], might: 4, name: "Brute" });
    expect(game.state("brute").keywords).not.toContain("Deathknell");
    expect(game.state("sentry")).toMatchObject({ keywords: ["Deathknell"], might: 1, name: "Watchful Sentry" });
  });

  test("(b) proof by dying — Brute wearing the ex-Sentry Svellsongur dies in combat: P1 draws NOTHING (no borrowed Deathknell); Svellsongur is recalled to base blank", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    await game.p1.cast("shot", { targets: ["brute", "sv"] });
    await game.settle();
    const hand = game.p1.hand().length;
    await suicideIntoWall(game, "brute"); // 4 into 6
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sv")).toBe("base");
    expect(game.state("sv").attachedTo).toBeUndefined();
    expect(game.state("sv").meta.copiedFromCardId).toBeUndefined();
  });

  test("(b) …and the now-bare Sentry dying afterwards draws exactly 1 — its second (copied) instance left with the Equipment", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    await game.p1.cast("shot", { targets: ["brute", "sv"] });
    await game.settle();
    const hand = game.p1.hand().length;
    await suicideIntoWall(game, "sentry"); // 1 into 6
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.state("sv").attachedTo).toBe("brute"); // Brute (in base) still wears it
    expect(game.state("sv").meta.copiedFromCardId).toBe("brute");
  });
});
