/**
 * Ruling b23401c9668bdb5a — Reflection (UNL-T06 → unl-t06) token "(I become a copy of something when played …)"
 *   × Ekko, Recurrent (OGN-110 → ogn-110-298) "[Accelerate] … [Deathknell] — Recycle me to ready your runes."
 *   (Mirror Image unl-200-219 makes the Reflection-of-Ekko; Vengeance ogn-229-298 "Kill a unit." kills it.)
 *
 * Q: Can a Reflection token that copies Ekko trigger his Deathknell?
 * A: Yes, the copied Deathknell TRIGGERS when the token dies — but "Recycle me" is the ability's BASE COST
 *    (rule 383.3.b), and the token has ceased to exist, so the cost can never be paid: the Pending Item is removed
 *    from the Chain without ever becoming a Finalized Chain Item (383.3.b.1 / 404.2) and the runes are NOT readied.
 * Rules: 808.1 (Deathknell), 183.1 / 186.1 (a token ceases to exist off the board), 383.3.b / 383.3.b.1 / 404.2,
 *        copy inherits abilities.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EKKO = "ogn-110-298";
const MIRROR_IMAGE = "unl-200-219";
const VENGEANCE = "ogn-229-298";

/**
 * P1's turn. P2 has Ekko in base (the copy source). P1: Mirror Image + Vengeance in hand, [7] + 2 rainbow + [order]×2,
 * and two EXHAUSTED mind runes (what "ready your runes" would ready).
 */
function board() {
  return scenario()
    .unit(P2, "base", EKKO, "ekko")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P1, VENGEANCE, "venge")
    .runes(P1, "mind", 2, { exhausted: true })
    .resources(P1, { energy: 7, power: { rainbow: 2, order: 2 } });
}

async function reflectionOfEkko(game: Game): Promise<string> {
  await game.p1.cast("mirror", { targets: "ekko" });
  await game.settle();
  const token = game.p1.units("base").find((u) => game.state(u).isToken);
  expect(token).toBeDefined();
  return token as string;
}

describe("Ruling b23401c9668bdb5a — Reflection-of-Ekko: Deathknell triggers, but 'Recycle me' fails so no runes ready", () => {
  test("premise: the Reflection copied Ekko (name, 5 Might, the Deathknell keyword) and P1's two runes are exhausted", async () => {
    const game = await board().build();
    const refl = await reflectionOfEkko(game);
    expect(game.state(refl)).toMatchObject({ isToken: true, might: 5, name: "Ekko, Recurrent" });
    expect(game.state(refl).keywords).toContain("Deathknell");
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  // rule 383.3.b.1 / 404.2 — "Recycle me" is the Deathknell's base cost; it cannot be paid for a token that has ceased
  // to exist, so the Pending Item is removed from the Chain and NEVER becomes a Finalized Chain Item. (The ruling's
  // prose "goes on the chain" describes the Pending Item; the finalized Chain is empty either way.)
  test("killing the token: its Deathknell can never pay 'Recycle me', so nothing is finalized to the chain", async () => {
    const game = await board().build();
    const refl = await reflectionOfEkko(game);
    await game.p1.cast("venge", { targets: refl });
    // Resolve Vengeance only (P1 passes, P2 passes).
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("venge")).toBe("trash");
    expect(game.zoneOf(refl)).toBe("gone"); // token ceased to exist (186.1)
    expect(game.chain()).toEqual([]);
  });

  // The "Recycle me" cost step fails (the token ceased to exist), so the linked "ready your runes" is not performed.
  test("ruling b23401c9668bdb5a — the dead Reflection token cannot be recycled, so no runes ready", async () => {
    const game = await board().build();
    const refl = await reflectionOfEkko(game);
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("venge", { targets: refl });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf(refl)).toBe("gone");
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
    expect(game.p1.deck()).toHaveLength(deckBefore);
    expect(game.zoneOf("ekko")).toBe("base"); // the real Ekko is untouched
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the REAL Ekko dying is recycled and DOES ready its controller's runes", async () => {
    const game = await scenario()
      .unit(P1, "base", EKKO, "myEkko")
      .hand(P1, VENGEANCE, "venge")
      .runes(P1, "mind", 2, { exhausted: true })
      .resources(P1, { energy: 4, power: { order: 2 } })
      .build();
    await game.p1.cast("venge", { targets: "myEkko" });
    await game.settle();
    expect(game.zoneOf("myEkko")).toBe("mainDeck");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });
});

void P2;
