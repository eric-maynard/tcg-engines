import { getAllCards } from "@tcg/riftbound-cards";

const cards = getAllCards();
for (const c of cards) {
  const abilities = (c as any).abilities ?? [];
  for (const a of abilities) {
    const t = a.effect?.target;
    if (!t) {continue;}
    if (t.type !== "rune") {continue;}
    // Cast-from-hand-with-target: spell with action timing OR activated
    if ((a.type === "spell" && (a.timing == null || a.timing === "action")) || a.type === "activated") {
      console.log(`PLAYABLE: ${c.id} ${c.name} cardType=${c.cardType} abilityType=${a.type} timing=${a.timing}`);
    } else {
      console.log(`  trig:  ${c.id} ${c.name} cardType=${c.cardType} abilityType=${a.type}`);
    }
  }
}
