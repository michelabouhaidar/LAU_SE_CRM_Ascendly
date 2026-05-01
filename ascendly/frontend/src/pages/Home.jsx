import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useRef, useState } from 'react'

/* ─── Intersection observer for scroll-in animations ─── */
function useInView(threshold = 0.12) {
  const ref  = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true) },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, inView]
}

/* ─── Animated number counter ─── */
function Counter({ to, prefix = '', suffix = '' }) {
  const [val, setVal] = useState(0)
  const [ref, inView] = useInView(0.5)
  useEffect(() => {
    if (!inView) return
    let v = 0
    const step = to / 55
    const id = setInterval(() => {
      v += step
      if (v >= to) { setVal(to); clearInterval(id) }
      else setVal(Math.floor(v))
    }, 28)
    return () => clearInterval(id)
  }, [inView, to])
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>
}

/* ─── Data ─── */
const FEATURES = [
  { icon: <IcoContacts />, title: 'Contacts & Organisations', desc: 'A unified record for every lead, contact, and account — with full interaction history at a glance.' },
  { icon: <IcoPipeline />, title: 'Kanban Pipeline',          desc: 'Drag deals through custom stages. Visualise your entire funnel and forecast revenue accurately.' },
  { icon: <IcoTask />,     title: 'Tasks & Approvals',        desc: 'Assign, prioritise, and approve actions across your team without ever leaving the CRM.' },
  { icon: <IcoReport />,   title: 'Revenue Analytics',        desc: 'Live revenue dashboards, pipeline value by stage, and win/loss breakdowns for every member.' },
  { icon: <IcoRBAC />,     title: 'Role-Based Access',        desc: 'Every team member gets a tailored dashboard with the right data and the right permissions.' },
  { icon: <IcoAudit />,    title: 'Audit Logs',               desc: 'Every action tracked and timestamped. Full accountability and compliance built in from day one.' },
]

const STEPS = [
  { n: '01', title: 'Add your contacts & deals',   desc: 'Import or manually create leads, contacts, and organisations. Link everything to deals with full context attached.' },
  { n: '02', title: 'Build your custom pipeline',  desc: 'Create stages that match your exact process. Assign owners, set expected values, and move deals as they progress.' },
  { n: '03', title: 'Track, approve & close',      desc: 'Log every interaction, manage tasks and approvals, then watch revenue land on your live analytics dashboard.' },
]

const STATS = [
  { label: 'Deals manageable', to: 12000, prefix: '',  suffix: '+' },
  { label: 'Tasks tracked',    to: 80000, prefix: '',  suffix: '+' },
  { label: 'Revenue visible',  to: 320,   prefix: '$', suffix: 'M+' },
  { label: 'Pipeline stages',  to: 999,   prefix: '',  suffix: '+' },
]

const MARQUEE = [
  'From first contact to signed contract',
  'Full pipeline visibility for every team',
  'Live revenue analytics, always up to date',
  'Approvals and tasks in one place',
  'Built for high-performance sales teams',
  'Clarity at every stage of the deal',
]

/* ═══════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════ */
export default function Home() {
  const { token } = useAuth()
  const navigate  = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (token) navigate('/dashboard', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div className="lp">

      {/* ── Nav ───────────────────────────────────────── */}
      <nav className={`lp-nav${scrolled ? ' lp-nav--solid' : ''}`}>
        <div className="lp-nav-inner">
          <div className="lp-logo">
            <div className="lp-logo-mark">A</div>
            <span className="lp-logo-text">Ascendly</span>
          </div>
          <div className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
          </div>
          <div className="lp-nav-ctas">
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/login')}>Sign in →</button>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-bg" />
        <div className="lp-hero-grid" />
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <h1 className="lp-h1">
              Close more deals.<br />With total <em>clarity</em>.
            </h1>
            <p className="lp-hero-sub">
              Ascendly is the CRM built for high-performance sales teams — manage your entire
              pipeline with role-based dashboards, live analytics, and seamless team workflows.
            </p>
            <div className="lp-hero-actions">
              <a href="#how" className="lp-ghost-btn lp-ghost-btn--lg">How it works ↓</a>
            </div>
            <div className="lp-micro-stats">
              <div className="lp-ms"><span className="lp-ms-val">5</span><span className="lp-ms-lbl">User roles</span></div>
              <span className="lp-ms-sep" />
              <div className="lp-ms"><span className="lp-ms-val">6</span><span className="lp-ms-lbl">Core modules</span></div>
              <span className="lp-ms-sep" />
              <div className="lp-ms"><span className="lp-ms-val">∞</span><span className="lp-ms-lbl">Pipeline stages</span></div>
            </div>
          </div>

          <div className="lp-hero-preview">
            <DashPreview />
          </div>
        </div>
      </section>

      {/* ── Marquee ───────────────────────────────────── */}
      <div className="lp-marquee-wrap">
        <div className="lp-marquee">
          {[...MARQUEE, ...MARQUEE].map((t, i) => (
            <span key={i} className="lp-mq-item"><span className="lp-mq-dot" />{t}</span>
          ))}
        </div>
      </div>

      {/* ── Features ──────────────────────────────────── */}
      <section id="features" className="lp-section">
        <LpTag>Features</LpTag>
        <h2 className="lp-sh2">Everything your team needs,<br />in one place.</h2>
        <p className="lp-sp">No integrations required. No extra tools. Just a CRM that works for every role on your team.</p>
        <div className="lp-feat-grid">
          {FEATURES.map((f, i) => <FeatCard key={f.title} {...f} delay={i * 70} color="var(--green)" />)}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────── */}
      <section id="how" className="lp-section-alt">
        <div className="lp-section-inner">
          <LpTag>Process</LpTag>
          <h2 className="lp-sh2">Up and running in minutes.</h2>
          <p className="lp-sp">Three steps from sign-in to closing deals.</p>
          <div className="lp-steps">
            {STEPS.map((s, i) => <StepCard key={s.n} {...s} delay={i * 100} last={i === STEPS.length - 1} />)}
          </div>
        </div>
      </section>

      {/* ── Stats strip ───────────────────────────────── */}
      <div className="lp-stats-strip">
        {STATS.map((s, i) => (
          <div key={i} className="lp-strip-stat">
            <div className="lp-strip-val mono">
              <Counter to={s.to} prefix={s.prefix} suffix={s.suffix} />
            </div>
            <div className="lp-strip-lbl">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Footer ────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo" style={{ marginBottom: 10 }}>
              <div className="lp-logo-mark" style={{ width: 26, height: 26, fontSize: 13 }}>A</div>
              <span className="lp-logo-text" style={{ fontSize: 14 }}>Ascendly</span>
            </div>
            <p className="lp-footer-tagline">The CRM built for high-performance sales teams.</p>
          </div>
          <div className="lp-footer-cols">
            <div className="lp-footer-col">
              <div className="lp-footer-col-h">Product</div>
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
            </div>
            <div className="lp-footer-col">
              <div className="lp-footer-col-h">Access</div>
              <button className="lp-footer-link" onClick={() => navigate('/login')}>Sign in</button>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          © {new Date().getFullYear()} Ascendly. All rights reserved.
        </div>
      </footer>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD PREVIEW WIDGET
═══════════════════════════════════════════════════════ */
function DashPreview() {
  return (
    <div className="lp-dash">
      <div className="lp-dash-topbar">
        <span className="lp-dash-title">Pipeline Overview</span>
        <span className="lp-dash-live"><span className="lp-dash-dot" />Live</span>
      </div>

      <div className="lp-dash-metrics">
        {[
          { label: 'Total Revenue', val: '$4.2M', trend: '↑ 18%', up: true },
          { label: 'Open Deals',    val: '142',   trend: '↑ 6',   up: true },
          { label: 'Win Rate',      val: '68%',   trend: '→ stable', up: false },
        ].map(m => (
          <div key={m.label} className="lp-dm">
            <div className="lp-dm-lbl">{m.label}</div>
            <div className="lp-dm-val mono">{m.val}</div>
            <div className={`lp-dm-trend${m.up ? ' lp-up' : ''}`}>{m.trend}</div>
          </div>
        ))}
      </div>

      <div className="lp-dash-stages">
        <div className="lp-dash-stages-lbl">Pipeline by stage</div>
        {[
          { name: 'Prospecting', n: 42, pct: 100 },
          { name: 'Qualified',   n: 28, pct: 67 },
          { name: 'Proposal',    n: 19, pct: 45 },
          { name: 'Negotiation', n: 11, pct: 26 },
          { name: 'Closing',     n:  7, pct: 17 },
        ].map(s => (
          <div key={s.name} className="lp-stage-row">
            <span className="lp-stage-name">{s.name}</span>
            <div className="lp-stage-track"><div className="lp-stage-fill" style={{ width: `${s.pct}%` }} /></div>
            <span className="lp-stage-n">{s.n}</span>
          </div>
        ))}
      </div>

      <div className="lp-dash-feed">
        {[
          { dot: 'green', text: <>Deal won — Acme Corp <strong>$245k</strong></> },
          { dot: 'blue',  text: 'Task completed — Follow-up call with TechFlow' },
          { dot: 'amber', text: 'Approval requested — NDA for Orion Systems' },
        ].map((a, i) => (
          <div key={i} className="lp-feed-row">
            <span className={`lp-feed-dot lp-dot-${a.dot}`} />
            <span className="lp-feed-text">{a.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   SUB-COMPONENTS
═══════════════════════════════════════════════════════ */
function LpTag({ children }) {
  return <div className="lp-tag">{children}</div>
}

function FeatCard({ icon, title, desc, color, delay }) {
  const [ref, inView] = useInView(0.1)
  return (
    <div
      ref={ref}
      className={`lp-feat-card${inView ? ' lp-visible' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="lp-feat-ico" style={{ background: `${color}18`, border: `1px solid ${color}28`, color }}>{icon}</div>
      <div className="lp-feat-title">{title}</div>
      <div className="lp-feat-desc">{desc}</div>
    </div>
  )
}

function StepCard({ n, title, desc, delay, last }) {
  const [ref, inView] = useInView(0.15)
  return (
    <div ref={ref} className={`lp-step${inView ? ' lp-visible' : ''}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="lp-step-n">{n}</div>
      <div className="lp-step-title">{title}</div>
      <div className="lp-step-desc">{desc}</div>
      {!last && <div className="lp-step-arrow">→</div>}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════
   ICONS
═══════════════════════════════════════════════════════ */
function IcoContacts() { return <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> }
function IcoPipeline() { return <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg> }
function IcoTask()     { return <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg> }
function IcoReport()   { return <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> }
function IcoRBAC()     { return <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg> }
function IcoAudit()    { return <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg> }
