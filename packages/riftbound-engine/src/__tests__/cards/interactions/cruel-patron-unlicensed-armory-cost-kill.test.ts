/**
 * Interaction: Cruel Patron (ogn-208-298) · Unit · Order · 4 · 6 Might
 *     "As an additional cost to play me, kill a friendly unit."
 *   × Unlicensed Armory (ogn-023-298) · Gear · Fury · 2
 *     "Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die this turn, you may
 *      pay [fury] to heal it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)"
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla) — the shielded victim.
 *
 * Rules: 356.2.a.1 (a "kill a friendly unit" additional cost without "may" is MANDATORY), 357.2 (it
 * is paid in step 4 of the play), 428.1.a.1 (paying it is a Kill instruction → a "would die" event),
 * 390.3 (the Armory installs a DELAYED replacement watching "the next time it would die this turn"),
 * 371.2 / 371.2.a (a "you may" replacement: its controller chooses whether to apply it WHEN the event
 * occurs), 371.2.b (declined → not applied), 370.1.a.1 (a replaced death = the kill never happened;
 * the unit never reaches the trash), 357.2.a (a cost replaced by a replacement effect is STILL PAID —
 * the CR's own Cruel Patron example, there with Zhonya's; here with an optional, costed, delayed
 * replacement instead).
 *
 * Question: P1's turn, 4 energy + 1 fury. P1 activates Unlicensed Armory on their damaged Vanguard
 * Sergeant at bf1, then plays Cruel Patron naming the Sergeant as the kill-cost.
 *   (a) P1 must be asked "pay [fury]?" in the middle of paying Patron's costs. Pay → 1 fury spent;
 *       Sergeant healed, exhausted, recalled to base (never in trash); the cost still counts as paid,
 *       4 energy spent, Patron enters base. Trash holds only the discarded card.
 *   (b) Decline → Sergeant dies to trash, cost paid, Patron enters; fury untouched.
 *   (c) 0 fury → nothing payable, Sergeant dies, Patron enters.
 *   In no branch is the play rewound or made illegal.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CRUEL_PATRON = "ogn-208-298";
const UNLICENSED_ARMORY = "ogn-023-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — discard fodder for the Armory's cost

/** 0-cost "deal 3" used only by the control test to prove the shield is live on the Sergeant. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
};

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1: 4 energy + `fury` fury, Unlicensed Armory (ready) in base, a Vanguard Sergeant with
 * 2 damage at bf1 (P1 controls bf1), a filler card to discard and Cruel Patron in hand.
 * P2: an untouchable bystander in base (must never be a kill candidate).
 */
function board(fury = 1) {
  return scenario()
    .resources(P1, { energy: 4, power: { fury } })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, UNLICENSED_ARMORY, "armory")
    .unit(P1, "bf1", VANGUARD_SERGEANT, "sarge", { damage: 2 })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, FILLER, "junk")
    .hand(P1, CRUEL_PATRON, "patron");
}

/** Activate the Armory (discard junk, exhaust) choosing the Sergeant, and let the ability resolve. */
async function shieldSergeant(game: Game): Promise<void> {
  await game.p1.activate("armory", 0, { discard: "junk", targets: ["sarge"] });
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("junk")).toBe("trash");
  expect(game.state("armory").isExhausted).toBe(true);
}

describe("Cruel Patron × Unlicensed Armory — optional costed replacement on the cost-kill (357.2.a, 371.2)", () => {
  // ── premise / controls ─────────────────────────────────────────────────────────────────────

  test("premise: after the Armory resolves the Sergeant is still a damaged (2) ready unit at bf1, fury unspent, 4 energy left", async () => {
    const game = await board().build();
    await shieldSergeant(game);
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge")).toMatchObject({ damage: 2, isExhausted: false, controller: P1 });
    expect(game.p1.power("fury")).toBe(1); // [fury] is only asked for when the death event happens
    expect(game.p1.energy()).toBe(4);
  });

  test("control: the shield IS live on the Sergeant at bf1 — a lethal spell surfaces P1's 'pay [fury]?' yes/no; paying heals, exhausts and recalls it to base (371.2.a, 390.3)", async () => {
    const game = await board().hand(P1, BOLT, "bolt").build();
    await shieldSergeant(game);
    await game.p1.cast("bolt", { targets: "sarge" }); // 2 + 3 = 5 ≥ 4 Might → would die
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.state("sarge")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.trash()).not.toContain("sarge");
  });

  test("Cruel Patron's kill-cost offers only FRIENDLY units: the Sergeant is a candidate, P2's Bystander is not (356.2.a.1)", async () => {
    const game = await board().build();
    await shieldSergeant(game);
    const field = game.p1.option("play", "patron")?.fields.find((f) => f.arg === "sacrifice");
    expect(field).toBeDefined();
    expect(field?.required).toBe(true); // mandatory — no "may"
    expect(field?.options ?? []).toEqual(["sarge"]);
    await expect(game.p1.play("patron", { sacrifice: "foe", to: "base" })).rejects.toThrow();
    expect(game.zoneOf("patron")).toBe("hand");
  });

  // ── (a) pay [fury]: the cost-kill is replaced, yet still paid ─────────────────────────────

  // Expected (371.2.a, 390.3, 428.1.a.1): killing the Sergeant to pay Patron's additional cost is a
  // "would die" event the Armory's delayed replacement watches; because it says "you may pay [fury]",
  // P1 must be asked — a yes/no (payable) decision for P1 sourced from the Armory, surfaced while
  // Patron is still being played (not yet on the board). Actual: the engine pays the kill-cost without
  // consulting the optional replacement — no prompt, the Sergeant goes straight to the trash.
  test("(a) paying the kill-cost surfaces P1's optional 'pay [fury]?' decision mid-play, before Patron is on the board (371.2.a)", async () => {
    const game = await board().build();
    await shieldSergeant(game);
    await game.p1.play("patron", { sacrifice: "sarge", to: "base" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true });
    expect(d?.kind === "yes-no" ? d.source?.cardId : undefined).toBe("armory");
    // Timing: we are inside Patron's cost payment — the Sergeant has not died, Patron has not entered.
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.zoneOf("patron")).not.toBe("base");
    expect(game.p1.power("fury")).toBe(1);
  });

  // Expected (370.1.a.1, 454): paying replaces the death — Sergeant healed to 0, exhausted, recalled
  // from bf1 to P1's base; it never touches the trash; 1 fury spent. Actual: no prompt; Sergeant dies.
  test("(a) pay → Sergeant is healed (0 damage), exhausted and recalled to P1's base; never in the trash; fury 1 → 0 (370.1.a.1)", async () => {
    const game = await board().build();
    await shieldSergeant(game);
    await game.p1.play("patron", { sacrifice: "sarge", to: "base" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.locationOf("sarge")).toBe("base");
    expect(game.state("sarge")).toMatchObject({ damage: 0, isExhausted: true, controller: P1 });
    expect(game.p1.units("base")).toContain("sarge");
    expect(game.p1.units("bf1")).not.toContain("sarge");
    expect(game.p1.trash()).not.toContain("sarge");
    expect(game.p1.power("fury")).toBe(0);
  });

  // Expected (357.2.a): the replaced cost is still PAID — Patron's play continues: 4 energy spent, it
  // enters P1's base (exhausted); P1 ends with Sergeant + Patron on the board and only the discarded
  // filler in the trash. Actual: no prompt is ever offered, so this branch cannot be reached.
  test("(a) pay → the replaced cost still counts as paid: 4 energy spent, Cruel Patron enters base; P1 keeps BOTH units; trash = [junk] only (357.2.a)", async () => {
    const game = await board().build();
    await shieldSergeant(game);
    await game.p1.play("patron", { sacrifice: "sarge", to: "base" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.state("patron").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(new Set(game.p1.units("base"))).toEqual(new Set(["sarge", "patron"]));
    expect(game.p1.trash()).toEqual(["junk"]);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("foe")).toBe("base"); // only one replacement, nothing else died
  });

  // ── (b) decline: Sergeant dies, cost paid, Patron enters ──────────────────────────────────

  // Expected (371.2.a/b): the same prompt appears and P1 may answer "no". Actual: no prompt at all.
  test("(b) the 'pay [fury]?' prompt is offered and can be DECLINED (371.2.b)", async () => {
    const game = await board().build();
    await shieldSergeant(game);
    await game.p1.play("patron", { sacrifice: "sarge", to: "base" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p1.power("fury")).toBe(1);
  });

  test("(b) outcome when the shield is not applied: Sergeant is killed → P1's trash, the cost is paid (4 energy), Cruel Patron enters base exhausted, fury untouched", async () => {
    const game = await board().build();
    await shieldSergeant(game);
    await game.p1.play("patron", { sacrifice: "sarge", to: "base" });
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p1.trash()).toContain("sarge");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.state("patron")).toMatchObject({ isExhausted: true, controller: P1, might: 6 });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.p1.units()).toEqual(["patron"]);
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.chain()).toEqual([]);
  });

  // ── (c) 0 fury: nothing to pay with ───────────────────────────────────────────────────────

  test("(c) with 0 fury the replacement cannot be applied: no payable prompt, Sergeant dies to trash, Cruel Patron enters, 4 energy spent", async () => {
    const game = await board(0).build();
    await shieldSergeant(game);
    await game.p1.play("patron", { sacrifice: "sarge", to: "base" });
    const d = game.decision();
    // Either no prompt at all, or an informational one that cannot be accepted.
    if (d?.kind === "yes-no") {
      expect(d.canAccept).toBe(false);
      await game.p1.no();
    }
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
    expect(new Set(game.p1.trash())).toEqual(new Set(["junk", "sarge"]));
  });

  // ── never rewound ─────────────────────────────────────────────────────────────────────────

  test("in every reachable branch Cruel Patron's play completes — it is never left in hand or on the chain, and the energy is spent", async () => {
    for (const fury of [0, 1]) {
      const game = await board(fury).build();
      await shieldSergeant(game);
      await game.p1.play("patron", { sacrifice: "sarge", to: "base" });
      const d = game.decision();
      if (d?.kind === "yes-no") {
        await (d.canAccept === false ? game.p1.no() : game.p1.yes());
      }
      await game.settle();
      expect(game.zoneOf("patron")).toBe("base");
      expect(game.p1.hand()).not.toContain("patron");
      expect(game.chain()).toEqual([]);
      expect(game.p1.energy()).toBe(0);
      expect(game.violations()).toEqual([]);
    }
  });
});
