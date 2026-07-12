import { Component } from 'react'
import { Button, Result } from 'antd'

/**
 * Error Boundary untuk menangkap chunk-load failures pada lazy-loaded routes.
 * React Error Boundary HARUS berupa class component.
 *
 * Dipasang di sekeliling <Suspense> di App.jsx. Menampilkan UI fallback
 * yang actionable saat chunk JS gagal dimuat (mis. network error, deploy baru).
 */
export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log untuk debugging — bisa diganti Sentry di masa depan
    console.error('[RouteErrorBoundary] Chunk gagal dimuat:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Importing a module script failed')

      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <Result
            status="warning"
            title="Halaman gagal dimuat"
            subTitle={
              isChunkError
                ? 'Aplikasi baru saja diperbarui. Muat ulang untuk mendapatkan versi terbaru.'
                : (this.state.error?.message ?? 'Terjadi kesalahan saat memuat halaman.')
            }
            extra={[
              <Button
                type="primary"
                key="reload"
                onClick={() => window.location.reload()}
              >
                Muat Ulang
              </Button>,
              <Button
                key="home"
                onClick={() => window.location.href = '/'}
              >
                Kembali ke Dashboard
              </Button>,
            ]}
          />
        </div>
      )
    }

    return this.props.children
  }
}
