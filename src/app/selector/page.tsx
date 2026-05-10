'use client';

import { useState, useEffect } from 'react';
import { Table, message } from 'antd';
import { AUTHOR, FOURBYTE_API, GITHUB } from '@/lib/constants';
import { Badge, Button, CopyButton, Hint, Input, Status, TopStatsBar } from '@/components/ui';
import styles from './signature.module.scss';

interface SignatureResult {
  hash: string;
  name: string;
  filtered: boolean;
  hasVerifiedContract: boolean;
  type: 'function' | 'event';
}

type SignatureApiItem = {
  filtered: boolean;
  hasVerifiedContract: boolean;
  name: string;
};

type SignatureApiBuckets = Partial<Record<'function' | 'event', Record<string, SignatureApiItem[]>>>;

type SignatureStatsResponse = {
  ok?: boolean;
  result?: {
    count?: {
      total?: number;
    };
  };
};

type SignatureLookupResponse = {
  error?: string;
  ok?: boolean;
  result?: SignatureApiBuckets;
};

export default function SignatureLookup() {
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SignatureResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [dbStatus, setDbStatus] = useState<'ONLINE' | 'OFFLINE' | 'LOADING'>('LOADING');
  const [signatureCount, setSignatureCount] = useState<string>('---');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(FOURBYTE_API.STATS);
        const data: SignatureStatsResponse = await response.json();
        const total = data.result?.count?.total;

        if (data.ok && typeof total === 'number') {
          setDbStatus('ONLINE');
          if (total >= 1000000) {
            setSignatureCount(`${(total / 1000000).toFixed(1)}M+`);
          } else if (total >= 1000) {
            setSignatureCount(`${(total / 1000).toFixed(1)}K+`);
          } else {
            setSignatureCount(total.toString());
          }
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
        if (query.length === 10) {
          url.searchParams.append('function', query);
        } else if (query.length === 66) {
          url.searchParams.append('event', query);
        } else {
          message.error('Invalid hash length. Must be 4 bytes (8 hex chars) or 32 bytes (64 hex chars).');
          setLoading(false);
          return;
        }
      } else {
        url = new URL(`${FOURBYTE_API.SEARCH}?filter=false`);
        url.searchParams.append('query', query);
      }
      
      const response = await fetch(url.toString());
      const data: SignatureLookupResponse = await response.json();

      if (data.ok && data.result) {
        const flattened: SignatureResult[] = [];
        const appendEntries = (
          type: SignatureResult['type'],
          entries: Record<string, SignatureApiItem[]> | undefined,
        ) => {
          if (!entries) return;

          Object.entries(entries).forEach(([hash, sigs]) => {
            sigs.forEach((sig) => {
              flattened.push({
                hash,
                name: sig.name,
                filtered: sig.filtered,
                hasVerifiedContract: sig.hasVerifiedContract,
                type,
              });
            });
          });
        };

        appendEntries('function', data.result.function);
        appendEntries('event', data.result.event);

        setResults(flattened);
      } else {
        message.error(data.error || 'Failed to fetch signatures');
      }
    } catch (error) {
      message.error('An error occurred while fetching signatures');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'TYPE',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <span className={`${styles.tag} ${type === 'function' ? styles.fn : styles.event}`}>
          {type.toUpperCase()}
        </span>
      ),
    },
    {
      title: 'NAME',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <span className={styles.mono}>{name}</span>
      ),
    },
    {
      title: 'HASH',
      dataIndex: 'hash',
      key: 'hash',
      width: 320,
      render: (hash: string, record: SignatureResult) => (
        <div className={styles.hash}>
          {record.hasVerifiedContract ? (
            <span className={styles.verifiedBadge} title="Verified">
              [V]
            </span>
          ) : (
            <span className={styles.unverifiedBadge} title="Unverified">
              [X]
            </span>
          )}
          <span>{hash}</span>
          <CopyButton text={hash} />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.statsBanner}>
        <div className={styles.statsLeft}>
          <div className={styles.statsLeftTop}>
            <div className={styles.mainInfo}>
              <div className={styles.statsHeader}>
                <span className={styles.username} style={{ cursor: 'pointer' }} onClick={() => window.open(GITHUB, '_blank')}>{AUTHOR}</span>
                <Badge fontSize={9}>SELECTOR</Badge>
              </div>
              <div className={styles.addressBox}>SIGNATURE LOOKUP TOOL</div>
            </div>
            
            <div className={styles.bigStatContainer}>
              <span className={styles.bigStatLabel}>■ STATUS:</span>
              <span className={styles.bigStatValue}>
                <Status
                  tone={dbStatus === 'LOADING' ? 'loading' : dbStatus === 'ONLINE' ? 'success' : 'error'}
                  fontSize={12}
                >
                  {dbStatus}
                </Status>
              </span>
            </div>
          </div>
          <TopStatsBar
            className={styles.statsGridBar}
            columns="repeat(2, minmax(0, 1fr))"
            items={[
              { label: 'DATASTREAM', value: 'SOURCIFY', fontSize: 12 },
              { label: 'SIGNATURES', value: `${signatureCount} SIGNATURES`, fontSize: 12, fontType: 'dot' },
            ]}
          />
        </div>
        
        <div className={styles.statsRight}>
          <div className={styles.searchBox}>
            <Input
              fontSize={12}
              label="SEARCH BAR"
              hint="Search by function selector, event signature, or text query"
              placeholder="0xa9059cbb"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              wrapperClassName={styles.searchInputWrapper}
            />
            <Button
              className={styles.searchButton}
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? 'SEARCHING' : 'EXECUTE'}
            </Button>
          </div>
        </div>
      </div>

      <div className={styles.workspace}>
        {searched && (
          <div className={styles.resultsPanel}>
            <div className={styles.resultsHeader}>
              <span>QUERY RESULTS</span>
              <Status
                fontSize={10}
                tone={loading ? 'loading' : 'success'}
              >
                {loading ? 'PROCESSING' : `FOUND: ${results.length}`}
              </Status>
            </div>
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
                  rowKey={(record) => `${record.hash}-${record.name}`}
                  pagination={results.length > 50 ? { pageSize: 50, showSizeChanger: false, size: 'small' } : false}
                  size="small"
                  className={styles.terminalTable}
                />
              ) : (
                <div className={styles.empty}>NO SIGNATURES FOUND FOR QUERY: {searchText}</div>
              )}
            </div>
          </div>
        )}
        {!searched && (
          <div className={styles.emptyWorkspace}>
            <div>SYSTEM IDLE</div>
            <Hint className={styles.subtext} fontSize={12}>AWAITING QUERY INPUT</Hint>
          </div>
        )}
      </div>
    </div>
  );
}
