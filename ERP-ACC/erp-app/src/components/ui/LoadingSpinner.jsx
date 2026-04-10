export default function LoadingSpinner({ message = 'Memuat...' }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mb-4"></div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  )
}
