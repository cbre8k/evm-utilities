import { Badge, Button, Input } from '@/components/ui';
import styles from '../explorer.module.scss';
import type { PageState } from '../utils';

interface Props {
  rpcUrl: string;
  state: PageState;
  txHash: string;
  aliasCount: number;
  onExplore: () => void;
  onRpcUrlChange: (value: string) => void;
  onTxHashChange: (value: string) => void;
  onAliasClick: () => void;
}

export default function ExplorerInputBar({
  rpcUrl,
  state,
  txHash,
  aliasCount,
  onExplore,
  onRpcUrlChange,
  onTxHashChange,
  onAliasClick,
}: Props) {
  return (
    <div className={styles.inputBar}>
      <div className={styles.inputHero}>
        <div className={styles.heroHeader}>
          <span className={styles.heroName}>@jim</span>
          <Badge fontSize={9}>EXPLORER</Badge>
        </div>
        <div className={styles.heroSub}>TRANSACTIONS EXPLORER</div>
      </div>

      <div className={styles.inputControls}>
        <div className={styles.inputWrap}>
          <Input
            fontSize={12}
            label="Transaction Hash"
            hint="Hash of the transaction to explore"
            placeholder="0x7686d80c3947cc80babeb1689117884195b0b3d45b0db6bf91defcfc9f1f1394"
            value={txHash}
            onChange={e => onTxHashChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onExplore()}
            spellCheck={false}
          />
        </div>

        <div className={styles.inputWrap}>
          <Input
            fontSize={12}
            label="RPC URL"
            hint="Archive node endpoint for historical state"
            placeholder="https://rpc.ankr.com/eth"
            value={rpcUrl}
            onChange={e => onRpcUrlChange(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className={styles.buttonCol}>
          <Button
            className={styles.exploreBtn}
            onClick={onExplore}
            disabled={state === 'loading'}
            fontSize={11}
          >
            {state === 'loading' ? 'TRACING…' : 'EXPLORE →'}
          </Button>

          <Button
            className={styles.aliasBtn}
            onClick={onAliasClick}
            fontSize={9}
            title="Private contract aliases — map unverified contracts to their ABI"
          >
            🔒{aliasCount > 0 ? ` ALIASES (${aliasCount})` : ' ALIASES'}
          </Button>
        </div>
      </div>
    </div>
  );
}
