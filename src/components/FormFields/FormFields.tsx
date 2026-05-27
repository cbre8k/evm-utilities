import { useEffect, useRef, useState } from 'react';
import styles from './FormFields.module.scss';
import { Checkbox, Input, Textarea } from '@/components/ui';
import { getAddress } from 'ethers';

const SCALE_OPTIONS = [6, 9, 12, 15, 18] as const;

function checksumAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return getAddress(trimmed.toLowerCase());
  } catch {
    return value;
  }
}

function scaleDecimalValue(value: string, exponent: number): string {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const normalized = trimmed.replaceAll(',', '');
  if (!/^\d+(?:\.\d*)?$|^\.\d+$/.test(normalized)) return value;

  const [wholePart, fractionalPart = ''] = normalized.split('.');
  const meaningfulFraction = fractionalPart.replace(/0+$/, '');
  if (meaningfulFraction.length > exponent) return value;

  const whole = wholePart || '0';
  const fraction = fractionalPart.padEnd(exponent, '0').slice(0, exponent);
  const scaled = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');

  return scaled || '0';
}

interface ScaleSelectorProps {
  onScale: (value: string) => void;
  value: string;
}

function ScaleSelector({ onScale, value }: ScaleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={styles.scaleSelector} ref={menuRef}>
      <button
        type="button"
        className={styles.scaleButton}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>Scale</span>
        <span className={styles.scaleChevron} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className={styles.scaleMenu} role="menu">
          {SCALE_OPTIONS.map((exponent) => (
            <button
              key={exponent}
              type="button"
              className={styles.scaleOption}
              role="menuitem"
              onClick={() => {
                onScale(scaleDecimalValue(value, exponent));
                setIsOpen(false);
              }}
            >
              x10<sup>{exponent}</sup>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
      <Input
        label="RPC URL"
        hint="Archive node endpoint for historical state"
        placeholder="https://rpc.ankr.com/eth"
        value={rpcUrl}
        onChange={(e) => setRpcUrl(e.target.value)}
      />
      <Input
        label="Transaction Hash"
        hint="Hash of the transaction to trace"
        placeholder="0x7686d80c3947cc80babeb1689117884195b0b3d45b0db6bf91defcfc9f1f1394"
        value={txHash}
        onChange={(e) => setTxHash(e.target.value)}
      />
      <Checkbox
        checked={quick}
        onChange={(e) => setQuick(e.target.checked)}
        hint="Executes the transaction only with the state from the previous block. May result in different results than the live execution"
      >
        Quick trace
      </Checkbox>
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
      <Input
        label="RPC URL"
        hint="Archive node endpoint for historical state"
        placeholder="https://rpc.ankr.com/eth"
        value={rpcUrl}
        onChange={(e) => setRpcUrl(e.target.value)}
      />

      <div className={styles.row}>
        <Input
          label="Sender"
          hint="Address initiating the transaction (msg.sender)"
          placeholder="0x0000000000000000000000000000000000000000"
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          onBlur={(e) => setSender(checksumAddress(e.target.value))}
        />
        <Input
          label="Target"
          hint="Contract address to call"
          placeholder="0x0000000000000000000000000000000000000000"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={(e) => setTo(checksumAddress(e.target.value))}
        />
      </div>

      <Checkbox
        checked={shouldDealToken}
        onChange={(e) => setShouldDealToken(e.target.checked)}
        hint="Override token balances to ensure simulation succeeds"
      >
        Approve token
      </Checkbox>

      {shouldDealToken && (
        <div className={styles.section}>
          <div className={styles.row}>
            <Input
              label="Token Address"
              hint="ERC20 contract address"
              placeholder="0x0000000000000000000000000000000000000000"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              onBlur={(e) => setTokenAddress(checksumAddress(e.target.value))}
            />
            <Input
              label="Amount (wei)"
              hint="Raw token amount to approve"
              placeholder="1000000000000000000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              suffix={<ScaleSelector value={amount} onScale={setAmount} />}
            />
          </div>
          <Input
            label="Spender"
            hint="Address to grant allowance to"
            placeholder="0x0000000000000000000000000000000000000000"
            value={spender}
            onChange={(e) => setSpender(e.target.value)}
            onBlur={(e) => setSpender(checksumAddress(e.target.value))}
          />
        </div>
      )}

      <Checkbox
        checked={shouldForkBlock}
        onChange={(e) => setShouldForkBlock(e.target.checked)}
        hint="Simulate using historical blockchain state"
      >
        Fork block
      </Checkbox>

      {shouldForkBlock && (
        <div className={styles.section}>
          <Input
            label="Block Number"
            hint="Simulate at a specific historical block"
            placeholder="0"
            value={blockNumber}
            onChange={(e) => setBlockNumber(e.target.value)}
          />
        </div>
      )}

      <Input
        label="Value (wei)"
        hint="Raw ETH value to send with call (msg.value)"
        placeholder="0"
        value={msgValue}
        onChange={(e) => setMsgValue(e.target.value)}
        suffix={<ScaleSelector value={msgValue} onScale={setMsgValue} />}
      />

      <Textarea
        className={styles.textarea}
        label="Calldata"
        hint="Hex-encoded transaction payload"
        rows={4}
        placeholder="0x0"
        value={calldata}
        onChange={(e) => setCalldata(e.target.value)}
      />
    </div>
  );
}
