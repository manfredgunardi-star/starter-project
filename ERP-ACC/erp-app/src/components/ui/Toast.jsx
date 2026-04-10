import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

export default function Toast({ message, type = 'success', onClose }) {
  const typeConfig = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      icon: CheckCircle,
      iconColor: 'text-green-600'
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: AlertCircle,
      iconColor: 'text-red-600'
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: Info,
      iconColor: 'text-blue-600'
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-800',
      icon: AlertTriangle,
      iconColor: 'text-yellow-600'
    }
  }

  const config = typeConfig[type]
  const IconComponent = config.icon

  return (
    <div className={`${config.bg} border ${config.border} rounded-lg p-4 flex gap-3 items-start shadow-lg animate-in fade-in slide-in-from-right`}>
      <IconComponent className={`${config.iconColor} flex-shrink-0 mt-0.5`} size={20} />
      <p className={`${config.text} text-sm flex-1`}>{message}</p>
      <button
        onClick={onClose}
        className={`${config.text} hover:opacity-70 transition flex-shrink-0`}
      >
        <X size={18} />
      </button>
    </div>
  )
}
