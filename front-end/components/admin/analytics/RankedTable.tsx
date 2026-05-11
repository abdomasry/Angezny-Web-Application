'use client'

// Generic ranked table used for top-categories, top-services, top-workers,
// top-customers, etc. Caller passes a column spec; the component handles
// the empty state, header, and row striping.

interface Column<T> {
  key: string
  label: string
  // Render a cell. Defaults to `String(row[key])` if omitted.
  render?: (row: T) => React.ReactNode
  align?: 'start' | 'end' | 'center'
}

interface Props<T> {
  title: string
  rows: T[]
  columns: Column<T>[]
  emptyText?: string
}

export default function RankedTable<T extends object>({ title, rows, columns, emptyText = 'لا توجد بيانات' }: Props<T>) {
  return (
    <div className="bg-white rounded-xl p-5 border border-outline-variant/15">
      <h3 className="font-semibold text-on-surface mb-4">{title}</h3>
      {rows.length === 0 ? (
        <div className="text-center text-on-surface-variant text-sm py-8">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-on-surface-variant border-b border-outline-variant/15">
                <th className="py-2 px-2 text-start font-medium w-10">#</th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`py-2 px-2 font-medium ${
                      c.align === 'end' ? 'text-end' : c.align === 'center' ? 'text-center' : 'text-start'
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-outline-variant/10 last:border-0">
                  <td className="py-2 px-2 text-on-surface-variant">{idx + 1}</td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`py-2 px-2 text-on-surface ${
                        c.align === 'end' ? 'text-end' : c.align === 'center' ? 'text-center' : 'text-start'
                      }`}
                    >
                      {c.render
                        ? c.render(row)
                        : // @ts-expect-error — fallback string coerce on unknown key
                          String(row[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
