import React from 'react';

type TerminalWindowProps = {
  title: string;
  status?: "ONLINE" | "OFFLINE" | "WARNING" | "ERROR" | "online" | "offline" | "warning" | "error";
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  showControls?: boolean;
};

export const TerminalWindow: React.FC<TerminalWindowProps> = ({
  title,
  status,
  children,
  footer,
  style,
  contentStyle,
  onClose,
  onMinimize,
  onMaximize,
  showControls,
}) => {
  const normStatus = status?.toUpperCase();
  const statusColorClass =
    normStatus === 'ONLINE' || normStatus === 'SUCCESS'
      ? 'var(--color-success)'
      : normStatus === 'ERROR' || normStatus === 'FAILED'
      ? 'var(--color-danger)'
      : normStatus === 'WARNING' || normStatus === 'PENDING'
      ? 'var(--color-warning)'
      : 'var(--text-tertiary)';

  const hasControls = showControls || onClose || onMinimize || onMaximize;

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Title Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-default)',
          padding: '4px 8px',
          fontSize: '10px',
          background: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
            [ {title.toUpperCase()} ]
          </span>
          {normStatus && (
            <span style={{ color: statusColorClass, fontWeight: 'bold' }}>
              &lt;{normStatus}&gt;
            </span>
          )}
        </div>
        {hasControls && (
          <div style={{ display: 'flex', gap: '4px', opacity: 0.7 }}>
            {onMinimize && (
              <span onClick={onMinimize} style={{ cursor: 'pointer', fontFamily: 'monospace' }}>
                [-]
              </span>
            )}
            {onMaximize && (
              <span onClick={onMaximize} style={{ cursor: 'pointer', fontFamily: 'monospace' }}>
                [+]
              </span>
            )}
            {onClose && (
              <span onClick={onClose} style={{ cursor: 'pointer', fontFamily: 'monospace' }}>
                [x]
              </span>
            )}
            {!onMinimize && !onMaximize && !onClose && (
              <span style={{ letterSpacing: '2px' }}>[-][+][x]</span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          padding: '12px',
          flex: 1,
          position: 'relative',
          minHeight: 0,
          overflowY: 'auto',
          ...contentStyle,
        }}
      >
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div
          style={{
            borderTop: '1px solid var(--border-default)',
            padding: '4px 8px',
            fontSize: '9px',
            background: 'var(--bg-primary)',
            color: 'var(--text-tertiary)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};
