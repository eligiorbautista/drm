import React, { useState, useRef, useEffect } from 'react';

interface DebugMessage {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface DebugPanelProps {
  id: string;
  title?: string;
}

export const useDebugLog = (id: string) => {
  const log = (level: 'info' | 'success' | 'warning' | 'error', message: string) => {
    const event = new CustomEvent<{ id: string; level: typeof level; message: string; timestamp: string }>('debug-log', {
      detail: { id, level, message, timestamp: new Date().toLocaleTimeString() }
    });
    window.dispatchEvent(event);
  };

  return { logInfo: (msg: string) => log('info', msg) };
};

export const DebugPanel: React.FC<DebugPanelProps> = ({ id, title = 'Debug Log' }) => {
  const [messages, setMessages] = useState<DebugMessage[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMessage = (event: CustomEvent) => {
      if (event.detail.id === id) {
        setMessages((prev) => [...prev, event.detail]);
      }
    };

    window.addEventListener('debug-log', handleMessage as EventListener);
    return () => window.removeEventListener('debug-log', handleMessage as EventListener);
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getTimestampColor = (level: DebugMessage['level']) => {
    if (level === 'error') return 'text-[#a0a0a0]';
    if (level === 'warning') return 'text-[#a0a0a0]';
    return 'text-[#a0a0a0]';
  };

  const levelIcons = {
    info: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    success: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    warning: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
    error: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  };

  const levelColors = {
    info: 'text-white',
    success: 'text-[#d0d0d0]',
    warning: 'text-[#d0d0d0]',
    error: 'text-[#d0d0d0]',
  };

  const levelBackgrounds = {
    info: '',
    success: '',
    warning: 'bg-[#252525]/50',
    error: 'bg-[#252525]/50',
  };

  const filteredMessages =
    filter === 'all' ? messages : messages.filter((m) => m.level === filter);

  return (
    <div className="w-full bg-[#141414]/95 border border-[#333333] rounded-lg overflow-hidden font-mono text-xs">
      {/* Header - Responsive flex layout */}
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-3 sm:px-4 py-3 bg-[#1e1e1e] border-b border-[#333333] cursor-pointer hover:bg-[#252525] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyPress={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-bold text-[#d0d0d0]">{title}</span>
          <span className="text-[#a0a0a0]">({filteredMessages.length})</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* Filter buttons - Scrollable on small screens */}
          <div className="flex gap-1 overflow-x-auto max-w-full sm:overflow-visible" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setFilter('all')}
              className={`px-2 sm:px-3 py-1 rounded text-xs cursor-pointer whitespace-nowrap ${
                filter === 'all' ? 'bg-white text-[#141414]' : 'bg-[#252525] text-[#a0a0a0]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('error')}
              className={`px-2 sm:px-3 py-1 rounded text-xs cursor-pointer whitespace-nowrap ${
                filter === 'error' ? 'bg-[#404040] text-white' : 'bg-[#252525] text-[#a0a0a0]'
              }`}
            >
              Errors
            </button>
            <button
              onClick={() => setFilter('warning')}
              className={`px-2 sm:px-3 py-1 rounded text-xs cursor-pointer whitespace-nowrap ${
                filter === 'warning' ? 'bg-[#404040] text-white' : 'bg-[#252525] text-[#a0a0a0]'
              }`}
            >
              Warnings
            </button>
          </div>
          {/* Clear button and expand icon */}
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMessages([]);
              }}
              className="px-2 sm:px-3 py-1 bg-[#252525] text-[#a0a0a0] hover:bg-[#333333] rounded text-xs transition-colors cursor-pointer min-h-[32px]"
            >
              Clear
            </button>
            {/* Expand/Collapse icon */}
            <span className="text-[#a0a0a0] transform transition-transform text-xs" style={{
              transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}>
              ▼
            </span>
          </div>
        </div>
      </div>

      {/* Messages - Responsive height */}
      {isExpanded && (
        <div className="max-h-48 sm:max-h-64 lg:max-h-80 overflow-y-auto p-3 sm:p-4 space-y-2 bg-[#1e1e1e]/50">
          {filteredMessages.length === 0 ? (
            <div className="text-[#a0a0a0] text-center py-6 sm:py-8 italic text-xs sm:text-sm">
              No messages yet...
            </div>
          ) : (
            filteredMessages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-2 py-1.5 sm:py-2 px-2 sm:px-3 rounded ${levelColors[msg.level]} ${levelBackgrounds[msg.level]}`}
              >
                <span className={`${getTimestampColor(msg.level)} shrink-0 text-[10px] sm:text-xs`}>[{msg.timestamp}]</span>
                <span className="shrink-0 flex-shrink-0">{levelIcons[msg.level]}</span>
                <span className="break-all text-xs">{msg.message}</span>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
};
