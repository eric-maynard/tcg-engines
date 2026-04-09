import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const prodigalExplorer: LegendCard = {
  cardNumber: 199,
  cardType: "legend",
  championTag: "Ezreal",
  domain: ["mind", "chaos"],
  id: createCardId("sfd-199-221"),
  name: "Prodigal Explorer",
  rarity: "rare",
  rulesText:
    "[Exhaust]: [Reaction] — Draw 1. Use only if you've chosen enemy units and/or gear twice this turn with spells or unit abilities.",
  setId: "SFD",
};
