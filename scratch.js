const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});

async function test() {
  const queryUrl = `${env.STORMLINK_API_URL}/v1/routes/swap`;
  const requestBody = {
    chainId: 1,
    tokenInAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    tokenOutAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    amount: "10",
    excludeFee: true,
    excludeTokenFee: true,
    exchanges: [],
    cacheMode: 0,
    from: "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
    deadline: "1000000",
    slippage: "1.00",
    testMode: false,
    reusePools: true
  };
  const headers = { "Content-Type": "application/json" };
  if (env.STORMLINK_API_KEY) headers["X-API-Key"] = env.STORMLINK_API_KEY;

  const res = await fetch(queryUrl, { method: "POST", headers, body: JSON.stringify(requestBody) });
  const data = await res.json();
  console.log("Stormlink Response result gasUse:", data.result?.gasUse, data.result?.gasUseEstimated, data.route?.gasUse);
  console.log("Keys:", Object.keys(data.result));
}
test();
