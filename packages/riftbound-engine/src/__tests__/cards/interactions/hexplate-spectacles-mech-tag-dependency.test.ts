/**
 * Interaction: Experimental Hexplate (sfd-073-221, Equipment, +1) "[Equip] [mind] … I am a Mech."
 *   × Shady Spectacles (ven-137-166, Equipment, +0) "[Equip] [1][order] … As this is attached to a unit,
 *     choose another friendly unit. The equipped unit becomes a copy of that unit for as long as this is
 *     attached to it."
 *   × Rumble, Scrapper (sfd-089-221, 4) "Your Mechs have +1 [Might] (including me). …"
 *   (model: Daring Poro ogn-210-298 — 2 Might, Poro, [Assault]; holder: a 3-Might Mech unit TOKEN)
 *
 * Rules: 477.1.a / 477.1.c (a tag grant is a layer-1 trait-altering effect), 477.1.b / 477.1.b.1.a
 * ("becomes a copy" is layer 1 too and overwrites the copyable traits — name, tags, text, Might),
 * 478 / 478.1.c / 479 / 479.2 (within a layer, an effect whose outcome changes depending on whether
 * another is applied first DEPENDS on it and is applied right after it — before timestamps, 480, are
 * consulted), 477.2.c (Equipment effect text is appended in layer 2), 477.3.d (Equipment Might bonus in
 * layer 3), 186 (token-ness is not a copyable trait).
 *
 * Q: Order A = Hexplate first, Spectacles (copy Daring Poro) second; Order B = the reverse. In each order:
 *    is the token a Mech (Rumble +1?), a Poro, what Might, still a token? "The copy came after the
 *    Hexplate — doesn't it wipe the Mech tag?"
 * Expected: No. The Hexplate's tag grant depends on the copy (only its outcome changes with sequence), so
 * it is applied AFTER the copy in BOTH orders; timestamps never matter. Result either way: name "Daring
 * Poro", tags [Poro, Mech], [Assault], base Might 2, +1 Hexplate +0 Spectacles +1 Rumble = 4, still a
 * token. Spectacles alone: 2-Might non-Mech Poro (printed Mech tag overwritten, Rumble's +1 lost).
 * Hexplate alone: 3+1+1 = 5 Mech. Spectacles detached later: back to printed 3-Might Mech +1 +1 = 5.
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXPLATE = "sfd-073-221";
const SPECTACLES = "ven-137-166";
const RUMBLE = "sfd-089-221";
const DARING_PORO = "ogn-210-298";
const DETONATE = "sfd-005-221"; // Fury Action · 1 + [fury] · Kill a gear. Its controller draws 2. (detaches the Spectacles)
const BRUSH = "unl-t03"; // Battlefield: Bird, Cat, Dog, Poro, and Ivern units here have +1 Might — a Poro-TAG detector

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1: Rumble (base), Daring Poro (base), the 3-Might Mech unit token (engine tokens carry a `token-` id)
 * at `tokenAt`, both Equipment in base unattached, Detonate in hand. Pool covers Hexplate's [mind],
 * Spectacles' [1][order] and Detonate's [1] (its [fury] is added where it is cast).
 */
function board(tokenAt: "base" | "brush" = "base") {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("brush", { controller: P1, def: BRUSH, inert: false })
    .unit(P1, "base", RUMBLE, "rumble")
    .unit(P1, tokenAt, { isToken: true, might: 3, name: "Mech", tags: ["Mech"] }, "token-mech")
    .unit(P1, "base", DARING_PORO, "poro")
    .gear(P1, HEXPLATE, "hex")
    .gear(P1, SPECTACLES, "specs")
    .hand(P1, DETONATE, "det");
}

/** Activate [Equip] of `gear` onto the token, let it resolve; answer Spectacles' "another friendly unit" with `model`. */
async function equip(game: G, gear: "hex" | "specs", model?: string): Promise<string[] | undefined> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: gear, unitId: "token-mech" } });
  let offered: string[] | undefined;
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      offered = (d as PickDecision).options.map((o) => o.card ?? o.key);
      await game.p1.pick(model as string);
      continue;
    }
    if (r.reason !== "unanswered") {
      break;
    }
  }
  expect(game.state(gear).attachedTo).toBe("token-mech");
  return offered;
}

/** The layered identity of the token, for order-A-vs-order-B comparison. */
function identity(game: G) {
  const s = game.state("token-mech");
  return {
    attachments: [...s.attachments].sort(),
    baseMight: s.baseMight,
    isToken: s.isToken,
    keywords: [...s.keywords],
    mechTagGranted: ((s.meta.staticTags as string[] | undefined) ?? []).includes("Mech"),
    might: s.might,
    name: s.name,
    rumbleBonusApplies: s.staticMightBonus >= 1,
  };
}

describe("Experimental Hexplate × Shady Spectacles on a Mech token under Rumble — layer-1 dependency, not timestamps", () => {
  test("baseline: the printed-Mech token is 3 +1 Rumble = 4; Rumble 5 (including me); Daring Poro 2 (not a Mech)", async () => {
    const game = await board().build();
    expect(game.state("token-mech")).toMatchObject({ baseMight: 3, isToken: true, might: 4, name: "Mech" });
    expect(game.state("rumble").might).toBe(5);
    expect(game.state("poro")).toMatchObject({ keywords: ["Assault"], might: 2 });
  });

  test("'No' side — Hexplate ONLY: 3 printed +1 Hexplate +1 Rumble = 5-Might Mech token", async () => {
    const game = await board().build();
    await equip(game, "hex");
    expect(game.p1.power("mind")).toBe(0);
    expect(game.state("token-mech")).toMatchObject({ attachments: ["hex"], baseMight: 3, isToken: true, might: 5, name: "Mech" });
  });

  test("'No' side — Spectacles ONLY copying Daring Poro: the PRINTED Mech tag is overwritten → a 2-Might 'Daring Poro' with Assault that loses Rumble's +1", async () => {
    const game = await board().build();
    const offered = await equip(game, "specs", "poro");
    expect([...(offered ?? [])].sort()).toEqual(["poro", "rumble"]); // "another friendly unit": never the holder
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1, order: 0 } });
    expect(game.state("token-mech")).toMatchObject({ baseMight: 2, keywords: ["Assault"], might: 2, name: "Daring Poro", staticMightBonus: 0 });
    expect(game.state("poro").might).toBe(2); // the model is untouched
  });

  test("'No' side — the Spectacles-only copy IS a Poro: standing in Brush (+1 to Poro units here) it reads 2 +1 = 3, while the un-copied Mech token there gets nothing from Brush", async () => {
    const plain = await board("brush").build();
    expect(plain.state("token-mech").might).toBe(4); // 3 + Rumble; Brush ignores a Mech
    const game = await board("brush").build();
    await equip(game, "specs", "poro");
    expect(game.state("token-mech")).toMatchObject({ baseMight: 2, might: 3, name: "Daring Poro" }); // +1 Brush (Poro), no Rumble
  });

  test("Order A (Hexplate, then Spectacles→Daring Poro): name 'Daring Poro', base 2, [Assault], Mech tag granted, Rumble +1 applies → 2 +1 +0 +1 = 4; still a token", async () => {
    const game = await board().build();
    await equip(game, "hex");
    expect(game.state("token-mech").might).toBe(5);
    await equip(game, "specs", "poro");
    expect(identity(game)).toEqual({
      attachments: ["hex", "specs"],
      baseMight: 2,
      isToken: true,
      keywords: ["Assault"],
      mechTagGranted: true,
      might: 4,
      name: "Daring Poro",
      rumbleBonusApplies: true,
    });
    expect(game.violations()).toEqual([]);
  });

  test("Order B (Spectacles→Daring Poro, then Hexplate): the very same object — 4-Might Mech 'Daring Poro' token", async () => {
    const game = await board().build();
    await equip(game, "specs", "poro");
    expect(game.state("token-mech").might).toBe(2);
    await equip(game, "hex");
    expect(identity(game)).toEqual({
      attachments: ["hex", "specs"],
      baseMight: 2,
      isToken: true,
      keywords: ["Assault"],
      mechTagGranted: true,
      might: 4,
      name: "Daring Poro",
      rumbleBonusApplies: true,
    });
    expect(game.violations()).toEqual([]);
  });

  test("judge's question answered: attach order is irrelevant (479.2 dependency beats 480 timestamps) — Order A and Order B yield identical identities", async () => {
    const a = await board().build();
    await equip(a, "hex");
    await equip(a, "specs", "poro");
    const idA = identity(a);
    const b = await board().build();
    await equip(b, "specs", "poro");
    await equip(b, "hex");
    expect(identity(b)).toEqual(idA);
    expect(idA.mechTagGranted && idA.rumbleBonusApplies).toBe(true); // the copy did NOT wipe the Hexplate's Mech
  });

  test("tags are [Poro, Mech] in both orders: in Brush the doubly-equipped token is 2 +1 Hexplate +1 Rumble (Mech) +1 Brush (Poro) = 5", async () => {
    const a = await board("brush").build();
    await equip(a, "hex");
    await equip(a, "specs", "poro");
    expect(a.state("token-mech")).toMatchObject({ might: 5, name: "Daring Poro", staticMightBonus: 2 });
    const b = await board("brush").build();
    await equip(b, "specs", "poro");
    await equip(b, "hex");
    expect(b.state("token-mech")).toMatchObject({ might: 5, name: "Daring Poro", staticMightBonus: 2 });
  });

  test("Spectacles detached later (Detonate kills it): the copy ends — printed 3-Might 'Mech' again, +1 Hexplate +1 Rumble = 5, Hexplate still attached", async () => {
    const game = await board().resources(P1, { energy: 2, power: { fury: 1, mind: 1, order: 1 } }).build(); // + Detonate's [fury]
    await equip(game, "hex");
    await equip(game, "specs", "poro");
    expect(game.state("token-mech").might).toBe(4);
    await game.p1.cast("det", { targets: "specs" });
    await game.settle();
    expect(game.zoneOf("specs")).toBe("trash");
    expect(game.state("hex").attachedTo).toBe("token-mech");
    expect(game.state("token-mech")).toMatchObject({ attachments: ["hex"], baseMight: 3, isToken: true, keywords: [], might: 5, name: "Mech" });
    expect(game.violations()).toEqual([]);
  });
});
