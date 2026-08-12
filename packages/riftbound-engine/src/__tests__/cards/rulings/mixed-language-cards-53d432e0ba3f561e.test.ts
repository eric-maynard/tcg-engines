/**
 * Ruling 53d432e0ba3f561e — (no specific card) mixing languages (e.g. Chinese cards) in a tournament deck
 *
 * Q: May I play official cards of any language mixed with English — e.g. Chinese Seals — in tournaments?
 * A: Yes, subject to a PHYSICAL requirement: everything in a shuffled zone must be indistinguishable
 *    (identical opaque sleeves, same stock), or it is marked cards; cards in non-shuffled public zones
 *    (Legend, Battlefields) are unproblematic, and you may call a judge for the official English text.
 *    The sleeving/marked-cards policy is a tournament-floor matter and is NOT modelled by the engine. What
 *    the engine does encode are the game facts it rests on, asserted here: a card's identity is its printed
 *    id/name (no language dimension), shuffled zones are secret to EVERYONE, and Legend/Battlefield/Champion
 *    zones are public information.
 * Rules: 127 (private/secret zones), 108.3.e (Champion Zone is public), 355.10.a.1 (public zones:
 *        battlefield zones, bases, trashes, legend zones, champion zones, facedown zones — the facedown
 *        CONTENTS staying private), 103.2.a.3 (identity by NAME, not by printing).
 */
import { describe, expect, test } from "bun:test";
import type { Seat, ZoneSummary } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const FOX = "ogn-255-298"; // Legend
const AHRI = "ogn-066-298"; // Champion unit
const BLOCK = "ogn-057-298"; // a [Hidden] spell to sit facedown

function board() {
  return scenario()
    .legend(P1, FOX, "fox")
    .champion(P1, AHRI, "ahri")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .facedown(P1, "bf1", BLOCK, "block")
    .hand(P1, BLOCK, "inHand")
    .deck(P1, [BLOCK], ["onTop"]);
}

describe("Ruling 53d432e0ba3f561e — the engine facts a mixed-language deck rests on", () => {
  test("a card's identity is its printed id and name — there is no language dimension for the rules to care about", async () => {
    const game = await board().build();
    expect(game.state("ahri")).toMatchObject({ defId: AHRI, name: "Ahri, Alluring" });
    expect(game.state("block")).toMatchObject({ defId: BLOCK });
  });

  test("shuffled zones are SECRET: nobody — not even the owner — reads the Main Deck as visible information", async () => {
    const game = await board().build();
    const zone = (viewer: Seat, name: string, owner?: Seat): ZoneSummary | undefined =>
      game.seat(viewer).listZones({ all: true }).find((z) => z.zone === name && (owner === undefined || z.owner === owner));
    expect(zone(P1, "mainDeck", P1)).toMatchObject({ visible: false });
    expect(zone(P2, "mainDeck", P1)).toMatchObject({ visible: false });
    expect(zone(P1, "runeDeck", P1)).toMatchObject({ visible: false });
  });

  test("the hand and facedown cards are private to their owner — the game-state analogue of 'the sleeves must not distinguish anything'", async () => {
    const game = await board().build();
    const zone = (viewer: Seat, name: string, owner?: Seat): ZoneSummary | undefined =>
      game.seat(viewer).listZones({ all: true }).find((z) => z.zone === name && (owner === undefined || z.owner === owner));
    expect(zone(P1, "hand", P1)).toMatchObject({ visible: true });
    expect(zone(P2, "hand", P1)).toMatchObject({ visible: false });
    expect(zone(P2, "facedown-bf1")).toMatchObject({ visible: false });
    // The owner still knows what they hid; the opponent sees only that something is there.
    expect(game.p1.facedown("bf1")).toEqual(["block"]);
    expect((game.view(P2).zones["facedown-bf1"] ?? []).every(isHiddenView)).toBe(true);
  });

  test("non-shuffled public zones are open to everyone: the Legend, the Champion Zone and the battlefield row", async () => {
    const game = await board().build();
    const zone = (viewer: Seat, name: string, owner?: Seat): ZoneSummary | undefined =>
      game.seat(viewer).listZones({ all: true }).find((z) => z.zone === name && (owner === undefined || z.owner === owner));
    expect(zone(P2, "legendZone", P1)).toMatchObject({ visible: true });
    expect(zone(P2, "championZone", P1)).toMatchObject({ visible: true });
    expect(zone(P2, "battlefieldRow")).toMatchObject({ visible: true });
    expect(game.p1.legend()).toBe("fox");
    expect(game.p1.champion()).toBe("ahri");
    expect(game.violations()).toEqual([]);
  });
});
