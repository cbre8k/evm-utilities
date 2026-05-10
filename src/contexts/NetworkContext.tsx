'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Network, NETWORKS } from '@/lib/constants';

interface NetworkContextType {
  selectedNetwork: Network;
  setSelectedNetwork: (network: Network) => void;
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
  latency: string;
  chainId: string;
  forkHeight: string;
  gasPrice: string;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [selectedNetwork, setSelectedNetworkState] = useState<Network>(NETWORKS[0]);
  const [rpcUrl, setRpcUrl] = useState<string>(NETWORKS[0].archiveRpcUrls[0]);
  
  const [latency, setLatency] = useState<string>('--');
  const [chainId, setChainId] = useState<string>('--');
  const [forkHeight, setForkHeight] = useState<string>('--');
  const [gasPrice, setGasPrice] = useState<string>('--');

  const pollIndexRef = useRef(0);
  const rpcUrlRef = useRef(rpcUrl);

  useEffect(() => {
    rpcUrlRef.current = rpcUrl;
  }, [rpcUrl]);

  const setSelectedNetwork = (network: Network) => {
    setSelectedNetworkState(network);
    setRpcUrl(network.archiveRpcUrls[0]);
    pollIndexRef.current = 0;
  };

  useEffect(() => {
    let isMounted = true;

    const pollStats = async () => {
      const urls = selectedNetwork.fullnodeRpcUrls;
      const isCustom = selectedNetwork.id === 'custom';
      
      if (!isCustom && (!urls || urls.length === 0)) {
        setLatency('--');
        setChainId('--');
        setForkHeight('--');
        setGasPrice('--');  
        return;
      };

      const urlToUse = urls[pollIndexRef.current % urls.length];
      
      if (!isCustom) pollIndexRef.current += 1;
      
      if (urlToUse === '') {
        setLatency('--');
        setChainId('--');
        setForkHeight('--');
        setGasPrice('--');
        return;
      };

      try {
        const startTime = Date.now();
        
        const res = await fetch(urlToUse, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([
            { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
            { jsonrpc: '2.0', id: 2, method: 'eth_gasPrice', params: [] },
            { jsonrpc: '2.0', id: 3, method: 'eth_chainId', params: [] }
          ])
        });

        const endTime = Date.now();
        const data = await res.json();

        if (isMounted && Array.isArray(data)) {
          setLatency((endTime - startTime).toString());
          
          const blockRes = data.find(d => d.id === 1);
          if (blockRes && blockRes.result) {
            setForkHeight(parseInt(blockRes.result, 16).toString());
          }

          const gasRes = data.find(d => d.id === 2);
          if (gasRes && gasRes.result) {
            const wei = parseInt(gasRes.result, 16);
            const gwei = (wei / 1e9).toFixed(2);
            setGasPrice(gwei);
          }

          const chainRes = data.find(d => d.id === 3);
          if (chainRes && chainRes.result) {
            const chainId = parseInt(chainRes.result, 16).toString();
            setChainId(chainId);
          }
        }
      } catch {
        if (isMounted) {
          setLatency('--');
          setForkHeight('--');
          setGasPrice('--');
          setChainId('--');
        }
      }
    };

    pollStats();
    const intervalId = setInterval(pollStats, 12000); // 12 seconds

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [selectedNetwork]);

  return (
    <NetworkContext.Provider value={{
      selectedNetwork, setSelectedNetwork,
      rpcUrl, setRpcUrl,
      latency, chainId, forkHeight, gasPrice
    }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
