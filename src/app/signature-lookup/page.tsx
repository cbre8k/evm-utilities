'use client';

import { useState } from 'react';
import { Typography, Input, Table, Card, Space, Tag, Flex, Button, message, Skeleton } from 'antd';
import { SearchOutlined, CheckCircleFilled, CopyOutlined } from '@ant-design/icons';
import './signature.css';

const { Title, Text } = Typography;

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

  const handleSearch = async () => {
    if (!searchText) return;
    setLoading(true);
    setSearched(true);
    try {
      const url = new URL('https://api.4byte.sourcify.dev/signature-database/v1/search');
      url.searchParams.append('query', searchText);
      
      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.ok) {
        const flattened: SignatureResult[] = [];
        
        // Process functions
        if (data.result.function) {
          Object.entries(data.result.function).forEach(([hash, sigs]: [string, any]) => {
            sigs.forEach((sig: any) => {
              flattened.push({
                hash,
                name: sig.name,
                filtered: sig.filtered,
                hasVerifiedContract: sig.hasVerifiedContract,
                type: 'function'
              });
            });
          });
        }

        // Process events
        if (data.result.event) {
          Object.entries(data.result.event).forEach(([hash, sigs]: [string, any]) => {
            sigs.forEach((sig: any) => {
              flattened.push({
                hash,
                name: sig.name,
                filtered: sig.filtered,
                hasVerifiedContract: sig.hasVerifiedContract,
                type: 'event'
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
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => (
        <Tag color={type === 'function' ? 'blue' : 'purple'} style={{ textTransform: 'capitalize', borderRadius: '4px' }}>
          {type}
        </Tag>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 450,
      render: (name: string) => (
        <Text 
          copyable={{ icon: <CopyOutlined style={{ color: '#bfbfbf', fontSize: '12px' }} /> }} 
          style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '13px', color: '#1a1a1a' }}
        >
          {name}
        </Text>
      ),
    },
    {
      title: 'Hash',
      dataIndex: 'hash',
      key: 'hash',
      render: (hash: string, record: SignatureResult) => (
        <Flex align="center" gap="small">
          {record.hasVerifiedContract && (
            <CheckCircleFilled style={{ color: '#27c93f', fontSize: '14px' }} />
          )}
          <Text 
            copyable={{ icon: <CopyOutlined style={{ color: '#bfbfbf', fontSize: '12px' }} /> }} 
            style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '13px', color: '#1a1a1a' }}
          >
            {hash}
          </Text>
        </Flex>
      ),
    },
  ];

  return (
    <div className="signature-lookup-container">
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: '0 0 4px 0' }}>Signature Lookup</Title>
        <Text type="secondary" style={{ fontSize: '14px' }}>
          Search for function and event signatures using Sourcify 4byte database.
        </Text>
      </div>

      <Card 
        styles={{ body: { padding: '16px' } }}
        style={{ 
          marginBottom: 20, 
          borderRadius: '12px', 
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          flexShrink: 0
        }}
      >
        <Space.Compact style={{ width: '100%' }}>
          <Input 
            size="large"
            placeholder="Search by function name (e.g. transfer*, balance?f)" 
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={handleSearch}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            style={{ borderRadius: '8px 0 0 8px' }}
          />
          <Button 
              type="primary" 
              size="large" 
              onClick={handleSearch} 
              loading={loading}
              style={{ width: '120px', borderRadius: '0 8px 8px 0', background: '#2b4fa3' }}
          >
            Search
          </Button>
        </Space.Compact>
      </Card>

      <div style={{ minHeight: 0 }}>
        {searched && !loading && (
          <div style={{ marginBottom: 8, paddingLeft: 4 }}>
            <Text type="secondary" style={{ fontSize: '13px' }}>Found {results.length} signatures</Text>
          </div>
        )}
        
        <div className="table-wrapper">
          {loading ? (
            <div style={{ padding: '24px' }}>
              <Skeleton active paragraph={{ rows: 5 }} />
            </div>
          ) : (
            <Table 
              dataSource={results} 
              columns={columns} 
              rowKey={(record) => `${record.hash}-${record.name}`}
              pagination={results.length > 50 ? { pageSize: 50, showSizeChanger: false, size: 'small' } : false}
              locale={{ emptyText: searched ? 'No signatures found' : 'Enter a search term above' }}
              className="styled-signature-table"
              size="middle"
              tableLayout="fixed"
            />
          )}
        </div>
      </div>
    </div>
  );
}
