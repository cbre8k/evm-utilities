'use client';

import { useState, useEffect, useRef } from 'react';
import TraceInput from '@/components/TraceInput';
import SimulateInput from '@/components/SimulateInput';
import Terminal, { TerminalHandle } from '@/components/Terminal';
import { generateSimulationTest } from '@/lib/templates';
import { Button, Radio, Row, Col, Flex } from 'antd';
import { PlayCircleOutlined, StopOutlined, LoadingOutlined } from '@ant-design/icons';

type Tab = 'TRACE' | 'SIMULATE';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('TRACE');
  const [isRunning, setIsRunning] = useState(false);
  const terminalRef = useRef<TerminalHandle>(null);

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
    terminalRef.current?.clear();
    terminalRef.current?.write('\x1b[2J\x1b[3J\x1b[H');
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
    
    // Clear terminal
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
        terminalRef.current?.write(text);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        terminalRef.current?.write('\x1b[31mProcess cancelled by user.\x1b[0m\n');
      } else {
        terminalRef.current?.write(`\r\nError: ${error}\r\n`);
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
    <div style={{ padding: '24px', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Radio.Group 
          value={activeTab} 
          onChange={(e) => setActiveTab(e.target.value)} 
          buttonStyle="solid"
        >
          <Radio.Button value="TRACE">Trace Transaction</Radio.Button>
          <Radio.Button value="SIMULATE">Simulate Transaction</Radio.Button>
        </Radio.Group>
      </Flex>

      <Row gutter={24} style={{ flex: 1, overflow: 'hidden' }}>
        {/* Left Column: Inputs */}
        <Col span={10} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8, paddingBottom: 16 }}>
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
            <div style={{ marginTop: 16 }}>
              <Flex gap="small">
                <Button 
                  type="primary" 
                  size="large" 
                  icon={isRunning ? <LoadingOutlined /> : <PlayCircleOutlined />} 
                  onClick={handleRun}
                  disabled={isRunning}
                  style={{ flex: 1, height: '48px', fontSize: '16px' }}
                >
                  {isRunning ? `Processing... ${formatTime(elapsedTime)}` : 'Run'}
                </Button>
                {isRunning && (
                  <Button 
                    danger 
                    size="large" 
                    icon={<StopOutlined />} 
                    onClick={handleCancel}
                    style={{ height: '48px', width: '48px' }}
                  />
                )}
              </Flex>
            </div>
          </div>
        </Col>

        {/* Right Column: Terminal */}
        <Col span={14} style={{ height: '100%' }}>
          <Terminal ref={terminalRef} />
        </Col>
      </Row>
    </div>
  );
}
