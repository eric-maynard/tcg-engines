/**
 * Interaction: Atakhan (unl-170-219) · Unit · Order · 10 + [order]×3 · 7 Might
 *     "You may kill a friendly unit as an additional cost to play me. If you do, I cost [1] less for each Energy it
 *      costs and [order] less for each Power it costs. [Ganking] When I attack, …"
 *   × Shady Spectacles (ven-137-166) · Gear · Order · 4 · "[Equip] [1][order]. As this is attached to a unit, choose
 *     another friendly unit. The equipped unit becomes a copy of that unit for as long as this is attached to it."
 *   × Daring Poro (ogn-210-298) · Unit · 2 · 2 Might · [Assault]                     — the Spectacles' bearer
 *   × Ruined Rex (unl-067-219) · Unit · 6 + [mind] · 6 Might · "[Deathknell] Deal 4 to an enemy unit." — the model
 *
 * Rules: 206 / 356.1.c (cost lookups read the PRINTED OR COPIED cost — the CR's own Atakhan-kills-a-Reflection
 * example), 477.1.b / 185.3.a.2 (a copy carries the model's cost), 357.2 (the kill is paid in step 4, the unit still
 * on the board and equipped when read), 428.1.a.1(.b) / 808.1.d.2 / 808.1.d.3 (a cost-kill is a Kill Instruction;
 * a Deathknell it has AT THAT MOMENT pends before it leaves, facts noted), 124 / 124.1 / 124.2 (in the trash it is
 * a new object: layer alterations cease — printed identity only), 435.1.c / 457.1 (the Equipment detaches and stays
 * on the board, Effect Text inactive), 143.4 (Atakhan enters exhausted), 356.6 (costs floor at 0).
 *
 * Question: P1's Daring Poro wears Shady Spectacles copying P1's Ruined Rex. P1 has exactly 4 energy + [order]×2.
 *   (a) YES: play Atakhan killing the Spectacled Poro — discount? affordable? does the copied [mind] pip count for
 *       "[order] less for each Power"?
 *   (b) The killed object: which trash, as WHAT (name/cost/text); where do the Spectacles go; does the COPIED
 *       Deathknell fire although it died as a cost and the Spectacles fall off?
 *   (c) NO: same board, Spectacles never attached (plain Poro) — discount / affordable at 4 + [order]×2?
 *   (d) Control: kill the real Rex instead — discount?
 *
 * Expected: (a) the Poro's cost IS 6 + [mind] while equipped → −6 energy, −1 order (any-domain pip counts) → Atakhan
 * costs exactly 4 + [order]×2 → played, pool 0/0, enters base exhausted. (b) Deathknell (noted while still a copy)
 * goes on the chain as P1's trigger and deals 4 to the enemy unit; the card lands in P1's trash as printed "Daring
 * Poro", cost 2, [Assault], no Deathknell; Spectacles unattached in P1's base; real Rex untouched. (c) plain Poro
 * → 8 + [order]×3 → NOT payable: the Poro is not even offered as the sacrifice, the attempt is rejected, nothing is
 * killed or spent. (d) real Rex: same 6/1 discount → 4 + [order]×2, Rex → trash, its printed Deathknell deals 4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ATAKHAN = "unl-170-219";
const SHADY_SPECTACLES = "ven-137-166";
const DARING_PORO = "ogn-210-298";
const RUINED_REX = "unl-067-219";

/**
 * P1's turn 2. P1 base: Daring Poro, Ruined Rex, Shady Spectacles (unattached); Atakhan in hand.
 * `equipFunds` adds the Equip cost (1 + [order]) on top of the 4 + [order]×2 the question grants, so that AFTER
 * equipping P1 sits on exactly 4 energy + 2 order. P2: a single 5-Might Victim in base (the only enemy unit → the
 * Deathknell's target is forced onto it).
 */
function board(opts: { equipFunds: boolean }) {
  return scenario()
    .resources(P1, opts.equipFunds ? { energy: 5, power: { order: 3 } } : { energy: 4, power: { order: 2 } })
    .unit(P1, "base", DARING_PORO, "poro")
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P2, "base", { might: 5, name: "Victim" }, "victim")
    .gear(P1, SHADY_SPECTACLES, "specs")
    .hand(P1, ATAKHAN, "ata");
}

/** Activate [Equip] onto the Poro and let it resolve; Rex is the only "another friendly unit" → the model is auto-bound (pick it if asked). */
async function spectacledPoro(): Promise<Game> {
  const game = await board({ equipFunds: true }).build();
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "poro" } });
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("rex");
    await game.settle();
  }
  expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 2 } }); // exactly the question's pool
  return game;
}

function sacrificeOptions(game: Game): string[] {
  const f = game.p1.option("playUnit", "ata")?.fields.find((x) => x.arg === "sacrifice");
  return [...((f?.options ?? []) as string[])].sort();
}

/** After a settle, answer a Deathknell target prompt if the engine asks instead of auto-binding the lone enemy. */
async function aimDeathknellIfAsked(game: Game): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("victim");
    await game.settle();
  }
}

describe("Atakhan killing a Shady-Spectacled Daring Poro — the COPIED cost pays the discount", () => {
  test("premise: with the Spectacles attached (model = Rex) the Poro IS 'Ruined Rex' — cost 6 + [mind], 6 Might, [Deathknell] (477.1.b, 185.3.a.2); the real Rex and Atakhan's printed 10 + [order]×3 are as printed", async () => {
    const game = await spectacledPoro();
    expect(game.state("specs").attachedTo).toBe("poro");
    expect(game.state("poro")).toMatchObject({ attachments: ["specs"], baseMight: 6, energyCost: 6, might: 6, name: "Ruined Rex", powerCost: ["mind"], zone: "base" });
    expect(game.state("poro").keywords).toContain("Deathknell");
    expect(game.state("rex")).toMatchObject({ energyCost: 6, might: 6, name: "Ruined Rex", powerCost: ["mind"] });
    expect(game.state("ata")).toMatchObject({ energyCost: 10, powerCost: ["order", "order", "order"], zone: "hand" });
  });

  // ── (a) YES side ────────────────────────────────────────────────────────────────────────────────

  test("(a) at 4 + [order]×2 Atakhan IS playable, only via the kill variant, and the Spectacled Poro is a legal sacrifice alongside the real Rex (206 / 356.1.c: copied cost 6/1 → 10−6 = 4, 3−1 = 2)", async () => {
    const game = await spectacledPoro();
    expect(game.p1.can("play", "ata")).toBe(true);
    const opt = game.p1.option("playUnit", "ata");
    expect(opt?.fields.find((f) => f.arg === "payOptional")?.options).toEqual([true]); // no full-price variant
    expect(sacrificeOptions(game)).toEqual(["poro", "rex"]);
    for (const v of opt?.variants ?? []) {
      expect(v.params.paidAdditionalCost).toBe(true);
    }
  });

  test("(a) playing Atakhan killing the Poro charges EXACTLY 4 energy + 2 order → pool 0/0: the copied [mind] pip counted toward '[order] less for each Power' (pips of any domain); Atakhan enters P1's base exhausted (143.4)", async () => {
    const game = await spectacledPoro();
    await game.p1.play("ata", { payOptional: true, sacrifice: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    await aimDeathknellIfAsked(game);
    expect(game.zoneOf("ata")).toBe("base");
    expect(game.state("ata")).toMatchObject({ controller: P1, isExhausted: true, might: 7 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  // ── (b) what happens to the killed object ─────────────────────────────────────────────────────

  test("(b) the cost-kill is a real death noted while still a copy: the COPIED Deathknell goes on the chain as P1's triggered item (808.1.d.2/.3) and, once resolved, the enemy Victim has 4 damage", async () => {
    const game = await spectacledPoro();
    await game.p1.play("ata", { payOptional: true, sacrifice: "poro" });
    // The trigger is pending/on the chain right after the cost is paid (target forced onto the lone enemy unit).
    const dk = game.chain().find((c) => c.cardId === "poro");
    expect(dk).toMatchObject({ controller: P1, triggered: true, type: "ability" });
    expect(game.state("victim").damage).toBe(0); // not resolved yet
    await game.settle();
    await aimDeathknellIfAsked(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("victim")).toMatchObject({ damage: 4, zone: "base" }); // 4 < 5: survives, marked
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) the card lands in P1's trash as a NEW object with only its printed identity (124.1/124.2): 'Daring Poro', cost 2, no Power, 2 Might, [Assault] — no Deathknell, not 'Ruined Rex'", async () => {
    const game = await spectacledPoro();
    await game.p1.play("ata", { payOptional: true, sacrifice: "poro" });
    await game.settle();
    await aimDeathknellIfAsked(game);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.trash()).toEqual(["poro"]);
    expect(game.p2.trash()).toEqual([]);
    const s = game.state("poro");
    expect(s).toMatchObject({ attachments: [], baseMight: 2, energyCost: 2, might: 2, name: "Daring Poro", owner: P1, powerCost: [] });
    expect(s.keywords).toContain("Assault");
    expect(s.keywords).not.toContain("Deathknell");
    expect(s.rulesText ?? "").toContain("[Assault]");
    expect(s.rulesText ?? "").not.toContain("Deathknell");
  });

  test("(b) the Spectacles detach (bearer left the board) and remain on the board UNATTACHED in P1's base (435.1.c / 457.1); the real Rex is untouched and still 'Ruined Rex'", async () => {
    const game = await spectacledPoro();
    await game.p1.play("ata", { payOptional: true, sacrifice: "poro" });
    await game.settle();
    await aimDeathknellIfAsked(game);
    expect(game.zoneOf("specs")).toBe("base");
    expect(game.state("specs")).toMatchObject({ attachedTo: undefined, attachments: [], controller: P1, location: "base" });
    expect(game.p1.gear()).toEqual(["specs"]);
    expect(game.state("rex")).toMatchObject({ attachments: [], damage: 0, location: "base", might: 6, name: "Ruined Rex" });
    expect(game.p1.base().sort()).toEqual(["ata", "rex", "specs"]);
  });

  // ── (c) NO side: plain Poro ─────────────────────────────────────────────────────────────────────

  test("(c) Spectacles NOT attached: a plain Poro discounts only 2/0 → 8 + [order]×3, unpayable at 4 + [order]×2 — the Poro is not offered as a sacrifice (only Rex is), the attempt is rejected, nothing is killed or spent", async () => {
    const game = await board({ equipFunds: false }).build();
    expect(game.state("poro")).toMatchObject({ energyCost: 2, name: "Daring Poro", powerCost: [] });
    expect(game.state("specs").attachedTo).toBeUndefined();
    expect(sacrificeOptions(game)).toEqual(["rex"]); // Atakhan is still listed — via Rex only
    const r = await game.p1.try((p) => p.play("ata", { payOptional: true, sacrifice: "poro" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.zoneOf("ata")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 2 } });
    expect(game.state("victim").damage).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("(c) …and with NO Rex on the board either, Atakhan is simply not a legal play at 4 + [order]×2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .unit(P1, "base", DARING_PORO, "poro")
      .unit(P2, "base", { might: 5, name: "Victim" }, "victim")
      .gear(P1, SHADY_SPECTACLES, "specs")
      .hand(P1, ATAKHAN, "ata")
      .build();
    expect(game.p1.can("play", "ata")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "ata")).toBe(false);
  });

  // ── (d) control: the real Rex ─────────────────────────────────────────────────────────────────

  test("(d) control: killing the REAL Ruined Rex gives the identical 6/1 discount → 4 + [order]×2 paid to 0/0; Rex → P1's trash; its printed Deathknell deals 4 to the Victim; the Poro is untouched", async () => {
    const game = await board({ equipFunds: false }).build();
    await game.p1.play("ata", { payOptional: true, sacrifice: "rex" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    await aimDeathknellIfAsked(game);
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.p1.trash()).toEqual(["rex"]);
    expect(game.zoneOf("ata")).toBe("base");
    expect(game.state("ata").isExhausted).toBe(true);
    expect(game.state("victim").damage).toBe(4);
    expect(game.state("poro")).toMatchObject({ location: "base", might: 2, name: "Daring Poro" });
    expect(game.chain()).toEqual([]);
  });
});
