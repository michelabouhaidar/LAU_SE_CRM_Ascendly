export default function ViewToggle({ value, onChange }) {
  const btn = (mode, title, hasDivider, icon) => (
    <button
      onClick={() => onChange(mode)}
      title={title}
      style={{
        padding: '5px 9px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: value === mode ? 'var(--green-text)' : 'var(--bg-2)',
        color: value === mode ? '#fff' : 'var(--text-3)',
        border: 'none',
        borderRight: hasDivider ? '1px solid var(--border)' : 'none',
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {icon}
    </button>
  )

  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      {btn('list', 'List view', true,
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )}
      {btn('cards', 'Card view', false,
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )}
    </div>
  )
}
