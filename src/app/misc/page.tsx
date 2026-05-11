'use client';

import { useState, useEffect } from 'react';
import { Table, message } from 'antd';
import BigNumber from 'bignumber.js';
import { AUTHOR, FOURBYTE_API, GITHUB } from '@/lib/constants';
import { Badge, Button, CopyButton, Hint, Input, Label, Status, Textarea, TopStatsBar } from '@/components/ui';
import styles from './misc.module.scss';

// ── Signature types ──────────────────────────────────────────
interface SignatureResult {
  hash: string;
  name: string;
  filtered: boolean;
  hasVerifiedContract: boolean;
  type: 'function' | 'event';
}

type SignatureApiItem = { filtered: boolean; hasVerifiedContract: boolean; name: string };
type SignatureApiBuckets = Partial<Record<'function' | 'event', Record<string, SignatureApiItem[]>>>;

// ── Converter helpers ────────────────────────────────────────
const UNITS = [
  { name: 'WEI', factor: 0, hint: '1e0' },
  { name: 'GWEI', factor: 9, hint: '1e9' },
  { name: 'ETHER', factor: 18, hint: '1e18' },
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

function hexToString(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length < 2 || clean.length % 2 !== 0) return '';
  const selector = clean.slice(0, 8);

  if (selector === '08c379a0' && clean.length >= 8 + 64 + 64) {
    const dataHex = clean.slice(8);
    const lengthHex = dataHex.slice(64, 128);
    const strLength = parseInt(lengthHex, 16);
    if (!isNaN(strLength) && strLength > 0 && strLength < 10000) {
      return `Error: ${decodeHexBytes(dataHex.slice(128, 128 + strLength * 2))}`;
    }
  }

  if (selector === '4e487b71' && clean.length >= 8 + 64) {
    const code = parseInt(clean.slice(8, 72), 16);
    return `Panic(0x${code.toString(16).padStart(2, '0')}): ${PANIC_CODES[code] || 'Unknown panic code'}`;
  }

  if (clean.length >= 128 && clean.startsWith('0000000000000000000000000000000000000000000000000000000000000020')) {
    const strLength = parseInt(clean.slice(64, 128), 16);
    if (!isNaN(strLength) && strLength > 0 && strLength < 10000) {
      return decodeHexBytes(clean.slice(128, 128 + strLength * 2));
    }
  }

  return decodeHexBytes(clean);
}

function stringToHex(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Component ────────────────────────────────────────────────
export default function MiscPage() {
  // Signature state
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SignatureResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [dbStatus, setDbStatus] = useState<'ONLINE' | 'OFFLINE' | 'LOADING'>('LOADING');
  const [signatureCount, setSignatureCount] = useState<string>('---');

  // Unit converter state
  const [weiValue, setWeiValue] = useState<string>('1000000000');

  // Byte decoder state
  const [bytesInput, setBytesInput] = useState<string>('');
  const [stringOutput, setStringOutput] = useState<string>('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(FOURBYTE_API.STATS);
        const data = await response.json();
        const total = data.result?.count?.total;
        if (data.ok && typeof total === 'number') {
          setDbStatus('ONLINE');
          setSignatureCount(total >= 1000000 ? `${(total / 1000000).toFixed(1)}M+` : total >= 1000 ? `${(total / 1000).toFixed(1)}K+` : total.toString());
        } else {
          setDbStatus('OFFLINE');
        }
      } catch {
        setDbStatus('OFFLINE');
      }
    };
    fetchStats();
  }, []);

  const handleSearch = async () => {
    const query = searchText.trim();
    if (!query) return;
    setLoading(true);
    setSearched(true);
    try {
      let url: URL;
      if (query.startsWith('0x')) {
        url = new URL(`${FOURBYTE_API.LOOKUP}?filter=false`);
        if (query.length === 10) url.searchParams.append('function', query);
        else if (query.length === 66) url.searchParams.append('event', query);
        else { message.error('Invalid hash length.'); setLoading(false); return; }
      } else {
        url = new URL(`${FOURBYTE_API.SEARCH}?filter=false`);
        url.searchParams.append('query', query);
      }

      const response = await fetch(url.toString());
      const data: { ok?: boolean; error?: string; result?: SignatureApiBuckets } = await response.json();

      if (data.ok && data.result) {
        const flattened: SignatureResult[] = [];
        const append = (type: SignatureResult['type'], entries?: Record<string, SignatureApiItem[]>) => {
          if (!entries) return;
          Object.entries(entries).forEach(([hash, sigs]) =>
            sigs.forEach(sig => flattened.push({ hash, name: sig.name, filtered: sig.filtered, hasVerifiedContract: sig.hasVerifiedContract, type }))
          );
        };
        append('function', data.result.function);
        append('event', data.result.event);
        setResults(flattened);
      } else {
        message.error(data.error || 'Failed to fetch signatures');
      }
    } catch {
      message.error('An error occurred while fetching signatures');
    } finally {
      setLoading(false);
    }
  };

  const handleUnitChange = (value: string, factor: number) => {
    if (!value) { setWeiValue(''); return; }
    const clean = value.replace(/[^0-9.-]/g, '');
    try {
      const bn = new BigNumber(clean);
      if (!bn.isNaN()) setWeiValue(bn.multipliedBy(new BigNumber(10).pow(factor)).toFixed());
    } catch { /* ignore */ }
  };

  const calcUnit = (factor: number): string => {
    if (!weiValue) return '';
    try { return new BigNumber(weiValue).dividedBy(new BigNumber(10).pow(factor)).toFixed(); }
    catch { return ''; }
  };

  const columns = [
    {
      title: 'TYPE', dataIndex: 'type', key: 'type', width: 80,
      render: (type: string) => <span className={`${styles.tag} ${type === 'function' ? styles.fn : styles.event}`}>{type.toUpperCase()}</span>,
    },
    {
      title: 'NAME', dataIndex: 'name', key: 'name',
      render: (name: string) => <span className={styles.mono}>{name}</span>,
    },
    {
      title: 'HASH', dataIndex: 'hash', key: 'hash', width: 280,
      render: (hash: string, record: SignatureResult) => (
        <div className={styles.hash}>
          <span className={record.hasVerifiedContract ? styles.verifiedBadge : styles.unverifiedBadge}>{record.hasVerifiedContract ? '[V]' : '[X]'}</span>
          <span>{hash}</span>
          <CopyButton text={hash} />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      {/* Top stats banner */}
      <div className={styles.statsBanner}>
        <div className={styles.statsLeft}>
          <div className={styles.statsLeftTop}>
            <div className={styles.mainInfo}>
              <div className={styles.statsHeader}>
                <span className={styles.username} style={{ cursor: 'pointer' }} onClick={() => window.open(GITHUB, '_blank')}>{AUTHOR}</span>
                <Badge fontSize={9}>MISC</Badge>
              </div>
              <div className={styles.addressBox}>UTILITIES & TOOLS</div>
            </div>
          </div>
        </div>
      </div>

      {/* Split layout */}
      <div className={styles.splitLayout}>
        {/* Left — Signature results */}
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span>SIGNATURE LOOKUP</span>
            <Status fontSize={10} tone={loading ? 'loading' : 'success'}>
              {loading ? 'PROCESSING' : searched ? `FOUND: ${results.length}` : 'IDLE'}
            </Status>
          </div>
          <div className={styles.searchSection}>
            <div className={styles.searchStats}>
              <TopStatsBar
                columns="repeat(2, minmax(0, 1fr))"
                items={[
                  { label: 'DATASTREAM', value: 'SOURCIFY', fontSize: 12 },
                  { label: 'SIGNATURES', value: `${signatureCount} SIGNATURES`, fontSize: 12, fontType: 'dot' },
                ]}
              />
            </div>
            <div className={styles.searchBox}>
              <Input
                fontSize={12}
                label="SIGNATURE SEARCH"
                hint="Search by function selector, event signature, or text query"
                placeholder="0xa9059cbb"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                wrapperClassName={styles.searchInputWrapper}
              />
              <Button className={styles.searchButton} onClick={handleSearch} disabled={loading}>
                {loading ? 'SEARCHING' : 'EXECUTE'}
              </Button>
            </div>
          </div>
          <div className={styles.resultsArea}>
            {searched ? (
              <div className={styles.tableWrapper}>
                {loading ? (
                  <div className={styles.loadingState}>
                    <div className={styles.skeletonLine} />
                    <div className={styles.skeletonLine} />
                    <div className={styles.skeletonLine} />
                  </div>
                ) : results.length > 0 ? (
                  <Table
                    dataSource={results}
                    columns={columns}
                    rowKey={(r) => `${r.hash}-${r.name}`}
                    pagination={results.length > 50 ? { pageSize: 50, showSizeChanger: false, size: 'small' } : false}
                    size="small"
                    className={styles.terminalTable}
                  />
                ) : (
                  <div className={styles.empty}>NO SIGNATURES FOUND FOR: {searchText}</div>
                )}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div>SYSTEM IDLE</div>
                <Hint className={styles.subtext} fontSize={12}>AWAITING QUERY INPUT</Hint>
              </div>
            )}
          </div>
        </div>

        {/* Right — Converters stacked */}
        <div className={styles.rightPanel}>
          {/* Right top — Unit converter */}
          <div className={styles.rightTop}>
            <div className={styles.panelHeader}>
              <span>UNIT CONVERTER</span>
              <Status fontSize={10} tone="success">WEI / GWEI / ETHER</Status>
            </div>
            <div className={styles.converterBody}>
              <div className={styles.fields}>
                <div className={`${styles.corner} ${styles.topLeft}`} />
                <div className={`${styles.corner} ${styles.topRight}`} />
                <div className={`${styles.corner} ${styles.bottomLeft}`} />
                <div className={`${styles.corner} ${styles.bottomRight}`} />
                {UNITS.map((unit) => (
                  <div key={unit.name} className={styles.field}>
                    <Label hint={unit.hint}>{unit.name}</Label>
                    <div className={styles.inputRow}>
                      <Input
                        className={styles.input}
                        fontSize={12}
                        value={calcUnit(unit.factor)}
                        onChange={(e) => handleUnitChange(e.target.value, unit.factor)}
                        placeholder="0"
                      />
                      <CopyButton text={calcUnit(unit.factor)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right bottom — Byte decoder */}
          <div className={styles.rightBottom}>
            <div className={styles.panelHeader}>
              <span>BYTE DECODER</span>
              <Status fontSize={10} tone="success">HEX ↔ STRING</Status>
            </div>
            <div className={styles.converterBody}>
              <div className={styles.fields}>
                <div className={`${styles.corner} ${styles.topLeft}`} />
                <div className={`${styles.corner} ${styles.topRight}`} />
                <div className={`${styles.corner} ${styles.bottomLeft}`} />
                <div className={`${styles.corner} ${styles.bottomRight}`} />
                <Textarea
                  className={styles.textarea}
                  fontSize={12}
                  hint="Raw hex data, revert strings, or panic codes"
                  label="HEX BYTES"
                  placeholder="0x4e487b710000000000000000000000000000000000000000000000000000000000000011"
                  rows={3}
                  value={bytesInput}
                  onChange={(e) => {
                    setBytesInput(e.target.value);
                    setStringOutput(hexToString(e.target.value.trim()));
                  }}
                />
                <div className={styles.arrowBox}>↓ DECODES TO ↓</div>
                <div className={styles.field}>
                  <Label hint="Decoded human-readable text">ASCII / UTF-8 STRING</Label>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
