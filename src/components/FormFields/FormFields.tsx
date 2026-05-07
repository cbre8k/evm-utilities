import styles from './FormFields.module.scss';

interface TraceInputProps {
  rpcUrl: string;
  setRpcUrl: (val: string) => void;
  txHash: string;
  setTxHash: (val: string) => void;
  quick: boolean;
  setQuick: (val: boolean) => void;
}

export function TraceFields({ rpcUrl, setRpcUrl, txHash, setTxHash, quick, setQuick }: TraceInputProps) {
  return (
    <div className={styles.formGroup}>
      <div className={styles.field}>
        <label className={styles.label}>RPC URL</label>
        <span className={styles.hint}>Archive node endpoint for historical state</span>
        <input
          className={styles.input}
          placeholder="https://rpc.ankr.com/eth/..."
          value={rpcUrl}
          onChange={(e) => setRpcUrl(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Transaction Hash</label>
        <span className={styles.hint}>Hash of the transaction to trace</span>
        <input
          className={styles.input}
          placeholder="0x..."
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
        />
      </div>
      <div className={styles.checkboxWrapper}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={quick}
            onChange={(e) => setQuick(e.target.checked)}
          />
          Quick trace
        </label>
        <span className={styles.hint}>Executes the transaction only with the state from the previous block.<br />May result in different results than the live execution!</span>
      </div>
    </div>
  );
}

interface SimulateInputProps {
  sender: string;
  setSender: (val: string) => void;
  shouldDealToken: boolean;
  setShouldDealToken: (val: boolean) => void;
  tokenAddress: string;
  setTokenAddress: (val: string) => void;
  spender: string;
  setSpender: (val: string) => void;
  amount: string;
  setAmount: (val: string) => void;
  calldata: string;
  setCalldata: (val: string) => void;
  to: string;
  setTo: (val: string) => void;
  msgValue: string;
  setMsgValue: (val: string) => void;
  shouldForkBlock: boolean;
  setShouldForkBlock: (val: boolean) => void;
  blockNumber: string;
  setBlockNumber: (val: string) => void;
  rpcUrl: string;
  setRpcUrl: (val: string) => void;
}

export function SimulateFields({
  sender,
  setSender,
  shouldDealToken,
  setShouldDealToken,
  tokenAddress,
  setTokenAddress,
  spender,
  setSpender,
  amount,
  setAmount,
  calldata,
  setCalldata,
  to,
  setTo,
  msgValue,
  setMsgValue,
  shouldForkBlock,
  setShouldForkBlock,
  blockNumber,
  setBlockNumber,
  rpcUrl,
  setRpcUrl,
}: SimulateInputProps) {
  return (
    <div className={styles.formGroup}>
      <div className={styles.field}>
        <label className={styles.label}>RPC URL</label>
        <span className={styles.hint}>Archive node endpoint for historical state</span>
        <input
          className={styles.input}
          placeholder="https://rpc.ankr.com/eth/..."
          value={rpcUrl}
          onChange={(e) => setRpcUrl(e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Sender</label>
          <span className={styles.hint}>Address initiating the transaction (msg.sender)</span>
          <input
            className={styles.input}
            placeholder="0x..."
            value={sender}
            onChange={(e) => setSender(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Target</label>
          <span className={styles.hint}>Contract address to call</span>
          <input
            className={styles.input}
            placeholder="0x..."
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.checkboxWrapper}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={shouldDealToken}
            onChange={(e) => setShouldDealToken(e.target.checked)}
          />
          Approve token
        </label>
        <span className={styles.hint}>Override token balances to ensure simulation succeeds</span>
      </div>

      {shouldDealToken && (
        <div className={styles.section}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Token Address</label>
              <span className={styles.hint}>ERC20 contract address</span>
              <input
                className={styles.input}
                placeholder="0x..."
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Amount (wei)</label>
              <span className={styles.hint}>Raw token amount to approve</span>
              <input
                className={styles.input}
                placeholder="1000000000000000000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Spender</label>
            <span className={styles.hint}>Address to grant allowance to</span>
            <input
              className={styles.input}
              placeholder="0x..."
              value={spender}
              onChange={(e) => setSpender(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className={styles.checkboxWrapper}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={shouldForkBlock}
            onChange={(e) => setShouldForkBlock(e.target.checked)}
          />
          Fork block
        </label>
        <span className={styles.hint}>Simulate using historical blockchain state</span>
      </div>

      {shouldForkBlock && (
        <div className={styles.section}>
          <div className={styles.field}>
            <label className={styles.label}>Block Number</label>
            <span className={styles.hint}>Simulate at a specific historical block</span>
            <input
              className={styles.input}
              placeholder="0"
              value={blockNumber}
              onChange={(e) => setBlockNumber(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label}>Value (ETH)</label>
        <span className={styles.hint}>Amount of ETH to send with call (msg.value)</span>
        <input
          className={styles.input}
          placeholder="0"
          value={msgValue}
          onChange={(e) => setMsgValue(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Calldata</label>
        <span className={styles.hint}>Hex-encoded transaction payload</span>
        <textarea
          className={styles.textarea}
          rows={4}
          placeholder="0x..."
          value={calldata}
          onChange={(e) => setCalldata(e.target.value)}
        />
      </div>
    </div>
  );
}
