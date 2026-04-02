// src/components/StatCard.jsx

const VALUE_COLOR = {
  'bg-blue-500':   'text-blue-600',
  'bg-yellow-500': 'text-yellow-600',
  'bg-green-500':  'text-green-600',
  'bg-red-500':    'text-red-600',
};

const StatCard = ({ title, value, icon, color }) => (
  <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
    <div className="flex items-center justify-between mb-1">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
      <span className={`${VALUE_COLOR[color] ?? 'text-slate-400'} opacity-60`}>{icon}</span>
    </div>
    <p className={`text-2xl font-bold ${VALUE_COLOR[color] ?? 'text-slate-800'}`}>{value}</p>
  </div>
);

export default StatCard;
