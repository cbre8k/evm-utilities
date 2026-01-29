import { Input, Typography, Card, Flex } from 'antd';

const { Text } = Typography;

interface TraceInputProps {
  rpcUrl: string;
  setRpcUrl: (val: string) => void;
  txHash: string;
  setTxHash: (val: string) => void;
}

export default function TraceInput({
  rpcUrl,
  setRpcUrl,
  txHash,
  setTxHash,
}: TraceInputProps) {
  return (
    <Flex vertical gap="middle" style={{ width: '100%' }}>
      <Card>
        <Flex vertical gap="large" style={{ width: '100%' }}>
          <div>
            <Text>RPC URL</Text>
            <Input 
              placeholder="https://rpc.ankr.com/eth/..." 
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              style={{ marginTop: 8, fontFamily: 'monospace' }}
            />
          </div>

          <div>
            <Text>Transaction Hash</Text>
            <Input 
              placeholder="0x0"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              style={{ marginTop: 8, fontFamily: 'monospace' }}
            />
          </div>
        </Flex>
      </Card>
    </Flex>
  );
}
