'use client';

import { useState } from 'react';
import BigNumber from 'bignumber.js';
import styles from './converter.module.scss';
import { AUTHOR, GITHUB } from '@/lib/constants';
import { Badge, CopyButton, Input, Label, Status, TabBar, Textarea, type TabBarItem, TopStatsBar } from '@/components/ui';

type Tab = 'units' | 'bytes';

const CONVERTER_TABS: TabBarItem<Tab>[] = [
  { id: 'units', label: '[ UNIT CONVERTER ]' },
  { id: 'bytes', label: '[ BYTE DECODER ]' },
];

const UNITS = [
  { name: 'WEI', factor: 0 },
  { name: 'GWEI', factor: 9 },
  { name: 'ETHER', factor: 18 },
];

const PANIC_CODES: Record<number, string> = {
  0x00: 'Generic compiler panic',
  0x01: 'Assert condition failed',
  0x11: 'Arithmetic overflow/underflow',
  0x12: 'Division or modulo by zero',
  0x21: 'Conversion to invalid enum value',
  0x22: 'Incorrectly encoded storage byte array',
  0x31: 'Pop on empty array',
  0x32: 'Array index out of bounds',
  0x41: 'Too much memory allocated',
  0x51: 'Called zero-initialized function',
};

function hexToString(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length < 2 || clean.length % 2 !== 0) return '';

  const selector = clean.slice(0, 8);

  // Error(string) — selector 08c379a0
  if (selector === '08c379a0' && clean.length >= 8 + 64 + 64) {
    const dataHex = clean.slice(8);
    const lengthHex = dataHex.slice(64, 128);
    const strLength = parseInt(lengthHex, 16);
    if (!isNaN(strLength) && strLength > 0 && strLength < 10000) {
      const strHex = dataHex.slice(128, 128 + strLength * 2);
      return `Error: ${decodeHexBytes(strHex)}`;
    }
  }

  // Panic(uint256) — selector 4e487b71
  if (selector === '4e487b71' && clean.length >= 8 + 64) {
    const codeHex = clean.slice(8, 72);
    const code = parseInt(codeHex, 16);
    const description = PANIC_CODES[code] || `Unknown panic code`;
    return `Panic(0x${code.toString(16).padStart(2, '0')}): ${description}`;
  }

  // Custom error — has a 4-byte selector but not Error/Panic
  // if (clean.length >= 8 && /^[0-9a-fA-F]{8}/.test(clean)) {
  //   // Try to decode remaining data as raw string (best-effort)
  //   const rawDecode = decodeHexBytes(clean.slice(8));
  //   if (rawDecode && /^[\x20-\x7e]+$/.test(rawDecode)) {
  //     return `Custom Error (0x${selector}): ${rawDecode}`;
  //   }
  //   return `Custom Error (0x${selector})`;
  // }

  // Detect any ABI-encoded string (starts with offset 0x20 = 32)
  if (clean.length >= 128 && clean.startsWith('0000000000000000000000000000000000000000000000000000000000000020')) {
    const lengthHex = clean.slice(64, 128);
    const strLength = parseInt(lengthHex, 16);
    if (!isNaN(strLength) && strLength > 0 && strLength < 10000) {
      const strHex = clean.slice(128, 128 + strLength * 2);
      return decodeHexBytes(strHex);
    }
  }

  return decodeHexBytes(clean);
}

function decodeHexBytes(hex: string): string {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(byte)) return '';
    if (byte === 0) continue;
    bytes.push(byte);
  }
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return '';
  }
}

function stringToHex(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function Converter() {
  const [activeTab, setActiveTab] = useState<Tab>('units');
  const [weiValue, setWeiValue] = useState<string>('1000000000');
  const [bytesInput, setBytesInput] = useState<string>('');
  const [stringOutput, setStringOutput] = useState<string>('');

  const handleInputChange = (value: string, factor: number) => {
    if (!value) { setWeiValue(''); return; }
    const cleanValue = value.replace(/[^0-9.-]/g, '');
    try {
      const bn = new BigNumber(cleanValue);
      if (bn.isNaN()) return;
      setWeiValue(bn.multipliedBy(new BigNumber(10).pow(factor)).toFixed());
    } catch { /* ignore */ }
  };

  const calculateValue = (factor: number): string => {
    if (!weiValue) return '';
    try {
      return new BigNumber(weiValue).dividedBy(new BigNumber(10).pow(factor)).toFixed();
    } catch { return ''; }
  };

  return (
    <div className={styles.page}>
      <div className={styles.statsBanner}>
        <div className={styles.statsLeft}>
          <div className={styles.statsLeftTop}>
            <div className={styles.mainInfo}>
              <div className={styles.statsHeader}>
                <span className={styles.username} style={{ cursor: 'pointer' }} onClick={() => window.open(GITHUB, '_blank')}>{AUTHOR}</span>
                <Badge fontSize={9}>CONVERTER</Badge>
              </div>
              <div className={styles.addressBox}>EVM UTILITIES SUITE</div>
            </div>
            <TopStatsBar
              className={styles.headerStats}
              columns="1fr"
              items={[
                {
                  label: 'MODULE',
                  value: <Status tone="success" fontSize={12}>{activeTab === 'units' ? 'UNITS' : 'BYTES'}</Status>,
                },
              ]}
              padX={16}
              padY={8}
            />
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <TabBar activeTab={activeTab} items={CONVERTER_TABS} onChange={setActiveTab} fontSize={12} />
      </div>

      <div className={styles.workspace}>
        <div className={styles.converterCard}>
          {activeTab === 'units' ? (
            <div className={styles.fields}>
              <div className={`${styles.corner} ${styles.topLeft}`}></div>
              <div className={`${styles.corner} ${styles.topRight}`}></div>
              <div className={`${styles.corner} ${styles.bottomLeft}`}></div>
              <div className={`${styles.corner} ${styles.bottomRight}`}></div>
              {UNITS.map((unit) => (
                <div key={unit.name} className={styles.field}>
                  <Label hint={unit.name === 'WEI' ? '1e0' : unit.name === 'GWEI' ? '1e9' : '1e18'}>{unit.name}</Label>
                  <div className={styles.inputRow}>
                    <Input
                      className={styles.input}
                      fontSize={12}
                      value={calculateValue(unit.factor)}
                      onChange={(e) => handleInputChange(e.target.value, unit.factor)}
                      placeholder="0"
                    />
                    <CopyButton text={calculateValue(unit.factor)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.fields}>
              <div className={`${styles.corner} ${styles.topLeft}`}></div>
              <div className={`${styles.corner} ${styles.topRight}`}></div>
              <div className={`${styles.corner} ${styles.bottomLeft}`}></div>
              <div className={`${styles.corner} ${styles.bottomRight}`}></div>
              <Textarea
                className={styles.textarea}
                fontSize={12}
                hint="Raw hex data, revert strings, or panic codes. For custom errors, use the Selector tool instead"
                label="HEX BYTES"
                placeholder="0x4e487b710000000000000000000000000000000000000000000000000000000000000011"
                rows={4}
                value={bytesInput}
                onChange={(e) => {
                  setBytesInput(e.target.value);
                  setStringOutput(hexToString(e.target.value.trim()));
                }}
              />

              <div className={styles.arrowBox}>
                <span>↓ DECODES TO ↓</span>
              </div>

              <div className={styles.field}>
                <Label hint='Decoded human-readable text'>ASCII / UTF-8 STRING</Label>
                <div className={styles.inputRow}>
                  <Input
                    className={styles.input}
                    fontSize={12}
                    value={stringOutput}
                    onChange={(e) => {
                      setStringOutput(e.target.value);
                      setBytesInput(stringToHex(e.target.value));
                    }}
                    placeholder="Panic(0x11): 'Arithmetic overflow/underflow'"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
