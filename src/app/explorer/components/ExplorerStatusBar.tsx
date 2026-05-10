import { Status } from '@/components/ui';
import styles from '../explorer.module.scss';
import type { PageState } from '../utils';

interface Props {
  elapsedMs: number;
  state: PageState;
  status: string;
}

export default function ExplorerStatusBar({
  elapsedMs,
  state,
  status,
}: Props) {
  const tone = state === 'done' ? 'success'
    : state === 'loading' ? 'loading'
    : state === 'error' ? 'error' : 'idle';

  const statusText = state === 'idle' ? 'Paste a tx hash + archive RPC and press EXPLORE'
    : state === 'loading' ? status
    : state === 'done' ? `Done in ${(elapsedMs / 1000).toFixed(1)}s`
    : `✖ ${status}`;

  return (
    <div className={styles.statusBar}>
      <Status tone={tone} fontSize={10}>{statusText}</Status>
    </div>
  );
}
