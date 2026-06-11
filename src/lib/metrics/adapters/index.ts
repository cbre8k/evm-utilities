import { zeroXAdapter } from "./zeroX";
import { oneInchAdapter } from "./oneInch";
import { okxAdapter } from "./okx";
import { stormlinkAdapter } from "./stormlink";
import type { QuoteAdapter } from "./base";

export const ADAPTERS: QuoteAdapter[] = [
  zeroXAdapter,
  oneInchAdapter,
  okxAdapter,
  stormlinkAdapter,
];
