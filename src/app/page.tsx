'use client';

import { useState, useEffect, useRef } from 'react';
import TraceInput from '@/components/TraceInput';
import SimulateInput from '@/components/SimulateInput';
import Terminal from '@/components/Terminal';
import { generateSimulationTest } from '@/lib/templates';

type Tab = 'TRACE' | 'SIMULATE';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('TRACE');
  const [isRunning, setIsRunning] = useState(false);
  const [latestOutput, setLatestOutput] = useState<string | null>(null);

  // Trace State
  const [rpcUrl, setRpcUrl] = useState('');
  const [txHash, setTxHash] = useState('');

  // Simulate State
  const [sender, setSender] = useState('');
  const [shouldDealToken, setShouldDealToken] = useState(false);
  const [tokenAddress, setTokenAddress] = useState('');
  const [spender, setSpender] = useState('');
  const [amount, setAmount] = useState('0');
  const [calldata, setCalldata] = useState('');
  const [to, setTo] = useState('');
  const [msgValue, setMsgValue] = useState('0');

  const [scriptContent, setScriptContent] = useState('');

  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);

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
    setLatestOutput('\x1b[2J\x1b[3J\x1b[H');
  }, [activeTab]);

  // Update script preview when inputs change
  useEffect(() => {
    if (activeTab === 'SIMULATE') {
      const content = generateSimulationTest({
        rpcUrl,
        sender,
        to,
        calldata,
        amount,
        msgValue,
        shouldDealToken,
        tokenAddress,
        spender
      });
      setScriptContent(content);
    }
  }, [activeTab, sender, shouldDealToken, tokenAddress, spender, amount, calldata, to, msgValue, rpcUrl, txHash]);

  const handleRun = async () => {
    if (isRunning) return;
    setIsRunning(true);
    // Clear previous or init
    setLatestOutput('\x1b[2J\x1b[3J\x1b[H'); // Clear screen
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeTab,
          inputs: { 
            rpcUrl, txHash, sender, shouldDealToken, 
            tokenAddress, spender, amount, calldata, to, msgValue, scriptContent 
          }
        }),
        signal: controller.signal
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        setLatestOutput(text); // Pass the chunk directly
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setLatestOutput('\x1b[31mProcess cancelled by user.\x1b[0m\n');
      } else {
        setLatestOutput(`\r\nError: ${error}\r\n`);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <main>
      <div style={{marginBottom: '10px'}}>
        <div className="flex space-x-2">
          <button 
            className={`tab-btn mr-4 ${activeTab === 'TRACE' ? 'active shadow-sm' : 'hover:bg-gray-100'}`}
            onClick={() => setActiveTab('TRACE')}
          >
            Trace Transaction
          </button>
          <button 
            className={`tab-btn ${activeTab === 'SIMULATE' ? 'active shadow-sm' : 'hover:bg-gray-100'}`}
            onClick={() => setActiveTab('SIMULATE')}
          >
            Simulate Transaction
          </button>
        </div>
      </div>

      <div>
        {/* Left Column: Inputs & Controls */}
        <div className="glass-panel">
          <div>
            {activeTab === 'TRACE' ? (
              <TraceInput 
                rpcUrl={rpcUrl} setRpcUrl={setRpcUrl}
                txHash={txHash} setTxHash={setTxHash}
              />
            ) : (
              <SimulateInput 
                rpcUrl={rpcUrl} setRpcUrl={setRpcUrl}
                sender={sender} setSender={setSender}
                shouldDealToken={shouldDealToken} setShouldDealToken={setShouldDealToken}
                tokenAddress={tokenAddress} setTokenAddress={setTokenAddress}
                spender={spender} setSpender={setSpender}
                amount={amount} setAmount={setAmount}
                calldata={calldata} setCalldata={setCalldata}
                to={to} setTo={setTo}
                msgValue={msgValue} setMsgValue={setMsgValue}
              />
            )}

          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <button 
            className="btn-primary text-md shadow-lg shadow-primary/20 hover:shadow-primary/40 p-4 rounded-xl flex-center-gap"
            style={{ flex: 1 }}
            onClick={handleRun}
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <svg className="spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="4"></circle>
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Processing... {formatTime(elapsedTime)}</span>
              </>
            ) : 'Run'}
          </button>

          {isRunning && (
            <button 
              className="btn-danger rounded-xl flex-center-gap"
              style={{ width: '40px', padding: 0, flexShrink: 0 }}
              onClick={handleCancel}
              title="Cancel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '24px', height: '24px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Right Column: Terminal */}
        <div className="terminal-container">
          <Terminal data={latestOutput} />
        </div>
      </div>
    </main>
  );
}
