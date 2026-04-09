import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const atakhan: UnitCard = {
  cardNumber: 170,
  cardType: "unit",
  domain: "order",
  energyCost: 10,
  id: createCardId("unl-170-219"),
  might: 7,
  name: "Atakhan",
  rarity: "rare",
  rulesText:
    "You may kill a friendly unit as an additional cost to play me. If you do, I cost [1] less for each Energy it costs and [order] less for each Power it costs.\n[Ganking] (I can move from battlefield to battlefield.)\nWhen I attack, the defender must kill one of their units here.",
  setId: "UNL",
};
