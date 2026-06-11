import { NextRequest, NextResponse } from "next/server";
import { NETWORKS } from "@/lib/constants";
import type { StandardizedQuote } from "@/lib/metrics/types";
import { getAddress } from "ethers";

const BACKENDURL = process.env.BACKENDURL || 'http://localhost:4000';
const DEFAULT_SIMULATION_RPC = "https://ethereum-rpc.publicnode.com";
const TRACE_CALL_MANY_RPC_BY_CHAIN: Record<number, string[]> = {
  1: [
    ...(process.env.TRACE_CALL_MANY_MAINNET_RPCS || "")
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean),
    process.env.TRACE_CALL_MANY_MAINNET_RPC || "https://api.zan.top/node/v1/eth/mainnet/ce4d3c74601a49e082d5065f5c170e68",
    "https://api.zan.top/node/v1/eth/mainnet/cf8b6e95c5ee483b84df3a697d5b5040",
  ],
};
const simulateRpcCursorByChain = new Map<number, number>();

type TxData = {
  data: string;
  to: string;
  value: string;
  approveSpender: string;
};

function normalizeSimulationToken(address: string): string {
  const clean = address.toLowerCase();
  if (
    clean === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" ||
    clean === "0x0000000000000000000000000000000000000000"
  ) {
    return clean;
  }
  return getAddress(address);
}

function maskRpcUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.username) url.username = "***";
    if (url.password) url.password = "***";

    for (const key of url.searchParams.keys()) {
      if (/key|token|secret|auth|api/i.test(key)) {
        url.searchParams.set(key, "***");
      }
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts.at(-1);
    if (last && last.length > 12 && /[a-z0-9_-]{12,}/i.test(last)) {
      parts[parts.length - 1] = `${last.slice(0, 4)}...${last.slice(-4)}`;
      url.pathname = `/${parts.join("/")}`;
    }

    return url.toString();
  } catch {
    return rawUrl.replace(/([?&](?:api_?key|key|token|secret|auth)=)[^&]+/gi, "$1***");
  }
}

function pickSimulationRpc(chainId: number, rpcUrls?: string[]): { rpcUrl: string; index: number; total: number } {
  const urls = [...new Set((rpcUrls || []).map((url) => url.trim()).filter(Boolean))];
  if (urls.length === 0) {
    return { rpcUrl: DEFAULT_SIMULATION_RPC, index: 0, total: 1 };
  }

  const cursor = simulateRpcCursorByChain.get(chainId) || 0;
  const index = cursor % urls.length;
  simulateRpcCursorByChain.set(chainId, (index + 1) % urls.length);

  return {
    rpcUrl: urls[index],
    index,
    total: urls.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asTxValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return asString(value) || "0";
}

function parseOkxApproveSpender(tx: Record<string, unknown>, fallback: string): string {
  const signatureData = tx.signatureData;
  const firstSignature = Array.isArray(signatureData) ? signatureData[0] : signatureData;
  if (typeof firstSignature !== "string") return fallback;

  try {
    const parsed = JSON.parse(firstSignature) as unknown;
    const approveContract = asString(asRecord(parsed)?.approveContract);
    return approveContract || fallback;
  } catch {
    return fallback;
  }
}

function txFromRecord(tx: unknown, approveSpender?: string): TxData | null {
  const txRecord = asRecord(tx);
  if (!txRecord) return null;

  const to = asString(txRecord.to);
  const data = asString(txRecord.data) || asString(txRecord.calldata);
  if (!to || !data) return null;

  return {
    data,
    to,
    value: asTxValue(txRecord.value),
    approveSpender: approveSpender || to,
  };
}

function extractStaticTxData(raw: unknown): TxData | null {
  const root = asRecord(raw);
  if (!root) return null;

  const rootTx = txFromRecord(root.tx);
  if (rootTx) return rootTx;

  const rootDataTx = txFromRecord(root);
  if (rootDataTx) return rootDataTx;

  const result = asRecord(root.result);
  const methodParameters = asRecord(result?.methodParameters) || asRecord(root.methodParameters);
  const calldata = asString(methodParameters?.calldata);
  const methodTo = asString(methodParameters?.to);
  if (calldata && methodTo) {
    return { 
      data: calldata,
      to: methodTo,
      value: asTxValue(methodParameters?.value),
      approveSpender: methodTo,
    };
  }

  const route = asRecord(root.route);
  const routeMethodParameters = asRecord(route?.methodParameters);
  const routeCalldata = asString(routeMethodParameters?.calldata);
  const routeTo = asString(routeMethodParameters?.to);
  if (routeCalldata && routeTo) {
    return {
      data: routeCalldata,
      to: routeTo,
      value: asTxValue(routeMethodParameters?.value),
      approveSpender: routeTo,
    }
  }

  const transactionRequest = txFromRecord(root.transactionRequest);
  if (transactionRequest) return transactionRequest;

  const firstData = Array.isArray(root.data) ? asRecord(root.data[0]) : asRecord(root.data);
  const okxTxRecord = asRecord(firstData?.tx);
  const okxTx = txFromRecord(okxTxRecord, okxTxRecord ? parseOkxApproveSpender(okxTxRecord, asString(okxTxRecord.to) || "") : undefined);
  if (okxTx) return okxTx;

  const zeroXTransaction = txFromRecord(
    root.transaction,
    asString(asRecord(asRecord(root.issues)?.allowance)?.spender) || asString(root.allowanceTarget)
  );
  if (zeroXTransaction) return zeroXTransaction;

  return null;
}

async function getTxData(quote: StandardizedQuote): Promise<TxData | null> {
  const staticTx = extractStaticTxData(quote.raw);
  if (staticTx) return staticTx;

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      chainId: number;
      tokenIn: string;
      tokenOut: string;
      userAddress: string;
      quotes: StandardizedQuote[];
      blockNumber?: string;
    };

    const { chainId, tokenIn, tokenOut, userAddress, quotes } = body;

    if (!chainId || !tokenIn || !tokenOut || !userAddress || !quotes || quotes.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const network = NETWORKS.find((n) => {
      const mappedChainId =
        n.id === "mainnet" ? 1 :
        n.id === "bsc" ? 56 :
        n.id === "arbitrum" ? 42161 :
        n.id === "optimism" ? 10 :
        n.id === "base" ? 8453 :
        0;
      return mappedChainId === chainId;
    });
    const selectedRpc = pickSimulationRpc(
      chainId,
      TRACE_CALL_MANY_RPC_BY_CHAIN[chainId] || network?.fullnodeRpcUrls
    );
    const rpcUrl = selectedRpc.rpcUrl;
    console.info(
      `[Aggregator Simulate] mode=traceCallMany chain=${chainId} rpc=${maskRpcUrl(rpcUrl)} rpcSlot=${selectedRpc.index + 1}/${selectedRpc.total} block=latest providers=${quotes.length}`
    );

    const traceQuotes: Array<{
      provider: string;
      to: string;
      data: string;
      value: string;
      approveSpender: string;
      decodeReturnAmount: boolean;
    }> = [];
    const simulatedProviders: string[] = [];
    const skippedProviders: Array<{ provider: string; reason: string }> = [];

    for (const quote of quotes) {
      if (!quote.success) {
        skippedProviders.push({ provider: quote.provider, reason: "quote_failed" });
        continue;
      }
      let txData;
      try {
        txData = await getTxData(quote);
      } catch (err) {
        console.error(`[Simulate Route] Failed to get tx data for ${quote.provider}:`, err);
        skippedProviders.push({ provider: quote.provider, reason: "build_failed" });
        continue;
      }
      
      if (!txData) {
        skippedProviders.push({ provider: quote.provider, reason: "missing_calldata" });
        continue;
      }

      traceQuotes.push({
        provider: quote.provider,
        to: getAddress(txData.to),
        data: txData.data,
        value: txData.value,
        approveSpender: getAddress(txData.approveSpender),
        decodeReturnAmount: quote.provider === "stormlink",
      });
      simulatedProviders.push(quote.provider);
    }

    if (traceQuotes.length === 0) {
      return NextResponse.json({ error: "No simulatable quotes found (missing tx data)" }, { status: 400 });
    }

    const inputs = {
      mode: "traceCallMany",
      rpcUrl,
      chainId,
      blockNumber: body.blockNumber,
      userAddress: getAddress(userAddress),
      tokenIn: normalizeSimulationToken(tokenIn),
      tokenOut: normalizeSimulationToken(tokenOut),
      amountInRaw: quotes[0]?.amountInRaw || "0",
      quotes: traceQuotes,
    };

    const backendRes = await fetch(`${BACKENDURL}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs })
    });

    if (!backendRes.ok) {
      const err = await backendRes.text();
      return NextResponse.json({ error: err }, { status: backendRes.status });
    }

    const data = await backendRes.json();
    return NextResponse.json({
      ...data,
      simulatedProviders,
      skippedProviders,
    });

  } catch (err) {
    console.error("[Simulate Route Error]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
