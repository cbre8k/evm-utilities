import { NextRequest, NextResponse } from "next/server";
import { NETWORKS } from "@/lib/constants";
import type { StandardizedQuote } from "@/lib/metrics/types";

const BACKENDURL = process.env.BACKENDURL || 'http://localhost:4000';

type TxData = {
  data: string;
  to: string;
  value: string;
  approveSpender: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
    value: asString(txRecord.value) || "0",
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
      value: asString(methodParameters?.value) || "0",
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
      value: asString(routeMethodParameters?.value) || "0",
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

const KYBER_CHAIN_PATHS: Record<number, string> = {
  1: "ethereum",
  56: "bsc",
  42161: "arbitrum",
  10: "optimism",
  8453: "base",
};

async function buildKyberTx(chainId: number, raw: unknown, userAddress: string): Promise<TxData | null> {
  const chainPath = KYBER_CHAIN_PATHS[chainId];
  const routeSummary = asRecord(asRecord(asRecord(raw)?.data)?.routeSummary);
  if (!chainPath || !routeSummary) return null;

  const res = await fetch(`https://aggregator-api.kyberswap.com/${chainPath}/api/v1/route/build`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": "kyberswap",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({
      routeSummary,
      sender: userAddress,
      recipient: userAddress,
      origin: userAddress,
      slippageTolerance: 100,
    }),
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.json() as {
    code?: number;
    message?: string;
    data?: {
      routerAddress?: string;
      data?: string;
      transactionValue?: string;
    };
  };

  if (!res.ok || (data.code !== undefined && data.code !== 0) || !data.data?.routerAddress || !data.data?.data) {
    throw new Error(`Kyber build failed: ${data.message || `HTTP ${res.status}`}`);
  }

  return {
    to: data.data.routerAddress,
    data: data.data.data,
    value: data.data.transactionValue || "0",
    approveSpender: data.data.routerAddress,
  };
}

async function getTxData(quote: StandardizedQuote, chainId: number, userAddress: string): Promise<TxData | null> {
  const staticTx = extractStaticTxData(quote.raw);
  if (staticTx) return staticTx;

  if (quote.provider === "kyber") {
    return buildKyberTx(chainId, quote.raw, userAddress);
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      chainId?: number;
      tokenIn?: string;
      tokenOut?: string;
      userAddress?: string;
      quotes?: StandardizedQuote[];
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
    const rpcUrl = network?.fullnodeRpcUrls.find(Boolean) || "https://ethereum-rpc.publicnode.com";

    // Build the Foundry Script
    let scriptContent = `
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;
import "forge-std/Test.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SimulateQuotes is Test {
    address tokenIn = ${tokenIn};
    address tokenOut = ${tokenOut};
    address userAddress = ${userAddress};

    function setUp() public {
        vm.createSelectFork("${rpcUrl}");
    }

`;

    let testIndex = 0;
    const simulatedProviders: string[] = [];
    const skippedProviders: Array<{ provider: string; reason: string }> = [];
    
    scriptContent += `
    function testSimulation() public {
`;

    for (const quote of quotes) {
      if (!quote.success) {
        skippedProviders.push({ provider: quote.provider, reason: "quote_failed" });
        continue;
      }
      const txData = await getTxData(quote, chainId, userAddress);
      if (!txData) {
        skippedProviders.push({ provider: quote.provider, reason: "missing_calldata" });
        continue;
      }

      scriptContent += `        try this.simulateAndLog("${quote.provider}", ${txData.to}, ${txData.approveSpender}, ${txData.value}, hex"${txData.data.replace('0x', '')}") {} catch { console.log("[SIM_RESULT] provider=${quote.provider} gas=0 output=0 error=exception"); }\n`;
      simulatedProviders.push(quote.provider);
      testIndex++;
    }

    scriptContent += `    }
`;

    if (testIndex === 0) {
      return NextResponse.json({ error: "No simulatable quotes found (missing tx data)" }, { status: 400 });
    }

    scriptContent += `
    function simulateAndLog(string memory provider, address to, address approveSpender, uint256 value, bytes memory data) public {
        vm.startPrank(userAddress);
        
        if (tokenIn != 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE && tokenIn != address(0)) {
            // Approve type(uint256).max
            (bool successApprove, ) = tokenIn.call(abi.encodeWithSignature("approve(address,uint256)", approveSpender, type(uint256).max));
            if (!successApprove) {
                vm.stopPrank();
                console.log(string(abi.encodePacked("[SIM_RESULT] provider=", provider, " gas=0 output=0 error=approve_failed")));
                return;
            }
        }
        
        uint256 balBefore = 0;
        if (tokenOut != 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE && tokenOut != address(0)) {
            balBefore = IERC20(tokenOut).balanceOf(userAddress);
        } else {
            balBefore = userAddress.balance;
        }

        uint256 gasBefore = gasleft();
        (bool success, ) = to.call{value: value}(data);
        uint256 gasUsed = gasBefore - gasleft();

        uint256 balAfter = 0;
        if (tokenOut != 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE && tokenOut != address(0)) {
            balAfter = IERC20(tokenOut).balanceOf(userAddress);
        } else {
            balAfter = userAddress.balance;
        }
        
        vm.stopPrank();

        if (success) {
            console.log(string(abi.encodePacked("[SIM_RESULT] provider=", provider, " gas=", vm.toString(gasUsed), " output=", vm.toString(balAfter - balBefore))));
        } else {
            console.log(string(abi.encodePacked("[SIM_RESULT] provider=", provider, " gas=0 output=0 error=revert")));
        }
    }
}
`;

    const inputs = {
      rpcUrl,
      scriptContent,
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
