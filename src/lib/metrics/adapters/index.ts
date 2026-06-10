import { zeroXAdapter } from "./zeroX";
import { oneInchAdapter } from "./oneInch";
import { okxAdapter } from "./okx";
import { kyberAdapter } from "./kyber";
import { stormlinkAdapter } from "./stormlink";
import { lifiAdapter } from "./lifi";
import type { QuoteAdapter } from "./base";

export const ADAPTERS: QuoteAdapter[] = [
  zeroXAdapter,
  oneInchAdapter,
  okxAdapter,
  kyberAdapter,
  stormlinkAdapter,
  lifiAdapter,
];
