import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const pykeDocksideButcher: UnitCard = {
  cardNumber: 28,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("unl-028-219"),
  isChampion: true,
  might: 2,
  name: "Pyke, Dockside Butcher",
  rarity: "epic",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Ganking] (I can move from battlefield to battlefield.)\nYou may pay [fury] as an additional cost to play me.\nWhen you play me, if you paid the additional cost, ready me and give me +2 [Might] this turn.",
  setId: "UNL",
  tags: ["Pyke"],
};
