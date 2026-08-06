import { parseAbilities } from "/root/src/tcg/tcg-engines/packages/riftbound-cards/src/parser/index.ts";
const txt = process.argv[2];
console.log(JSON.stringify(parseAbilities(txt), null, 1));
