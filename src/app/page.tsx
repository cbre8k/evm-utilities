'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AUTHOR, GITHUB } from '@/lib/constants';
import { generateSimulationTest } from '@/lib/templates';
import { useNetwork } from '@/contexts/NetworkContext';
import { TraceFields, SimulateFields } from '@/components/FormFields';
import Terminal, { TerminalHandle } from '@/components/Terminal';
import CommonTabs, { type CommonTabItem } from '@/components/CommonTabs';
import { Button, CopyButton } from '@/components/ui';
import { copyWithFirework } from '@/utils/copyAnimation';
import styles from './simulator.module.scss';

type Tab = 'TRACE' | 'SIMULATE';
type PipelineState = 'PREPARING' | 'EXECUTING' | 'RESULTING' | 'CRASHING' | 'ABORTING';

const TABS: CommonTabItem<Tab>[] = [
  { id: 'TRACE', label: '[ TRACE ]' },
  { id: 'SIMULATE', label: '[ SIMULATE ]' },
];

function HomeInner() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('TRACE');
  const [pipelineState, setPipelineState] = useState<PipelineState>('PREPARING');
  const [isRunning, setIsRunning] = useState(false);
  const [shareHash, setShareHash] = useState<string | null>(null);
  const terminalRef = useRef<TerminalHandle>(null);

  const { 
    selectedNetwork, 
    rpcUrl, 
    setRpcUrl, 
    latency, 
    chainId, 
    forkHeight, 
    gasPrice 
  } = useNetwork();

  // Trace State
  const [txHash, setTxHash] = useState('');
  const [quick, setQuick] = useState(false);

  // Simulate State
  const [sender, setSender] = useState('');
  const [shouldDealToken, setShouldDealToken] = useState(false);
  const [tokenAddress, setTokenAddress] = useState('');
  const [spender, setSpender] = useState('');
  const [amount, setAmount] = useState('0');
  const [calldata, setCalldata] = useState('');
  const [to, setTo] = useState('');
  const [msgValue, setMsgValue] = useState('0');
  const [shouldForkBlock, setShouldForkBlock] = useState(false);
  const [blockNumber, setBlockNumber] = useState('0');

  const [scriptContent, setScriptContent] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── URL param pre-fill (Re-Simulate handoff from Explorer) ──
  useEffect(() => {
    const tab = searchParams.get('tab');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const calldataParam = searchParams.get('calldata');
    const valueParam = searchParams.get('value');
    const blockParam = searchParams.get('blockNumber');
    const rpcParam = searchParams.get('rpcUrl');

    if (tab === 'SIMULATE' && (fromParam || toParam || calldataParam)) {
      setActiveTab('SIMULATE');
      if (fromParam) setSender(fromParam);
      if (toParam) setTo(toParam);
      if (calldataParam) setCalldata(calldataParam);
      if (valueParam) setMsgValue(valueParam);
      if (blockParam) { setBlockNumber(blockParam); setShouldForkBlock(true); }
      if (rpcParam) setRpcUrl(rpcParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect for rpcUrl removed as it now comes directly from context

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime(Date.now() - startTimeRef.current);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const decimal = Math.floor((ms % 1000) / 100);
    return `${seconds}.${decimal}s`;
  };

  useEffect(() => {
    setPipelineState('PREPARING');
    terminalRef.current?.clear();
    terminalRef.current?.write('\x1b[2J\x1b[3J\x1b[H');
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'SIMULATE') {
      const content = generateSimulationTest({
        rpcUrl, sender, to, calldata, amount, msgValue, blockNumber,
        shouldDealToken, tokenAddress, spender,
      });
      setScriptContent(content);
    }
  }, [activeTab, sender, shouldDealToken, tokenAddress, spender, amount, calldata, to, msgValue, blockNumber, rpcUrl]);

  const handleRun = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setPipelineState('EXECUTING');
    terminalRef.current?.clear();
    terminalRef.current?.write('\x1b[2J\x1b[3J\x1b[H');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeTab,
          inputs: {
            rpcUrl, txHash, quick, sender, shouldDealToken,
            tokenAddress, spender, amount, calldata, to, msgValue, scriptContent,
          },
        }),
        signal: controller.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        terminalRef.current?.write(text);

        buffer += text;
        if (buffer.length > 2000) buffer = buffer.slice(-2000);
        
        if (buffer.includes('Error:') || buffer.includes('Compiler run failed') || buffer.includes('System Error:') || buffer.includes('Failing tests:')) {
          setPipelineState('CRASHING');
        } else if (buffer.includes('Suite result: ok') || buffer.includes('Transaction successfully executed')) {
          if (pipelineState !== 'CRASHING') setPipelineState('RESULTING');
        }
      }
      
      setPipelineState(prev => prev === 'CRASHING' ? 'CRASHING' : 'RESULTING');

      // ── Create share for successful simulate (direct-spawn path) ──
      if (activeTab === 'SIMULATE' && pipelineState !== 'CRASHING') {
        try {
          const shareRes = await fetch('/api/share-simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rpcUrl,
              inputs: { from: sender, to, calldata, value: msgValue, blockNumber,
                        shouldDealToken, tokenAddress, spender, amount },
              output: buffer,
              exitCode: 0,
              success: true,
            }),
          });
          const shareData = await shareRes.json();
          if (shareData.hash) setShareHash(shareData.hash);
        } catch {}
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setPipelineState('ABORTING');
        terminalRef.current?.write('\x1b[31mCancelled.\x1b[0m\n');
      } else {
        setPipelineState('CRASHING');
        terminalRef.current?.write(`\r\nError: ${error instanceof Error ? error.message : String(error)}\r\n`);
      }
    } finally {
      setIsRunning(false);
      setPipelineState(prev => {
        if (prev !== 'CRASHING' && prev !== 'RESULTING' && prev !== 'ABORTING') {
          return 'PREPARING';
        }
        return prev;
      });
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    setPipelineState('ABORTING');
    abortControllerRef.current?.abort();
  };

  return (
    <div className={styles.page}>
      
      {/* Mirofish-style Top Stats Banner */}
      <div className={styles.statsBanner}>
        <div className={styles.statsLeft}>
          <div className={styles.statsLeftTop}>
            <div className={styles.mainInfo}>
              <div className={styles.statsHeader}>
                <span className={styles.username} style={{ cursor: 'pointer' }} onClick={() => window.open(GITHUB, '_blank')}>{AUTHOR}</span>
                <span className={styles.badge}>{selectedNetwork.name}</span>
              </div>
              <div 
                className={styles.addressBox}
                onClick={() => copyWithFirework('0x0000000000000000000000000000000000000000')}
                style={{ cursor: 'pointer' }}
              >
                0x0000000000000000000000000000000000000000
              </div>
            </div>

            <div className={styles.bigStatContainer}>
              <span className={styles.bigStatLabel}>■ STATUS:</span>
              <div className={styles.bigStatValue}>
                {isRunning ? (
                  pipelineState === 'ABORTING' ? (
                    <span className={styles.statusWarning}>CANCELING</span>
                  ) : (
                    <span className={styles.statusBlink}>EXECUTING</span>
                  )
                ) : pipelineState === 'CRASHING' ? (
                  <span className={styles.statusDanger}>FAILED</span>
                ) : pipelineState === 'RESULTING' ? (
                  <span className={styles.statusSuccess}>SUCCESS</span>
                ) : pipelineState === 'ABORTING' ? (
                  <span className={styles.statusWarning}>CANCELLED</span>
                ) : (
                  <span className={styles.statusSuccess}>READY</span>
                )}
              </div>
            </div>
          </div>
          
          <div className={styles.statsGrid}>
            <div className={styles.statCol}>
              <div className={styles.scLabel}>LATENCY</div>
              <div className={styles.scValue}>{latency} Ms</div>
            </div>
            <div className={styles.statCol}>
              <div className={styles.scLabel}>CHAIN ID</div>
              <div className={styles.scValue}>{chainId}</div>
            </div>
            <div className={styles.statCol}>
              <div className={styles.scLabel}>BLOCK HEIGHT</div>
              <div className={styles.scValue}>{forkHeight}</div>
            </div>
            <div className={styles.statCol}>
              <div className={styles.scLabel}>GAS PRICE</div>
              <div className={styles.scValue}>{gasPrice} Gwei</div>
            </div>
          </div>
        </div>
        
        <div className={styles.statsRight}>
          <div className={styles.pipelineHeader}>
            <span>■ EXECUTION PIPELINE</span>
            <span className={styles.badgeLine}>{activeTab} &middot; STAGE</span>
          </div>
          
          <div className={styles.pipelineSteps}>
            <div className={`${styles.step} ${pipelineState === 'PREPARING' ? styles.stepActive : ''}`}>
              <span className={styles.stepNum}>01</span>
              <span className={styles.stepName}>Preparing</span>
            </div>
            <div className={`${styles.step} ${pipelineState === 'EXECUTING' ? styles.stepActive : ''}`}>
              <span className={styles.stepNum}>02</span>
              <span className={styles.stepName}>Executing</span>
            </div>
            <div className={`${styles.step} ${pipelineState === 'RESULTING' ? styles.stepActive : (pipelineState === 'CRASHING' ? styles.stepCrash : (pipelineState === 'ABORTING' ? styles.stepAbort : ''))}`}>
              <span className={styles.stepNum}>03</span>
              <span className={styles.stepName}>{pipelineState === 'CRASHING' ? 'Crashing' : pipelineState === 'ABORTING' ? 'Aborting' : 'Resulting'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <CommonTabs items={TABS} activeTab={activeTab} onChange={setActiveTab} />
        <div className={styles.runtimeBox}>
          RUNTIME: {isRunning ? formatTime(elapsedTime) : '0.0s'}
        </div>
      </div>

      <div className={styles.workspace}>
        <div 
          className={styles.inputPanel}
          onFocus={() => {
            if (pipelineState === 'CRASHING' || pipelineState === 'RESULTING' || pipelineState === 'ABORTING') {
              setPipelineState('PREPARING');
              terminalRef.current?.clear();
              terminalRef.current?.write('\x1b[2J\x1b[3J\x1b[H');
            }
          }}
          onClick={() => {
            if (pipelineState === 'CRASHING' || pipelineState === 'RESULTING' || pipelineState === 'ABORTING') {
              setPipelineState('PREPARING');
              terminalRef.current?.clear();
              terminalRef.current?.write('\x1b[2J\x1b[3J\x1b[H');
            }
          }}
        >
          {activeTab === 'TRACE' ? (
            <TraceFields
              rpcUrl={rpcUrl} setRpcUrl={setRpcUrl}
              txHash={txHash} setTxHash={setTxHash}
              quick={quick} setQuick={setQuick}
            />
          ) : (
            <SimulateFields
              rpcUrl={rpcUrl} setRpcUrl={setRpcUrl}
              sender={sender} setSender={setSender}
              shouldDealToken={shouldDealToken} setShouldDealToken={setShouldDealToken}
              tokenAddress={tokenAddress} setTokenAddress={setTokenAddress}
              spender={spender} setSpender={setSpender}
              amount={amount} setAmount={setAmount}
              calldata={calldata} setCalldata={setCalldata}
              to={to} setTo={setTo}
              msgValue={msgValue} setMsgValue={setMsgValue}
              shouldForkBlock={shouldForkBlock} setShouldForkBlock={setShouldForkBlock}
              blockNumber={blockNumber} setBlockNumber={setBlockNumber}
            />
          )}

          <div className={styles.actions}>
            <Button
              className={styles.runBtn}
              onClick={handleRun}
              disabled={isRunning}
            >
              {isRunning ? 'EXECUTING' : 'EXECUTE SEQUENCE'}
            </Button>
            {isRunning && (
              <Button
                className={styles.cancelBtn}
                variant="danger"
                onClick={handleCancel}
              >
                ABORT
              </Button>
            )}
            {!isRunning && shareHash && activeTab === 'SIMULATE' && (
              <CopyButton
                className={styles.cancelBtn}
                text={`${window.location.origin}/s/${shareHash}`}
                label="⎘ SHARE"
                copiedLabel="✓ COPIED"
              />
            )}
          </div>
        </div>

        <div className={styles.outputPanel}>
          <Terminal ref={terminalRef} />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
