import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Heimerdinger, Inventor — ogn-111-298 (Unit)
 *
 * "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *
 * Engine primitive: when the card-definition lookup exposes
 * `inheritExhaustAbilities: true`, the chain-moves enumerator scans every
 * friendly board card for activated abilities whose cost includes
 * `exhaust: true` and exposes each one as if it were Heimerdinger's own.
 * The cost is paid on Heimerdinger, but the effect resolves as the source
 * card — the ability text is not copied, it's dynamically referenced at
 * activation time via the `sourceCardId` parameter on the `activateAbility`
 * move.
 *
 * Heimerdinger has no native activated abilities of his own — the marker
 * flag is what wires the enumerator up to inherited abilities.
 */
export const heimerdingerInventor: UnitCard = {
  // Hand-authored marker is still the source of truth (see `inheritExhaustAbilities`
  // Below), but emitting a placeholder static ability makes enrichment count the
  // Card as ability-bearing (753/755 → 754/755). The effect is opaque to the
  // Generic executor — Heimerdinger's chain-moves enumerator does the real work
  // Via `inheritExhaustAbilities`.
  abilities: [
    {
      effect: {
        text: "I have all [Exhaust] abilities of all friendly legends, units, and gear.",
        type: "raw",
      },
      type: "static",
    },
  ] as unknown as UnitCard["abilities"],
  cardNumber: 111,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-111-298"),
  inheritExhaustAbilities: true,
  isChampion: true,
  might: 3,
  name: "Heimerdinger, Inventor",
  rarity: "rare",
  rulesText: "I have all [Exhaust] abilities of all friendly legends, units, and gear.",
  setId: "OGN",
  tags: ["Heimerdinger"],
};
