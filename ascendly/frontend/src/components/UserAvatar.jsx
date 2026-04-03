const COLORS = ['#FA5D29', '#49B3FC', '#14B8A6', '#a78bfa', '#f59e0b']

export function avatarColor(name) {
  return COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length]
}

export function initials(name) {
  return name?.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) ?? '?'
}

export default function UserAvatar({ name, size = 26 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: avatarColor(name), color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, letterSpacing: '0.02em',
    }}>
      {initials(name)}
    </div>
  )
}
