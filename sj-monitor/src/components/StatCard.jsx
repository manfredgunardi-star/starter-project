// src/components/StatCard.jsx

const StatCard = ({ title, value, icon, color }) => (
  <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-600 text-xs sm:text-sm">{title}</p>
        <p className="text-xl sm:text-3xl font-bold text-gray-800 mt-1">{value}</p>
      </div>
      <div className={`${color} p-2 sm:p-3 rounded-lg text-white`}>
        {icon}
      </div>
    </div>
  </div>
);

export default StatCard;
