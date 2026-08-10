/**
 * Interaction: Shady Spectacles (ven-137-166) · Gear (Equipment) · Order · 4 · Might bonus +0 · [Equip] [1][order]
 *     "As this is attached to a unit, choose another friendly unit. The equipped unit becomes a copy of that unit
 *      for as long as this is attached to it."                                              — P1's, loose in base
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · [Reaction] "Give a unit +2 [Might] this turn. Draw 1."  — P1's hand
 *   × Fiora, Victorious (ogn-232-298) · Champion Unit (Fiora) · Order · 4 · 4 Might
 *     "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]."                      — P1's, at bf1 (the MODEL)
 *   with Bounty Hunter (ogn-267-298, P1's legend) "[Exhaust]: Give a unit [Ganking] this turn." and Daring Poro
 *   (ogn-210-298, 2 Might, [Assault], Poro) in P1's base as the HOLDER. Probes: Fiora, Worthy (sfd-180-221, "When a
 *   unit you control becomes [Mighty], you may pay [order] to ready it") for the 709 event; Angle Shot (sfd-011-221,
 *   2, [Reaction] attach/detach an Equipment) for the detach contrast; P2's 3-Might "Enemy" at bf2 for the Assault check.
 *
 * Question. In one main phase P1: (t1) exhausts Bounty Hunter → Daring Poro gets [Ganking] this turn; (t2) Discipline on
 * the Poro (+2 → 4); (t3) Equips Shady Spectacles to the Poro choosing Fiora, Victorious as the model. After t3, what is
 * the equipped object — name, tags, Might, keywords? Is the +2 (stamped BEFORE the copy) erased? Does it keep
 * [Assault]/Poro? Is it Mighty with Fiora's conditional keywords, and does a "becomes Mighty" trigger see it? Contrast:
 * end of turn, and after the Spectacles are detached.
 *
 * Rules: 475.1 / 477 (layers applied by layer, not by timestamp; 480 orders only WITHIN a layer), 476 / 476.2 / 476.3
 * (re-loop until stable — the Fiora, Victorious example), 477.1.b / .1.a / .1.b (copy = printed copyable traits: name,
 * type, tags, cost, domain, rules text; base Might per the copy rulings), 477.2.a / 477.2.c (granted keywords and
 * appended Equipment text live in layer 2 — not overwritten by a layer-1 copy), 477.3 (arithmetic: +2 Discipline
 * re-applied on the new base), 708 / 709 / 710 (Mighty at current Might ≥ 5; "becomes Mighty" when it crosses),
 * 317.2.c ('this turn' expires at 3d), 435.1.c/d (detach ends "for as long as attached").
 *
 * Expected: after t3 the holder is "Fiora, Victorious" (champion unit, tag Fiora, NOT Poro, cost 4), base 4, +2
 * Discipline → 6, Mighty → Deflect + Ganking + Shield (plus the still-live Bounty Hunter Ganking grant), NO Assault
 * (printed text replaced). 4 → 6 at t3 is a "becomes Mighty" moment (709) → Fiora, Worthy triggers. Attacking, it gets
 * no Assault bonus (stays 6). End of turn: Discipline and the Ganking grant expire → 4-Might "Fiora, Victorious", not
 * Mighty, no keywords. Detached: printed Daring Poro, 2 Might (+2 if still this turn), [Assault], Poro again.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
// Read-only peek at the copy's copyable TAGS (477.1.b.1.a) — CardState does not surface tags.
import { getGlobalCardRegistry } from "../../../operations/card-lookup";

const SHADY_SPECTACLES = "ven-137-166";
const DISCIPLINE = "ogn-058-298";
const FIORA_VICTORIOUS = "ogn-232-298";
const BOUNTY_HUNTER = "ogn-267-298";
const DARING_PORO = "ogn-210-298";
const FIORA_WORTHY = "sfd-180-221"; // probe: "When a unit you control becomes [Mighty], you may pay [order] to ready it."
const ANGLE_SHOT = "sfd-011-221"; // probe: [Reaction] 2 — attach/detach an Equipment (same controller). Draw 1.

const FIORA_KEYWORDS = ["Deflect", "Ganking", "Shield"];

function tagsOf(card: string): readonly string[] {
  return getGlobalCardRegistry().get(card)?.tags ?? [];
}

/**
 * P1's turn 2, main phase. P1: Bounty Hunter legend (ready), Daring Poro ready in base, Fiora, Victorious at bf1 (P1's),
 * loose Shady Spectacles, Discipline in hand; 2 (Discipline) + 1 + [order] (Equip) — plus 2 more and Angle Shot when
 * `withAngleShot`. P2: a 3-Might Enemy holding bf2.
 */
function board(opts: { withWorthy?: boolean; withAngleShot?: boolean } = {}) {
  let b = scenario()
    .resources(P1, { energy: 3 + (opts.withAngleShot ? 2 : 0), power: { order: opts.withWorthy ? 2 : 1 } })
    .legend(P1, BOUNTY_HUNTER, "hunter")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", DARING_PORO, "poro")
    .unit(P1, "bf1", FIORA_VICTORIOUS, "fiora")
    .unit(P2, "bf2", { might: 3, name: "Enemy" }, "enemy")
    .gear(P1, SHADY_SPECTACLES, "specs")
    .hand(P1, DISCIPLINE, "disc");
  if (opts.withWorthy) {
    b = b.unit(P1, "base", FIORA_WORTHY, "worthy");
  }
  if (opts.withAngleShot) {
    b = b.hand(P1, ANGLE_SHOT, "angle");
  }
  return b;
}

/** t1: Bounty Hunter → Poro [Ganking]; t2: Discipline → Poro +2. */
async function t1t2(game: Game): Promise<void> {
  await game.p1.activate("hunter", undefined, { targets: "poro" });
  await game.settle();
  expect(game.state("poro").grantedKeywords).toEqual([{ duration: "turn", keyword: "Ganking" }]);
  await game.p1.cast("disc", { targets: "poro" });
  await game.settle();
  expect(game.state("poro")).toMatchObject({ might: 4, mightModifier: 2, name: "Daring Poro" });
}

/** t3: Equip the Spectacles onto the Poro and choose Fiora, Victorious as the model (auto-bound when she is the only other friendly unit). */
async function t3(game: Game): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "poro" } });
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "fiora")) {
      await game.p1.pick("fiora");
      continue;
    }
    if (r.reason !== "unanswered") {
      break;
    }
    break; // some other prompt (e.g. the Worthy probe's yes-no) — hand back to the test
  }
  expect(game.state("specs").attachedTo).toBe("poro");
}

async function afterT3(opts: { withAngleShot?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await t1t2(game);
  await t3(game);
  return game;
}

describe("premise (t1, t2): a 4-Might 'Daring Poro' with [Assault] printed, [Ganking] granted this turn, +2 this turn", () => {
  test("t1 + t2 land on the Poro; Fiora, Victorious at bf1 is a plain 4 (not Mighty, no keywords); resources left = exactly the Equip cost", async () => {
    const game = await board().build();
    await t1t2(game);
    expect(game.state("poro").keywords.sort()).toEqual(["Assault", "Ganking"]);
    expect(tagsOf("poro")).toEqual(["Poro"]);
    expect(game.state("fiora")).toMatchObject({ location: "bf1", might: 4, name: "Fiora, Victorious" });
    for (const k of FIORA_KEYWORDS) {
      expect(game.state("fiora").keywords).not.toContain(k);
    }
    expect(game.state("hunter").isExhausted).toBe(true);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
  });
});

describe("after t3 — layer 1 (477.1.b): the holder IS 'Fiora, Victorious' — name, Fiora tag (Poro gone), cost 4, base Might 4, printed [Assault] gone", () => {
  test("name / cost / base Might / tags are the model's printed ones; the model herself is untouched at bf1", async () => {
    const game = await afterT3();
    expect(game.state("poro")).toMatchObject({ attachments: ["specs"], baseMight: 4, energyCost: 4, location: "base", name: "Fiora, Victorious" });
    expect(tagsOf("poro")).toEqual(["Fiora"]);
    expect(tagsOf("poro")).not.toContain("Poro");
    expect(game.findAll({ name: "Fiora, Victorious" }).sort()).toEqual(["fiora", "poro"]);
    expect(game.state("fiora")).toMatchObject({ attachments: [], location: "bf1", might: 4, name: "Fiora, Victorious" });
  });

  test("printed [Assault] is a copyable trait that was REPLACED — the holder no longer has Assault", async () => {
    const game = await afterT3();
    expect(game.state("poro").keywords).not.toContain("Assault");
  });
});

describe("after t3 — layers 2 + 3 re-looped (476.2 / 476.3): Discipline's +2 survives the copy → 6 → Mighty → Deflect + Ganking + Shield", () => {
  test("the +2 stamped BEFORE the copy is not erased: 4 (copied base) + 2 (Discipline, layer 3) + 0 (Spectacles bonus) = 6", async () => {
    const game = await afterT3();
    expect(game.state("poro")).toMatchObject({ baseMight: 4, might: 6, mightModifier: 2 });
  });

  test("6 ≥ 5 → Mighty (708/710) → Fiora's conditional grants Deflect, Ganking and Shield; the Bounty Hunter Ganking grant (layer 2, t1) is still there too", async () => {
    const game = await afterT3();
    expect(game.state("poro").keywords).toEqual(expect.arrayContaining(FIORA_KEYWORDS));
    expect(game.state("poro").grantedKeywords).toEqual(expect.arrayContaining([{ duration: "turn", keyword: "Ganking" }]));
    expect(game.state("poro").keywords).not.toContain("Assault");
    expect(game.violations()).toEqual([]);
  });

  test("Shield's +1 is defender-only (476.3): sitting in base / attacking it stays 6, and with NO Assault an attack into bf2 fights at exactly 6 (not 7)", async () => {
    const game = await afterT3();
    expect(game.state("poro")).toMatchObject({ isReady: true, might: 6 });
    await game.p1.move("poro", "bf2");
    expect(game.state("poro")).toMatchObject({ combatRole: "attacker", location: "bf2", might: 6 });
    await game.settle();
    expect(game.zoneOf("enemy")).toBe("trash"); // 6 ≥ 3
    expect(game.locationOf("poro")).toBe("bf2"); // 3 < 6
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

});

describe("709 — its Might went 4 → 6 at t3, so it 'becomes Mighty' then: a Fiora, Worthy probe triggers", () => {
  test("probe control: the Worthy probe DOES fire on an ordinary crossing — Discipline on the 4-Might Fiora, Victorious (4 → 6) asks P1 'you may pay [order]…'", async () => {
    const game = await board({ withWorthy: true }).build();
    await game.p1.cast("disc", { targets: "fiora" });
    const stop = await game.settle();
    expect(game.state("fiora").might).toBe(6);
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // BUG — expected: the copy takes the holder from 4 (Poro 2 + 2) to 6 (Fiora 4 + 2) as the Equip resolves; that is a
  // "becomes Mighty" moment (709/710 — any source of Might counts, the layers are simply re-evaluated, 476), so Fiora,
  // Worthy's trigger must hit the chain and ask P1. Actual: the holder reads 6 / Mighty (keywords on), but the
  // become-mighty event is never emitted for a Might change caused by a copy effect — no prompt, straight to main.
  test("with Fiora, Worthy in base, resolving the Equip (holder 4 → 6 via the copy) opens Worthy's 'you may pay [order] to ready it' for P1 (709)", async () => {
    const game = await board({ withWorthy: true }).build();
    await t1t2(game);
    // No becomes-Mighty so far (2 → 4): no Worthy prompt is pending.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "poro" } });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["fiora", "worthy"]);
    await game.p1.pick("fiora");
    const stop = await game.settle();
    expect(game.state("poro")).toMatchObject({ might: 6, name: "Fiora, Victorious" });
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("contrast — end of turn (317.2.c / 476.3 second example): Discipline and the Ganking grant expire → 4-Might 'Fiora, Victorious', not Mighty, no keywords", () => {
  test("after P1's turn ends the holder is still the copy (Spectacles attached) but 4 Might with none of Deflect/Ganking/Shield/Assault", async () => {
    const game = await afterT3();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("specs").attachedTo).toBe("poro");
    expect(game.state("poro")).toMatchObject({ baseMight: 4, might: 4, mightModifier: 0, name: "Fiora, Victorious" });
    expect(game.state("poro").grantedKeywords).toEqual([]);
    for (const k of [...FIORA_KEYWORDS, "Assault"]) {
      expect(game.state("poro").keywords).not.toContain(k);
    }
    expect(tagsOf("poro")).toEqual(["Fiora"]);
  });
});

describe("contrast — Spectacles detached (435.1.c/d): the copy ends → printed Daring Poro, [Assault], Poro tag", () => {
  test("same turn, Angle Shot detaches the Spectacles: 'Daring Poro', base 2 (+2 Discipline still this turn → 4), Assault + the granted Ganking, no Fiora keywords, Poro tag back; Spectacles loose in base", async () => {
    const game = await afterT3({ withAngleShot: true });
    expect(game.state("poro")).toMatchObject({ might: 6, name: "Fiora, Victorious" });
    await game.p1.cast("angle", { targets: ["poro", "specs"] });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("angle")).toBe("trash");
    expect(game.state("specs")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.state("poro")).toMatchObject({ attachments: [], baseMight: 2, energyCost: 2, might: 4, mightModifier: 2, name: "Daring Poro" });
    expect(game.state("poro").keywords.sort()).toEqual(["Assault", "Ganking"]);
    expect(tagsOf("poro")).toEqual(["Poro"]);
  });

  test("…and once that turn also ends it is the plain printed 2-Might [Assault] Daring Poro", async () => {
    const game = await afterT3({ withAngleShot: true });
    await game.p1.cast("angle", { targets: ["poro", "specs"] });
    await game.settle({ policy: "first" });
    await game.advanceTurn();
    expect(game.state("poro")).toMatchObject({ baseMight: 2, might: 2, mightModifier: 0, name: "Daring Poro" });
    expect(game.state("poro").keywords).toEqual(["Assault"]);
    expect(game.state("poro").grantedKeywords).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
