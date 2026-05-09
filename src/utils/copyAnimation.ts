import type { CSSProperties } from 'react';
import { message } from 'antd';

type FireworkStyle = CSSProperties & {
  '--dx': string;
  '--dy': string;
  '--rot': string;
  '--rot-end': string;
};

export function showCopiedFirework(count = 20) {
  for (let i = 0; i < count; i++) {
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
      } as FireworkStyle,
    });
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return false;
  await navigator.clipboard.writeText(text);
  return true;
}

export async function copyWithFirework(text: string) {
  const copied = await copyText(text);
  if (!copied) return false;
  showCopiedFirework();
  return true;
}
