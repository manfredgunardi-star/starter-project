import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getDashboardMetrics, getMonthlyTrend } from '../services/dashboardService'
import { formatCurrency } from '../utils/currency'
import { formatDate } from '../utils/date'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import MonthlyTrendChart from '../components/dashboard/MonthlyTrendChart'
import {
  Row,
  Col,
  Card,
  Typography,
  Space,
  Flex,
  Tag,
} from 'antd'
import {
  TrendingUp,
  Wallet,
  AlertTriangle,
  Package,
  ArrowRight,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from 'lucide-react'

const { Title, Text } = Typography

const STATUS_COLOR = {
  draft: 'default',
  posted: 'blue',
  partial: 'gold',
  paid: 'success',
}

function MetricCard({ icon: Icon, label, value, color, sub }) {
  return (
    <Card style={{ background: color?.bg, borderColor: color?.border }}>
      <Space align="start">
        <div style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.6)' }}>
          <Icon size={22} style={{ color: color?.text }} />
        </div>
        <div>
          <Text style={{ fontSize: 13, opacity: 0.75, color: color?.text }}>{label}</Text>
          <div style={{ fontSize: 22, fontWeight: 700, color: color?.text, lineHeight: '1.3' }}>{value}</div>
          {sub && (
            typeof sub === 'string'
              ? <Text style={{ fontSize: 12, opacity: 0.6, color: color?.text }}>{sub}</Text>
              : sub
          )}
        </div>
      </Space>
    </Card>
  )
}

function SectionHeader({ title, linkTo, linkLabel }) {
  return (
    <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
      <Text strong style={{ fontSize: 14, color: '#1f2937' }}>{title}</Text>
      {linkTo && (
        <Link to={linkTo} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          {linkLabel} <ArrowRight size={12} />
        </Link>
      )}
    </Flex>
  )
}

function MomIndicator({ current, previous }) {
  if (!previous || previous === 0) return null
  const pct = ((current - previous) / previous * 100).toFixed(1)
  const up = current >= previous
  return (
    <Flex align="center" gap={2} style={{ marginTop: 2 }}>
      {up
        ? <ArrowUpRight size={12} color="#16a34a" />
        : <ArrowDownRight size={12} color="#dc2626" />}
      <span style={{ fontSize: 12, color: up ? '#16a34a' : '#dc2626' }}>
        {Math.abs(Number(pct))}% vs bulan lalu
      </span>
    </Flex>
  )
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState(null)
  const [trend, setTrend] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getDashboardMetrics(), getMonthlyTrend()])
      .then(([m, t]) => {
        setMetrics(m)
        setTrend(t)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Memuat dashboard..." />
  if (error) return <Alert type="error" message={error} showIcon />
  if (!metrics) return null

  const currentMonth = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Title level={2} style={{ margin: 0 }}>Dashboard</Title>

      {/* Metric Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            icon={TrendingUp}
            label="Penjualan Bulan Ini"
            value={formatCurrency(metrics.totalPenjualan)}
            color={{ bg: '#f0fdf4', border: '#bbf7d0', text: '#14532d' }}
            sub={
              <Space direction="vertical" size={0}>
                <Text style={{ fontSize: 12, opacity: 0.6, color: '#14532d' }}>{currentMonth}</Text>
                <MomIndicator current={metrics.totalPenjualan} previous={metrics.lastMonthPenjualan} />
              </Space>
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            icon={Banknote}
            label="Total Piutang"
            value={formatCurrency(metrics.totalPiutang)}
            color={{ bg: '#eff6ff', border: '#bfdbfe', text: '#1e3a5f' }}
            sub="Invoice belum lunas"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            icon={TrendingDown}
            label="Total Hutang"
            value={formatCurrency(metrics.totalHutang)}
            color={{ bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d' }}
            sub="Invoice pembelian belum lunas"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            icon={Wallet}
            label="Total Kas & Bank"
            value={formatCurrency(metrics.totalKas)}
            color={{ bg: '#faf5ff', border: '#e9d5ff', text: '#4c1d95' }}
            sub={`${metrics.accounts.length} akun`}
          />
        </Col>
      </Row>

      {/* Overdue Alert Row */}
      {(metrics.totalOverduePiutang > 0 || metrics.totalOverdueHutang > 0) && (
        <Row gutter={[16, 16]}>
          {metrics.totalOverduePiutang > 0 && (
            <Col xs={24} sm={12}>
              <MetricCard
                icon={Clock}
                label="Piutang Jatuh Tempo"
                value={formatCurrency(metrics.totalOverduePiutang)}
                color={{ bg: '#fff7ed', border: '#fed7aa', text: '#7c2d12' }}
                sub="AR sudah lewat jatuh tempo"
              />
            </Col>
          )}
          {metrics.totalOverdueHutang > 0 && (
            <Col xs={24} sm={12}>
              <MetricCard
                icon={AlertTriangle}
                label="Hutang Jatuh Tempo"
                value={formatCurrency(metrics.totalOverdueHutang)}
                color={{ bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d' }}
                sub="AP sudah lewat jatuh tempo"
              />
            </Col>
          )}
        </Row>
      )}

      {/* Monthly Revenue & Expense Trend Chart */}
      {trend.length > 0 && (
        <Card
          title={
            <span style={{ fontWeight: 600, color: '#1f2937' }}>
              Tren Penjualan &amp; Pembelian (6 Bulan)
            </span>
          }
          size="small"
        >
          <MonthlyTrendChart data={trend} />
        </Card>
      )}

      <Row gutter={[16, 16]}>
        {/* Recent Sales Invoices */}
        <Col xs={24} lg={12}>
          <Card>
            <SectionHeader title="Invoice Penjualan Terbaru" linkTo="/sales/invoices" linkLabel="Lihat semua" />
            {metrics.recentSales.length === 0 ? (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '16px 0' }}>
                Belum ada invoice.
              </Text>
            ) : (
              <table style={{ width: '100%', fontSize: 13 }}>
                <tbody>
                  {metrics.recentSales.map(inv => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 12px 8px 0' }}>
                        <Link to={`/sales/invoices/${inv.id}`} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {inv.invoice_number}
                        </Link>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{inv.customer?.name || '—'}</div>
                      </td>
                      <td style={{ padding: '8px 0', fontSize: 12, color: '#6b7280' }}>{formatDate(inv.date)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>
                        <div style={{ fontWeight: 500, color: '#111827' }}>{formatCurrency(inv.total)}</div>
                        <Tag color={STATUS_COLOR[inv.status] || 'default'} style={{ fontSize: 11 }}>{inv.status}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </Col>

        {/* Recent Payments */}
        <Col xs={24} lg={12}>
          <Card>
            <SectionHeader title="Pembayaran Terbaru" linkTo="/cash/payments" linkLabel="Lihat semua" />
            {metrics.recentPayments.length === 0 ? (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '16px 0' }}>
                Belum ada pembayaran.
              </Text>
            ) : (
              <table style={{ width: '100%', fontSize: 13 }}>
                <tbody>
                  {metrics.recentPayments.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 12px 8px 0' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151' }}>{p.payment_number}</span>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                          {p.type === 'incoming' ? p.customer?.name : p.supplier?.name || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '8px 0', fontSize: 12, color: '#6b7280' }}>{formatDate(p.date)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>
                        <Text type={p.type === 'incoming' ? 'success' : 'danger'} strong>
                          {p.type === 'incoming' ? '+' : '−'}{formatCurrency(p.amount)}
                        </Text>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Low Stock */}
        <Col xs={24} lg={12}>
          <Card>
            <SectionHeader title="Stok Menipis" linkTo="/inventory/stock" linkLabel="Lihat stok" />
            {metrics.lowStock.length === 0 ? (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '16px 0' }}>
                Tidak ada stok yang menipis.
              </Text>
            ) : (
              <table style={{ width: '100%', fontSize: 13 }}>
                <tbody>
                  {metrics.lowStock.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 12px 8px 0' }}>
                        <div style={{ fontWeight: 500, color: '#111827' }}>{s.product?.name || '—'}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>{s.product?.sku}</div>
                      </td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>
                        <Text type={s.qty_on_hand <= 0 ? 'danger' : 'warning'} strong>
                          {s.qty_on_hand}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>{s.product?.base_unit?.name}</Text>
                      </td>
                      <td style={{ padding: '8px 0 8px 8px' }}>
                        {s.qty_on_hand <= 0 ? (
                          <AlertTriangle size={14} color="#ef4444" />
                        ) : (
                          <Package size={14} color="#f97316" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </Col>

        {/* Cash & Bank Accounts */}
        <Col xs={24} lg={12}>
          <Card>
            <SectionHeader title="Saldo Kas & Bank" linkTo="/cash/accounts" linkLabel="Kelola akun" />
            {metrics.accounts.length === 0 ? (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '16px 0' }}>
                Belum ada akun kas/bank.
              </Text>
            ) : (
              <table style={{ width: '100%', fontSize: 13 }}>
                <tbody>
                  {metrics.accounts.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 12px 8px 0' }}>
                        <div style={{ fontWeight: 500, color: '#111827' }}>{a.name}</div>
                        <Text type="secondary" style={{ fontSize: 12, textTransform: 'capitalize' }}>{a.type}</Text>
                      </td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: '#111827' }}>
                        {formatCurrency(a.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  )
}
