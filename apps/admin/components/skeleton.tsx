'use client'

interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-t-hover ${className}`}
      style={style}
    />
  )
}

export function SkeletonTableRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-t-default">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-6 py-4">
              <Skeleton className={`h-4 ${j === 0 ? 'w-28' : 'w-20'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function SkeletonCard() {
  return (
    <div className="glass-card rounded-xl p-5">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-20 mb-3" />
      <div className="h-px bg-gradient-to-r from-edge-cyan/10 to-transparent" />
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="glass-card rounded-xl p-6">
      <Skeleton className="h-3 w-32 mb-6" />
      <div className="flex items-end gap-2 h-48">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end">
            <Skeleton
              className="w-full rounded-t"
              style={{ height: `${20 + Math.random() * 60}%` } as React.CSSProperties}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
