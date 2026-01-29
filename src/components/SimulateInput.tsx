import { Input, Checkbox, Row, Col, Typography, Card, Flex } from 'antd';

const { Text } = Typography;
const { TextArea } = Input;

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
  rpcUrl: string;
  setRpcUrl: (val: string) => void;
}

export default function SimulateInput({
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
  rpcUrl,
  setRpcUrl,
}: SimulateInputProps) {
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

          <Row gutter={16}>
            <Col span={12}>
              <Text>Sender</Text>
              <Input 
                placeholder="0x0" 
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                style={{ marginTop: 8, fontFamily: 'monospace' }}
              />
            </Col>
            <Col span={12}>
              <Text>Target</Text>
              <Input 
                placeholder="0x0" 
                value={to}
                onChange={(e) => setTo(e.target.value)}
                style={{ marginTop: 8, fontFamily: 'monospace' }}
              />
            </Col>
          </Row>

          <div>
            <Checkbox 
              checked={shouldDealToken}
              onChange={(e) => setShouldDealToken(e.target.checked)}
            >
              Approve
            </Checkbox>
          </div>

          {shouldDealToken && (
            <div style={{ padding: '16px', background: 'rgba(24, 144, 255, 0.05)', backdropFilter: 'blur(10px)', borderRadius: '8px', border: '1px solid rgba(24, 144, 255, 0.1)' }}>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Text>Token</Text>
                  <Input 
                    placeholder="0x0" 
                    value={tokenAddress}
                    onChange={(e) => setTokenAddress(e.target.value)}
                    style={{ marginTop: 8, fontFamily: 'monospace' }}
                  />
                </Col>
                <Col span={12}>
                  <Text>Amount (wei/units)</Text>
                  <Input 
                    placeholder="1000000000000000000" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={{ marginTop: 8, fontFamily: 'monospace' }}
                  />
                </Col>
                <Col span={24}>
                  <Text>Spender (Approved Address)</Text>
                  <Input 
                    placeholder="0x0" 
                    value={spender}
                    onChange={(e) => setSpender(e.target.value)}
                    style={{ marginTop: 8, fontFamily: 'monospace' }}
                  />
                </Col>
              </Row>
            </div>
          )}

          <div>
            <Text>Value (ETH)</Text>
            <Input 
              placeholder="0" 
              value={msgValue}
              onChange={(e) => setMsgValue(e.target.value)}
              style={{ marginTop: 8, fontFamily: 'monospace' }}
            />
          </div>

          <div>
            <Text>Calldata</Text>
            <TextArea 
              rows={4} 
              placeholder="0x0" 
              value={calldata}
              onChange={(e) => setCalldata(e.target.value)}
              style={{ marginTop: 8, fontFamily: 'monospace' }}
            />
          </div>
        </Flex>
      </Card>
    </Flex>
  );
}
