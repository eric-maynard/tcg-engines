import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const grandmasterAtArms: LegendCard = {
  cardNumber: 193,
  cardType: "legend",
  championTag: "Jax",
  domain: ["calm", "body"],
  id: createCardId("sfd-193-221"),
  name: "Grandmaster at Arms",
  rarity: "rare",
  rulesText:
    "[1], [Exhaust]: Attach a detached Equipment you control to a unit you control.\n[Exhaust]: Attach an attached Equipment you control to a unit you control.",
  setId: "SFD",
};
