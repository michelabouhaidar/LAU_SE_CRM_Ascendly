import { useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import ViewToggle from '../components/ViewToggle'
import UserAvatar from '../components/UserAvatar'

const STATUS_COLOR = {
  Pending:  '#F97316',
  Approved: '#22C55E',
  Rejected: '#ef4444',
}
const Chip = ({ color, label }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '2px 8px', borderRadius: 5,
    background: `${color}18`,
    fontSize: 11, fontWeight: 700, color, letterSpacing: '0.03em',
  }}>
    {label}
  </span>
)

export default function Approvals() {
  const { user } = useAuth()
  const [approvals,        setApprovals]        = useState([])
  const [loading,          setLoading]          = useState(true)
  const [filter,           setFilter]           = useState('Pending')
  const [viewMode,         setViewMode]         = useState('list')
  const [acting,           setActing]           = useState(null)
  const [selectedApproval, setSelectedApproval] = useState(null)

  const canDecide = ['Admin', 'Sales Manager'].includes(user?.role)

  const load = () => {
    const q = filter !== 'All' ? `?status=${filter}` : ''
    api.get(`/approvals${q}`)
      .then(r => setApprovals(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter])

  const decide = async (id, status) => {
    setActing(id + status)
    try {
      await api.patch(`/approvals/${id}`, { status })
      setSelectedApproval(null)
      load()
    } catch (e) {
      alert(e.response?.data?.error ?? 'Error')
    } finally {
      setActing(null)
    }
  }

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    : '—'

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Approvals</div>
          <div className="page-subtitle">Discount and deal approval requests</div>
        </div>
        <div className="flex items-center gap-8">
          {['Pending', 'Approved', 'Rejected', 'All'].map(f => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <div className="card" style={{
        opacity: loading ? 0.4 : 1,
        filter: loading ? 'blur(1px)' : 'none',
        transition: 'opacity 0.35s ease, filter 0.35s ease',
      }}>
        {loading ? (
          <LoadingSkeleton viewMode={viewMode} />
        ) : approvals.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg></div>
            <h3>No {filter !== 'All' ? filter.toLowerCase() : ''} approvals</h3>
            <p>Approval requests will appear here.</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Deal</th><th>Type</th><th>Discount</th><th>Requested by</th><th>Date</th><th>Status</th>
                  {canDecide && filter === 'Pending' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {approvals.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedApproval(a)}>
                    <td>
                      <div className="flex items-center gap-6">
                        {a.deal_number && <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--green-text)', fontWeight: 700 }}>DEAL-{a.deal_number}</span>}
                        <div className="font-semi">{a.deal_title ?? '—'}</div>
                      </div>
                      <div className="text-xs text-gray truncate" style={{ maxWidth: 180 }}>{a.justification}</div>
                    </td>
                    <td><Chip color="#3B82F6" label={a.type} /></td>
                    <td className="font-bold">
                      {a.discount_pct != null ? `${a.discount_pct}%` : <span className="text-gray">—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <UserAvatar name={a.requested_by_name} size={22} />
                        <span className="text-sm">{a.requested_by_name}</span>
                      </div>
                    </td>
                    <td className="text-sm text-gray">{fmtDate(a.request_date)}</td>
                    <td><Chip color={STATUS_COLOR[a.status] ?? '#74ba89'} label={a.status} /></td>
                    {canDecide && filter === 'Pending' && (
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-8">
                          <button className="btn btn-sm btn-success" disabled={!!acting} onClick={() => decide(a.id, 'Approved')}>
                            {acting === a.id + 'Approved' ? <span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.3)' }} /> : 'Approve'}
                          </button>
                          <button className="btn btn-sm btn-danger" disabled={!!acting} onClick={() => decide(a.id, 'Rejected')}>
                            {acting === a.id + 'Rejected' ? <span className="spinner" /> : 'Reject'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16, padding: 20,
          }}>
            {approvals.map(a => {
              const statusColor = STATUS_COLOR[a.status] ?? '#74ba89'
              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedApproval(a)}
                  style={{
                    background: 'var(--bg-2)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: 16, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    borderLeft: `3px solid ${statusColor}`,
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
                >
                  {}
                  <div>
                    {a.deal_number && (
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--green-text)', fontWeight: 700, marginBottom: 3 }}>
                        DEAL-{a.deal_number}
                      </div>
                    )}
                    <div className="font-semi" style={{ fontSize: 14, lineHeight: 1.4 }}>{a.deal_title ?? '—'}</div>
                    {a.justification && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {a.justification}
                      </div>
                    )}
                  </div>

                  {}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip color="#3B82F6" label={a.type} />
                    <Chip color={statusColor} label={a.status} />
                    {a.discount_pct != null && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{a.discount_pct}% off</span>
                    )}
                  </div>

                  {}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <UserAvatar name={a.requested_by_name} size={24} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{a.requested_by_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtDate(a.request_date)}</div>
                      </div>
                    </div>
                    {canDecide && a.status === 'Pending' && (
                      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        <button className="btn btn-sm btn-success" disabled={!!acting} onClick={() => decide(a.id, 'Approved')}>
                          {acting === a.id + 'Approved' ? <span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.3)' }} /> : 'Approve'}
                        </button>
                        <button className="btn btn-sm btn-danger" disabled={!!acting} onClick={() => decide(a.id, 'Rejected')}>
                          {acting === a.id + 'Rejected' ? <span className="spinner" /> : 'Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedApproval && (
        <ApprovalDetailModal
          approval={selectedApproval}
          canDecide={canDecide}
          acting={acting}
          onDecide={decide}
          onClose={() => setSelectedApproval(null)}
        />
      )}
    </div>
  )
}

function ApprovalDetailModal({ approval: a, canDecide, acting, onDecide, onClose }) {
  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    : '—'

  return (
    <Modal title="Approval Request" onClose={onClose} width={480}>
      <div>
        <div className="detail-field" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</label>
          <Chip color={STATUS_COLOR[a.status] ?? '#74ba89'} label={a.status} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <div className="detail-field" style={{ display: 'flex', gap: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 110, fontWeight: 600 }}>Deal</label>
            <div>
              {a.deal_number && <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--green-text)', fontWeight: 700, marginBottom: 2 }}>DEAL-{a.deal_number}</div>}
              <span style={{ fontSize: 13, fontWeight: 600 }}>{a.deal_title ?? '—'}</span>
            </div>
          </div>
          <div className="detail-field" style={{ display: 'flex', gap: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 110, fontWeight: 600 }}>Type</label>
            <Chip color="#3B82F6" label={a.type} />
          </div>
          <div className="detail-field" style={{ display: 'flex', gap: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 110, fontWeight: 600 }}>Discount</label>
            <span style={{ fontSize: 13 }}>{a.discount_pct != null ? `${a.discount_pct}%` : '—'}</span>
          </div>
          <div className="detail-field" style={{ display: 'flex', gap: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 110, fontWeight: 600 }}>Requested by</label>
            <span style={{ fontSize: 13 }}>{a.requested_by_name}</span>
          </div>
          <div className="detail-field" style={{ display: 'flex', gap: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 110, fontWeight: 600 }}>Requested</label>
            <span style={{ fontSize: 13 }}>{fmtDate(a.request_date)}</span>
          </div>
          {a.status !== 'Pending' && (
            <>
              <div className="detail-field" style={{ display: 'flex', gap: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 110, fontWeight: 600 }}>Reviewed by</label>
                <span style={{ fontSize: 13 }}>{a.reviewed_by_name ?? '—'}</span>
              </div>
              <div className="detail-field" style={{ display: 'flex', gap: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 110, fontWeight: 600 }}>Decision date</label>
                <span style={{ fontSize: 13 }}>{fmtDate(a.decision_date)}</span>
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 110, fontWeight: 600, paddingTop: 2 }}>Justification</label>
            <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, flex: 1 }}>{a.justification}</span>
          </div>
        </div>

        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          {canDecide && a.status === 'Pending' && (
            <>
              <button
                className="btn btn-danger"
                disabled={!!acting}
                onClick={() => onDecide(a.id, 'Rejected')}
              >
                {acting === a.id + 'Rejected' ? <span className="spinner" /> : 'Reject'}
              </button>
              <button
                className="btn btn-success"
                disabled={!!acting}
                onClick={() => onDecide(a.id, 'Approved')}
              >
                {acting === a.id + 'Approved' ? <span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.3)' }} /> : 'Approve'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function LoadingSkeleton({ viewMode }) {
  if (viewMode === 'cards') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, padding: 20 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="skeleton" style={{ height: 11, width: 80, borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 14, width: '75%' }} />
            <div className="skeleton" style={{ height: 11, width: '90%' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <div className="skeleton" style={{ height: 20, width: 60, borderRadius: 5 }} />
              <div className="skeleton" style={{ height: 20, width: 70, borderRadius: 5 }} />
            </div>
            <div className="skeleton" style={{ height: 11, width: '40%', marginTop: 4 }} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 14 }} />
      ))}
    </div>
  )
}
