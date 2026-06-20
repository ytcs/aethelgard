import React from 'react';
import type { TocItem, Bookmark, HistoryEntry } from '../types';
import { BookOpen, BookmarkCheck, History, Trash2 } from 'lucide-react';

interface SidebarProps {
  toc: TocItem[];
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  onJumpToPage: (pageNumber: number, tocItem?: TocItem) => void;
  activeTab: 'toc' | 'bookmarks' | 'history';
  setActiveTab: (tab: 'toc' | 'bookmarks' | 'history') => void;
  collapsed: boolean;
  onClearHistory: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  toc,
  bookmarks,
  history,
  onJumpToPage,
  activeTab,
  setActiveTab,
  collapsed,
  onClearHistory,
}) => {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getReasonBadge = (reason: HistoryEntry['reason']) => {
    switch (reason) {
      case 'annotated':
        return <span className="history-reason" style={{ backgroundColor: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' }}>Annotated</span>;
      case 'read':
        return <span className="history-reason" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>Read</span>;
      case 'toc':
        return <span className="history-reason" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>TOC Link</span>;
      case 'jump':
      default:
        return <span className="history-reason" style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' }}>Jumped</span>;
    }
  };

  return (
    <div className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Sidebar Tabs */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'toc' ? 'active' : ''}`}
          onClick={() => setActiveTab('toc')}
          title="Table of Contents"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <BookOpen size={16} style={{ margin: '0 auto' }} />
            <span>Contents</span>
          </div>
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'bookmarks' ? 'active' : ''}`}
          onClick={() => setActiveTab('bookmarks')}
          title="Bookmarks"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <BookmarkCheck size={16} style={{ margin: '0 auto' }} />
            <span>Bookmarks</span>
          </div>
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          title="Smart Viewpoint History"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <History size={16} style={{ margin: '0 auto' }} />
            <span>History</span>
          </div>
        </button>
      </div>

      {/* Sidebar Content */}
      <div className="sidebar-content">
        {/* Table of Contents Tab */}
        {activeTab === 'toc' && (
          <div>
            {toc.length === 0 ? (
              <div className="empty-state">
                No Table of Contents found in this document.
              </div>
            ) : (
              <ul className="toc-list">
                {toc.map((item, index) => (
                  <li
                    key={index}
                    className={`toc-item level-${Math.min(3, item.level)}`}
                    onClick={() => onJumpToPage(item.pageNumber, item)}
                    title={item.isResolving ? `${item.title} (Resolving page...)` : `${item.title} (Page ${item.pageNumber})`}
                    style={{
                      cursor: 'pointer',
                      opacity: item.isResolving ? 0.75 : 1
                    }}
                  >
                    <span style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      display: 'inline-block',
                      maxWidth: 'calc(100% - 40px)'
                    }}>
                      {item.title}
                    </span>
                    {item.isResolving ? (
                      <span className="toc-resolving-spinner" style={{ 
                        float: 'right', 
                        fontSize: '0.7rem', 
                        color: 'var(--text-muted)'
                      }}>
                        ...
                      </span>
                    ) : (
                      <span style={{ 
                        float: 'right', 
                        fontSize: '0.75rem', 
                        color: 'var(--text-muted)',
                        marginLeft: '8px'
                      }}>
                        {item.pageNumber}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Bookmarks Tab */}
        {activeTab === 'bookmarks' && (
          <div>
            {bookmarks.length === 0 ? (
              <div className="empty-state">
                No bookmarks added yet.<br />
                <span style={{ fontSize: '0.75rem', marginTop: '8px', display: 'inline-block' }}>
                  Click the bookmark icon in any viewer header to save a page.
                </span>
              </div>
            ) : (
              <div>
                {bookmarks
                  .sort((a, b) => a.pageNumber - b.pageNumber)
                  .map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="bookmark-item"
                      onClick={() => onJumpToPage(bookmark.pageNumber)}
                    >
                      <div className="bookmark-title">{bookmark.label}</div>
                      <div className="bookmark-meta">
                        <span>Page {bookmark.pageNumber}</span>
                        <span>{formatTime(bookmark.timestamp)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Smart Viewpoints (Last {history.length})
              </span>
              {history.length > 0 && (
                <button
                  onClick={onClearHistory}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.7rem'
                  }}
                  title="Clear history logs"
                >
                  <Trash2 size={12} /> Clear
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="empty-state">
                History is currently empty.<br />
                <span style={{ fontSize: '0.75rem', marginTop: '8px', display: 'inline-block' }}>
                  Smart tracking remembers pages when you jump sections, read for &gt;5s, or draw annotations.
                </span>
              </div>
            ) : (
              <div>
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="history-item"
                    onClick={() => onJumpToPage(entry.pageNumber)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Page {entry.pageNumber}
                      </span>
                      {getReasonBadge(entry.reason)}
                    </div>
                    {entry.sectionName && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.sectionName}
                      </div>
                    )}
                    <div className="history-meta" style={{ justifyContent: 'flex-end' }}>
                      <span>{formatTime(entry.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
