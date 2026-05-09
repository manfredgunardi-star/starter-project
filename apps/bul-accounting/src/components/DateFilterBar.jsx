import React from 'react'
import { Calendar } from 'lucide-react'

export default function DateFilterBar({ startDate, endDate, onStartDate, onEndDate, children }) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          type="date"
          value={startDate}
          onChange={e => onStartDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
        />
        <span className="text-gray-400 text-sm">–</span>
        <input
          type="date"
          value={endDate}
          onChange={e => onEndDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
        />
      </div>
      {children}
    </div>
  )
}
