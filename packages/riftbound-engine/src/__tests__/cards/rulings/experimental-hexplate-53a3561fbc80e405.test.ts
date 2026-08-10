/**
 * Ruling 53a3561fbc80e405 — Experimental Hexplate (SFD-073 → sfd-073-221) · Equipment · Mind · [1] · +1 Might
 *     "[Equip] [mind] — I am a Mech."   ("I" in the Effect Text = the equipped unit)
 *   × Rumble, Hotheaded (SFD-026 → sfd-026-221) · 4 Might · Rumble/Mech · "Your Mechs each have [Assault]. …"
 *   (+ Stalwart Poro ogn-052-298 (2 Might, [Shield], PORO) as the wearer; Friendship unl-046-219 "[Reaction] Choose a unit. Give
 *      it +1 [Might] this turn for each of … Bird, Cat, Dog, and Poro among your units" as the reader of the ORIGINAL tag.)
 *
 * Q: Does Hexplate ADD the Mech tag or replace the unit's tags? Does "I am a …" even work (the rules list "is"/"are")?
 * A: It adds Mech; existing tags stay. "I am a" is just another conjugation of "to be" and works like "is/are"; tag-granting
 *    text is additive unless a card says otherwise.
 * Rules: 135.2 (tags), 136.2 (Equipment effect text applies to the equipped unit), the CR "Other friendly units are Yordles"
 *        example (additive).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXPLATE = "sfd-073-221";
const RUMBLE = "sfd-026-221";
const STALWART_PORO = "ogn-052-298";
const FRIENDSHIP = "unl-046-219";

/** P1's turn: Rumble, Stalwart Poro and an unattached Hexplate in base; Friendship in hand; exactly [1] + one [mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RUMBLE, "rumble")
    .unit(P1, "base", STALWART_PORO, "poro")
    .gear(P1, HEXPLATE, "hex")
    .hand(P1, FRIENDSHIP, "friendship");
}

const hasAssault = (game: Game, id: string) =>
  game.state(id).keywords.includes("Assault") || game.state(id).grantedKeywords.some((k) => k.keyword === "Assault");

/** Equip the Hexplate onto the Poro ([mind]) and let the Equip item resolve. */
async function plateThePoro(): Promise<Game> {
  const game = await board().build();
  expect(hasAssault(game, "rumble")).toBe(true); // Rumble is a printed Mech → his own passive gives him Assault
  expect(hasAssault(game, "poro")).toBe(false); // a Poro is not a Mech (yet)
  await game.p1.choose("equipCard:-", { params: { equipmentId: "hex", unitId: "poro" } });
  expect(game.p1.power("mind")).toBe(0);
  await game.p1.pass();
  await game.p2.pass();
  expect(game.state("hex")).toMatchObject({ attachedTo: "poro" });
  expect(game.state("poro")).toMatchObject({ attachments: ["hex"], might: 3 }); // 2 + the plate's +1
  return game;
}

describe("Ruling 53a3561fbc80e405 — Experimental Hexplate makes its wearer a Mech IN ADDITION to what it already is", () => {
  // Expected: once attached, "I am a Mech" gives the Poro the Mech tag, so Rumble's "Your Mechs each have [Assault]" now
  // covers it. Actual: the engine loads Hexplate with only its [Equip] keyword — the "I am a Mech" effect text confers no
  // tag, so the plated Poro never picks up Assault.
  test("ruling 53a3561fbc80e405 — the plated Poro should count as a Mech (gains Assault from Rumble, Hotheaded); engine grants no Mech tag", async () => {
    const game = await plateThePoro();
    expect(hasAssault(game, "poro")).toBe(true);
  });

  test("…and it is still a Poro: Friendship cast on Rumble after the plate is on finds the Poro tag among P1's units → +1 Might (2 tags would be needed for +2 — Mech is not on Friendship's list)", async () => {
    const game = await plateThePoro();
    expect(game.state("rumble").might).toBe(4);
    await game.p1.cast("friendship", { targets: "rumble" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("friendship")).toBe("trash");
    expect(game.state("rumble")).toMatchObject({ might: 5, mightModifier: 1 }); // exactly one listed tag (Poro) present
    expect(game.state("poro").might).toBe(3); // untouched by Friendship; still wearing the plate
    expect(game.violations()).toEqual([]);
  });

  test("control: without any Poro on the board Friendship gives +0 — so the +1 above really came from the (still present) Poro tag", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", RUMBLE, "rumble")
      .hand(P1, FRIENDSHIP, "friendship")
      .build();
    await game.p1.cast("friendship", { targets: "rumble" });
    await game.settle();
    expect(game.state("rumble")).toMatchObject({ might: 4, mightModifier: 0 });
  });
});
