'use client';

import { useState, useEffect } from 'react';
import { Table, message } from 'antd';
import { AUTHOR, FOURBYTE_API, GITHUB } from '@/lib/constants';
import styles from './signature.module.scss';

interface SignatureResult {
  hash: string;
  name: string;
  filtered: boolean;
  hasVerifiedContract: boolean;
  type: 'function' | 'event';
}

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
        const data = await response.json();
        if (data.ok && data.result && data.result.count) {
          setDbStatus('ONLINE');
          const total = data.result.count.total;
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
      } catch (error) {
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
      const data = await response.json();

      if (data.ok) {
        const flattened: SignatureResult[] = [];

        if (data.result.function) {
          Object.entries(data.result.function).forEach(([hash, sigs]: [string, any]) => {
            sigs.forEach((sig: any) => {
              flattened.push({
                hash,
                name: sig.name,
                filtered: sig.filtered,
                hasVerifiedContract: sig.hasVerifiedContract,
                type: 'function',
              });
            });
          });
        }

        if (data.result.event) {
          Object.entries(data.result.event).forEach(([hash, sigs]: [string, any]) => {
            sigs.forEach((sig: any) => {
              flattened.push({
                hash,
                name: sig.name,
                filtered: sig.filtered,
                hasVerifiedContract: sig.hasVerifiedContract,
                type: 'event',
              });
            });
          });
        }

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
          <button
            className={styles.copyBtn}
            onClick={() => {
              navigator.clipboard.writeText(hash);
              for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 20 + Math.random() * 60;
                message.success({
                  content: 'COPIED',
                  duration: 4 + Math.random() * 2,
                  className: 'firework-msg',
                  style: {
                    opacity: 0,
                    transform: 'translate(-50%, -50%) scale(0)',
                    animationDelay: `${Math.random() * 0.15}s`,
                    animationDuration: `${3 + Math.random() * 2}s`,
                    '--dx': `${Math.cos(angle) * radius}vmin`,
                    '--dy': `${Math.sin(angle) * radius}vmin`,
                    '--rot': `${(Math.random() - 0.5) * 360}deg`,
                    '--rot-end': `${(Math.random() - 0.5) * 720}deg`,
                  } as any
                });
              }
            }}
          >
            COPY
          </button>
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
                <span className={styles.badge}>SELECTOR</span>
              </div>
              <div className={styles.addressBox}>SIGNATURE LOOKUP TOOL</div>
            </div>
            
            <div className={styles.bigStatContainer}>
              <span className={styles.bigStatLabel}>■ STATUS:</span>
              <span className={styles.bigStatValue}>
                {dbStatus === 'LOADING' ? (
                  <span className={styles.statusBlink}>LOADING</span>
                ) : dbStatus === 'ONLINE' ? (
                  <span className={styles.statusSuccess}>ONLINE</span>
                ) : (
                  <span className={styles.statusDanger}>OFFLINE</span>
                )}
              </span>
            </div>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCol}>
              <div className={styles.scLabel}>DATASTREAM</div>
              <div className={styles.scValue}>SOURCIFY</div>
            </div>
            <div className={styles.statCol}>
              <div className={styles.scLabel}>SIGNATURES</div>
              <div className={styles.scValue}>{signatureCount} SIGNATURES</div>
            </div>
          </div>
        </div>
        
        <div className={styles.statsRight}>
          <div className={styles.pipelineHeader}>
            <span>■ SEARCH MODULE</span>
            <span className={styles.badgeLine}>AWAITING QUERY</span>
          </div>
          
          <div className={styles.searchBox}>
            <input
              className={styles.searchInput}
              placeholder="ENTER HEX OR FUNCTION NAME..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              className={styles.searchBtn}
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? 'SEARCHING' : 'EXECUTE'}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.workspace}>
        {searched && (
          <div className={styles.resultsPanel}>
            <div className={styles.resultsHeader}>
              <span>QUERY RESULTS</span>
              <span className={loading ? styles.statusBlink : styles.statusSuccess}>
                {loading ? 'PROCESSING' : `FOUND: ${results.length}`}
              </span>
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
            <div className={styles.subtext}>AWAITING QUERY INPUT</div>
          </div>
        )}
      </div>
    </div>
  );
}
