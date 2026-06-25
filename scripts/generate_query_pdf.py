"""
Generate PDF: Panduan Query & Integrasi Excel untuk ERP Web Apps
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
import os

# ── Warna tema ─────────────────────────────────────────────────────────────
ORANGE      = HexColor('#EB6820')
DARK        = HexColor('#1a1a2e')
BLUE        = HexColor('#1565C0')
TEAL        = HexColor('#00796B')
LIGHT_GRAY  = HexColor('#F5F5F5')
MED_GRAY    = HexColor('#E0E0E0')
DARK_GRAY   = HexColor('#424242')
CODE_BG     = HexColor('#1E1E2E')
CODE_FG     = HexColor('#CDD6F4')
GREEN       = HexColor('#2E7D32')
YELLOW_BG   = HexColor('#FFF9C4')
BLUE_BG     = HexColor('#E3F2FD')
ORANGE_BG   = HexColor('#FFF3E0')

W, H = A4

def build_styles():
    base = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, **kw)

    return {
        'cover_title': S('cover_title',
            fontSize=28, textColor=white, fontName='Helvetica-Bold',
            alignment=TA_CENTER, leading=34, spaceAfter=8),
        'cover_sub': S('cover_sub',
            fontSize=13, textColor=HexColor('#FFD180'), fontName='Helvetica',
            alignment=TA_CENTER, leading=18),
        'cover_meta': S('cover_meta',
            fontSize=10, textColor=HexColor('#BDBDBD'), fontName='Helvetica',
            alignment=TA_CENTER, spaceAfter=4),

        'h1': S('h1', fontSize=18, textColor=ORANGE, fontName='Helvetica-Bold',
                spaceBefore=20, spaceAfter=6, leading=22),
        'h2': S('h2', fontSize=13, textColor=DARK, fontName='Helvetica-Bold',
                spaceBefore=14, spaceAfter=4, leading=17),
        'h3': S('h3', fontSize=11, textColor=BLUE, fontName='Helvetica-Bold',
                spaceBefore=10, spaceAfter=3, leading=14),
        'h4': S('h4', fontSize=10, textColor=TEAL, fontName='Helvetica-Bold',
                spaceBefore=8, spaceAfter=2, leading=13),

        'body': S('body', fontSize=9, textColor=DARK_GRAY, fontName='Helvetica',
                  leading=14, spaceAfter=4, alignment=TA_JUSTIFY),
        'bullet': S('bullet', fontSize=9, textColor=DARK_GRAY, fontName='Helvetica',
                    leading=13, leftIndent=14, spaceAfter=2,
                    bulletIndent=4, bulletText='•'),
        'note': S('note', fontSize=8.5, textColor=HexColor('#5D4037'),
                  fontName='Helvetica-Oblique', leading=12,
                  leftIndent=10, spaceAfter=4),

        'code': S('code', fontSize=7.8, textColor=CODE_FG, fontName='Courier',
                  leading=11.5, leftIndent=0, spaceAfter=0,
                  backColor=CODE_BG),
        'code_label': S('code_label', fontSize=8, textColor=white,
                        fontName='Helvetica-Bold', leading=10),

        'toc_item': S('toc_item', fontSize=10, textColor=BLUE,
                      fontName='Helvetica', leading=16, leftIndent=20),
        'toc_section': S('toc_section', fontSize=11, textColor=DARK,
                         fontName='Helvetica-Bold', leading=18),

        'table_h': S('table_h', fontSize=8, textColor=white,
                     fontName='Helvetica-Bold', alignment=TA_CENTER, leading=10),
        'table_c': S('table_c', fontSize=8, textColor=DARK_GRAY,
                     fontName='Helvetica', leading=10),
        'table_code': S('table_code', fontSize=7.5, textColor=BLUE,
                        fontName='Courier', leading=10),

        'page_num': S('page_num', fontSize=8, textColor=HexColor('#9E9E9E'),
                      fontName='Helvetica', alignment=TA_RIGHT),
    }


def code_block(lines, styles):
    """Buat code block dengan background gelap."""
    rows = [[Paragraph(line, styles['code'])] for line in lines]
    t = Table(rows, colWidths=[16.5*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), CODE_BG),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (0,0), 6),
        ('BOTTOMPADDING', (-1,-1), (-1,-1), 6),
        ('TOPPADDING', (0,1), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-2), 1),
        ('INNERGRID', (0,0), (-1,-1), 0, CODE_BG),
        ('BOX', (0,0), (-1,-1), 1, HexColor('#45475A')),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [CODE_BG]),
    ]))
    return t


def info_box(text, styles, bg=BLUE_BG, border=BLUE):
    """Kotak info berwarna."""
    p = Paragraph(text, ParagraphStyle('ib', parent=styles['body'],
                                        fontSize=8.5, leading=13))
    t = Table([[p]], colWidths=[16.5*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg),
        ('BOX', (0,0), (-1,-1), 1.5, border),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    return t


def section_header(title, styles, color=ORANGE):
    hr = HRFlowable(width='100%', thickness=2, color=color,
                    spaceAfter=4, spaceBefore=2)
    return [Paragraph(title, styles['h1']), hr]


def data_table(headers, rows, styles, col_widths=None):
    """Buat tabel data dengan styling profesional."""
    data = [[Paragraph(h, styles['table_h']) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), styles['table_c']) if not isinstance(c, str) or not c.startswith('`')
                     else Paragraph(c[1:-1], styles['table_code']) for c in row])

    n_cols = len(headers)
    if col_widths is None:
        col_widths = [16.5*cm / n_cols] * n_cols

    t = Table(data, colWidths=col_widths, repeatRows=1)
    row_colors = [LIGHT_GRAY, white]
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 8),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), row_colors),
        ('GRID', (0,0), (-1,-1), 0.3, MED_GRAY),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    return t


# ─── Cover Page ─────────────────────────────────────────────────────────────
def build_cover(story, styles):
    # Background banner (simulasi dengan tabel besar)
    banner_text = [
        [Paragraph('PANDUAN INTEGRASI DATA', styles['cover_title'])],
        [Paragraph('Web App → Microsoft Excel', styles['cover_sub'])],
        [Spacer(1, 10)],
        [Paragraph('ERP-ACC (Supabase/PostgreSQL) &amp; BUL-Accounting (Firebase/Firestore)', styles['cover_meta'])],
        [Paragraph('Query Reference &amp; Export Guide', styles['cover_meta'])],
        [Spacer(1, 6)],
        [Paragraph('Dibuat: 28 Mei 2026  ·  Versi 1.0', styles['cover_meta'])],
    ]
    banner = Table(banner_text, colWidths=[W - 4*cm])
    banner.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), DARK),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 20),
        ('RIGHTPADDING', (0,0), (-1,-1), 20),
        ('BOX', (0,0), (-1,-1), 3, ORANGE),
    ]))
    story.append(Spacer(1, 2*cm))
    story.append(banner)
    story.append(Spacer(1, 1.5*cm))

    # Ringkasan 2-kolom
    left = [
        [Paragraph('<b>BUL-Accounting</b>', ParagraphStyle('lh', fontSize=11,
            textColor=ORANGE, fontName='Helvetica-Bold'))],
        [Paragraph('Backend: Firebase Firestore<br/>Framework: React 18 + Tailwind<br/>'
                   'Export: xlsx (sudah tersedia)<br/>Koleksi: 9 koleksi aktif',
                   ParagraphStyle('lb', fontSize=9, textColor=DARK_GRAY,
                                  fontName='Helvetica', leading=14))],
    ]
    right = [
        [Paragraph('<b>ERP-ACC</b>', ParagraphStyle('rh', fontSize=11,
            textColor=BLUE, fontName='Helvetica-Bold'))],
        [Paragraph('Backend: Supabase (PostgreSQL)<br/>Framework: React 18 + Ant Design<br/>'
                   'Export: belum ada, perlu ditambahkan<br/>Tabel: 25+ tabel relasional',
                   ParagraphStyle('rb', fontSize=9, textColor=DARK_GRAY,
                                  fontName='Helvetica', leading=14))],
    ]
    lt = Table(left, colWidths=[7.5*cm])
    lt.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), ORANGE_BG),
        ('BOX', (0,0), (-1,-1), 1.5, ORANGE),
        ('TOPPADDING', (0,0), (-1,-1), 8), ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12), ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    rt = Table(right, colWidths=[7.5*cm])
    rt.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BLUE_BG),
        ('BOX', (0,0), (-1,-1), 1.5, BLUE),
        ('TOPPADDING', (0,0), (-1,-1), 8), ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12), ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    combined = Table([[lt, rt]], colWidths=[8.25*cm, 8.25*cm])
    combined.setStyle(TableStyle([
        ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
    ]))
    story.append(combined)
    story.append(PageBreak())


# ─── Daftar Isi ─────────────────────────────────────────────────────────────
def build_toc(story, styles):
    story.append(Paragraph('DAFTAR ISI', styles['h1']))
    story.append(HRFlowable(width='100%', thickness=2, color=ORANGE, spaceAfter=10))

    toc_items = [
        ('1', 'Analisa Kemungkinan Integrasi Excel', '3'),
        ('', '  1.1 BUL-Accounting — Status Export Saat Ini', '3'),
        ('', '  1.2 ERP-ACC — Status Export Saat Ini', '3'),
        ('', '  1.3 Arsitektur Integrasi yang Direkomendasikan', '4'),
        ('2', 'BUL-Accounting — Koleksi Firestore', '5'),
        ('', '  2.1 Daftar Koleksi & Struktur Field', '5'),
        ('', '  2.2 Firestore JavaScript Queries', '6'),
        ('', '  2.3 Kode Export Excel (siap pakai)', '8'),
        ('3', 'ERP-ACC — Tabel Supabase (PostgreSQL)', '10'),
        ('', '  3.1 Peta Relasi Tabel', '10'),
        ('', '  3.2 SQL Queries untuk Export Excel', '11'),
        ('', '  3.3 Supabase JS Client Queries', '16'),
        ('', '  3.4 Kode Export Excel untuk ERP-ACC', '19'),
        ('4', 'Template Script Export All-in-One', '21'),
        ('', '  4.1 Node.js Script — Export Semua Data', '21'),
        ('', '  4.2 Cara Menjalankan', '22'),
        ('5', 'Catatan Keamanan & Best Practice', '23'),
    ]

    for num, title, page in toc_items:
        if num:
            p = Paragraph(f'<b>{num}. {title}</b>', styles['toc_section'])
        else:
            p = Paragraph(title, styles['toc_item'])
        # Simulasi dot leader dengan spacer
        row_data = [[p, Paragraph(f'<b>{page}</b>',
                        ParagraphStyle('pn', fontSize=10, textColor=DARK_GRAY,
                                       fontName='Helvetica', alignment=TA_RIGHT))]]
        t = Table(row_data, colWidths=[14*cm, 2.5*cm])
        t.setStyle(TableStyle([
            ('LINEBELOW', (0,0), (0,0), 0.3, MED_GRAY),
            ('TOPPADDING', (0,0), (-1,-1), 3),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]))
        story.append(t)

    story.append(PageBreak())


# ─── BAB 1: Analisa ─────────────────────────────────────────────────────────
def build_chapter1(story, styles):
    for e in section_header('1. Analisa Kemungkinan Integrasi Excel', styles):
        story.append(e)

    story.append(Paragraph(
        'Dokumen ini menganalisa dua web app yang berjalan dalam satu repositori: '
        '<b>BUL-Accounting</b> (Firebase/Firestore) dan <b>ERP-ACC</b> (Supabase/PostgreSQL). '
        'Keduanya dapat dihubungkan ke Microsoft Excel melalui pendekatan yang berbeda '
        'sesuai dengan backend masing-masing.',
        styles['body']))

    # 1.1
    story.append(Paragraph('1.1 BUL-Accounting — Status Export Saat Ini', styles['h2']))
    story.append(info_box(
        '<b>Status:</b> Export Excel SUDAH ADA. Library <b>xlsx</b> sudah dipasang dan '
        'digunakan di <i>src/utils/exportUtils.js</i>. Tersedia: export jurnal, neraca, '
        'dan laporan laba rugi ke format .xlsx.',
        styles, bg=YELLOW_BG, border=HexColor('#F9A825')))
    story.append(Spacer(1, 6))

    story.append(Paragraph('Yang <b>sudah tersedia</b> di exportUtils.js:', styles['h4']))
    existing = [
        ['Fungsi', 'Output File', 'Konten'],
        ['exportJournalsToExcel()', 'Jurnal_Umum.xlsx', 'Tanggal, No.Jurnal, Keterangan, Debit, Kredit'],
        ['exportNeracaToExcel()', 'Neraca_[tanggal].xlsx', 'Neraca posisi keuangan (Aset, Kewajiban, Ekuitas)'],
        ['exportLabaRugiToExcel()', 'LabaRugi_[periode].xlsx', 'Laba Rugi lengkap dengan subtotal'],
        ['exportToExcel()', '[custom].xlsx', 'Generic — bisa dipakai untuk data apapun'],
        ['exportToPDF()', '[custom].pdf', 'Export tabel generik ke PDF'],
    ]
    story.append(data_table(existing[0], existing[1:], styles,
                            col_widths=[5.5*cm, 4.5*cm, 6.5*cm]))

    story.append(Paragraph('Yang <b>belum tersedia</b> dan perlu ditambahkan:', styles['h4']))
    for item in [
        'Export data Penjualan (invoices) ke Excel',
        'Export data Kas/Bank (kas_bank) ke Excel',
        'Export data Biaya (biaya) ke Excel',
        'Export data Armada (armada) ke Excel',
        'Export data Aset (assets) ke Excel',
        'Export data Pelanggan & Supplier ke Excel',
    ]:
        story.append(Paragraph(item, styles['bullet']))

    # 1.2
    story.append(Paragraph('1.2 ERP-ACC — Status Export Saat Ini', styles['h2']))
    story.append(info_box(
        '<b>Status:</b> Export Excel BELUM ADA. ERP-ACC menggunakan Supabase (PostgreSQL) '
        'dengan 25+ tabel relasional. Perlu ditambahkan library xlsx dan fungsi export '
        'untuk setiap modul.',
        styles, bg=HexColor('#FFEBEE'), border=HexColor('#C62828')))

    story.append(Spacer(1, 6))
    story.append(Paragraph('Modul ERP-ACC yang memerlukan export Excel:', styles['h4']))
    modules = [
        ['Modul', 'Tabel Utama', 'Prioritas'],
        ['Sales Orders & GD', 'sales_orders, goods_deliveries', 'Tinggi'],
        ['Sales Invoices', 'invoices (type=sales)', 'Tinggi'],
        ['Purchase Orders & GR', 'purchase_orders, goods_receipts', 'Tinggi'],
        ['Purchase Invoices', 'invoices (type=purchase)', 'Tinggi'],
        ['Pembayaran (Cash/Bank)', 'payments, accounts', 'Tinggi'],
        ['Jurnal Akuntansi', 'journals, journal_items, coa', 'Sedang'],
        ['Laporan (Neraca, L/R)', 'coa, journal_items', 'Sedang'],
        ['Stok & Kartu Stok', 'inventory_stock, inventory_movements', 'Sedang'],
        ['Aset Tetap', 'assets, asset_categories', 'Rendah'],
        ['Sales & Purchase Returns', 'sales_returns, purchase_returns', 'Rendah'],
    ]
    story.append(data_table(modules[0], modules[1:], styles,
                            col_widths=[4.5*cm, 7.5*cm, 2.5*cm]))

    # 1.3
    story.append(Paragraph('1.3 Arsitektur Integrasi yang Direkomendasikan', styles['h2']))
    arch = [
        ['Pendekatan', 'Cocok Untuk', 'Pro', 'Kontra'],
        ['In-App Button Export\n(xlsx di browser)',
         'Kedua app',
         'Tidak perlu server,\nlangsung dari UI',
         'Terbatas filter,\ndata real-time'],
        ['Supabase REST API\n+ Power Query Excel',
         'ERP-ACC',
         'Excel bisa refresh\notomatis, no-code',
         'Perlu koneksi internet,\nperlu API key'],
        ['Node.js Script\n(export semua data)',
         'Kedua app',
         'Bisa dijadwalkan,\nexport lengkap',
         'Perlu akses server,\nsetup sekali'],
        ['Google Sheets\n(via Firestore SDK)',
         'BUL-Accounting',
         'Real-time sync,\nbisa dibagikan',
         'Perlu Apps Script,\nsetup lebih kompleks'],
    ]
    story.append(data_table(arch[0], arch[1:], styles,
                            col_widths=[4*cm, 4*cm, 4.5*cm, 4*cm]))

    story.append(Spacer(1, 6))
    story.append(info_box(
        '<b>Rekomendasi:</b> Untuk solusi paling cepat, tambahkan tombol "Export Excel" '
        'di setiap halaman daftar menggunakan library <b>xlsx</b> (sudah dipasang di '
        'bul-accounting, perlu install di erp-acc). Untuk ERP-ACC, Supabase Power Query '
        'adalah opsi terbaik untuk koneksi langsung ke Excel.',
        styles, bg=BLUE_BG, border=BLUE))

    story.append(PageBreak())


# ─── BAB 2: BUL-Accounting ──────────────────────────────────────────────────
def build_chapter2(story, styles):
    for e in section_header('2. BUL-Accounting — Koleksi Firestore', styles, color=ORANGE):
        story.append(e)

    # 2.1 Struktur koleksi
    story.append(Paragraph('2.1 Daftar Koleksi & Struktur Field', styles['h2']))

    collections = [
        {
            'name': 'journals',
            'desc': 'Jurnal umum double-entry. Ini adalah sumber utama semua data akuntansi.',
            'fields': [
                ['Field', 'Tipe', 'Keterangan'],
                ['id', 'string', 'Auto-generated Firestore document ID'],
                ['date', 'string (ISO)', 'Tanggal jurnal, mis. "2026-01-15"'],
                ['description', 'string', 'Keterangan/deskripsi jurnal'],
                ['type', 'string', 'Jenis: penjualan, biaya, kas, dll.'],
                ['truckId', 'string|null', 'ID armada/truck terkait'],
                ['status', 'string', '"posted" | "deleted"'],
                ['totalDebit', 'number', 'Total debit (harus = totalCredit)'],
                ['totalCredit', 'number', 'Total kredit'],
                ['lines', 'array', '[{accountCode, debit, credit, description}]'],
                ['createdAt', 'string (ISO)', 'Timestamp dibuat'],
                ['createdBy', 'string', 'UID user yang membuat'],
            ]
        },
        {
            'name': 'invoices',
            'desc': 'Faktur penjualan ke pelanggan.',
            'fields': [
                ['Field', 'Tipe', 'Keterangan'],
                ['id', 'string', 'Auto-generated Firestore document ID'],
                ['date', 'string (ISO)', 'Tanggal faktur'],
                ['invoiceNo', 'string', 'Nomor faktur'],
                ['customerId', 'string', 'ID pelanggan'],
                ['customerName', 'string', 'Nama pelanggan (denormalized)'],
                ['truckId', 'string|null', 'ID armada terkait'],
                ['amount', 'number', 'Jumlah tagihan'],
                ['status', 'string', '"draft"|"unpaid"|"partial"|"paid"|"cancelled"'],
                ['description', 'string', 'Keterangan'],
            ]
        },
        {
            'name': 'customers (pelanggan)',
            'desc': 'Master data pelanggan.',
            'fields': [
                ['Field', 'Tipe', 'Keterangan'],
                ['id', 'string', 'Auto-generated Firestore document ID'],
                ['name', 'string', 'Nama pelanggan'],
                ['address', 'string', 'Alamat'],
                ['phone', 'string', 'Nomor telepon'],
                ['email', 'string', 'Email'],
                ['isActive', 'boolean', 'Status aktif (soft-delete)'],
            ]
        },
        {
            'name': 'kas_bank',
            'desc': 'Transaksi kas dan bank.',
            'fields': [
                ['Field', 'Tipe', 'Keterangan'],
                ['id', 'string', 'Auto-generated Firestore document ID'],
                ['date', 'string (ISO)', 'Tanggal transaksi'],
                ['type', 'string', '"masuk" | "keluar"'],
                ['amount', 'number', 'Jumlah'],
                ['accountCode', 'string', 'Kode akun kas/bank'],
                ['description', 'string', 'Keterangan'],
                ['category', 'string', 'Kategori transaksi'],
            ]
        },
        {
            'name': 'biaya',
            'desc': 'Catatan beban/biaya operasional.',
            'fields': [
                ['Field', 'Tipe', 'Keterangan'],
                ['id', 'string', 'Auto-generated Firestore document ID'],
                ['date', 'string (ISO)', 'Tanggal biaya'],
                ['description', 'string', 'Keterangan biaya'],
                ['amount', 'number', 'Jumlah biaya'],
                ['accountCode', 'string', 'Kode akun biaya'],
                ['truckId', 'string|null', 'ID armada (opsional)'],
            ]
        },
        {
            'name': 'armada',
            'desc': 'Master data armada/truck.',
            'fields': [
                ['Field', 'Tipe', 'Keterangan'],
                ['id', 'string', 'Auto-generated Firestore document ID'],
                ['plateNumber', 'string', 'Nomor polisi'],
                ['type', 'string', 'Jenis armada'],
                ['isActive', 'boolean', 'Status aktif'],
            ]
        },
        {
            'name': 'assets',
            'desc': 'Aset tetap perusahaan.',
            'fields': [
                ['Field', 'Tipe', 'Keterangan'],
                ['id', 'string', 'Auto-generated Firestore document ID'],
                ['name', 'string', 'Nama aset'],
                ['acquisitionDate', 'string', 'Tanggal perolehan'],
                ['acquisitionCost', 'number', 'Harga perolehan'],
                ['usefulLife', 'number', 'Masa manfaat (bulan)'],
                ['accumulatedDepreciation', 'number', 'Akumulasi penyusutan'],
            ]
        },
        {
            'name': 'audit_log',
            'desc': 'Log audit setiap perubahan jurnal.',
            'fields': [
                ['Field', 'Tipe', 'Keterangan'],
                ['journalId', 'string', 'ID jurnal terkait'],
                ['action', 'string', '"create"|"update"|"delete"'],
                ['by', 'string', 'User yang melakukan aksi'],
                ['at', 'string (ISO)', 'Timestamp aksi'],
            ]
        },
    ]

    for col in collections:
        story.append(KeepTogether([
            Paragraph(f'Koleksi: <font color="#EB6820"><b>{col["name"]}</b></font>',
                      styles['h3']),
            Paragraph(col['desc'], styles['note']),
            data_table(col['fields'][0], col['fields'][1:], styles,
                       col_widths=[4*cm, 3.5*cm, 9*cm]),
            Spacer(1, 8),
        ]))

    story.append(PageBreak())

    # 2.2 Firestore Queries
    story.append(Paragraph('2.2 Firestore JavaScript Queries', styles['h2']))
    story.append(Paragraph(
        'Query-query berikut dapat digunakan langsung di JavaScript/Node.js untuk '
        'mengambil data dari Firestore. Import yang diperlukan:',
        styles['body']))

    story.append(code_block([
        "import { db } from '../firebase'",
        "import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'",
    ], styles))
    story.append(Spacer(1, 8))

    queries = [
        {
            'title': 'Q-BUL-01: Semua Jurnal yang Diposting',
            'desc': 'Ambil semua jurnal dengan status posted, diurutkan by tanggal.',
            'code': [
                "// Q-BUL-01: Semua Jurnal Posted",
                "async function getAllJournals() {",
                "  const q = query(",
                "    collection(db, 'journals'),",
                "    where('status', '==', 'posted'),",
                "    orderBy('date', 'desc')",
                "  )",
                "  const snap = await getDocs(q)",
                "  return snap.docs.map(d => ({ id: d.id, ...d.data() }))",
                "}",
            ]
        },
        {
            'title': 'Q-BUL-02: Jurnal per Periode',
            'desc': 'Filter jurnal berdasarkan rentang tanggal (client-side filtering untuk Firestore free tier).',
            'code': [
                "// Q-BUL-02: Jurnal per Periode",
                "async function getJournalsByPeriod(startDate, endDate) {",
                "  const snap = await getDocs(query(",
                "    collection(db, 'journals'),",
                "    where('status', '==', 'posted')",
                "  ))",
                "  return snap.docs",
                "    .map(d => ({ id: d.id, ...d.data() }))",
                "    .filter(j => j.date >= startDate && j.date <= endDate)",
                "    .sort((a, b) => a.date.localeCompare(b.date))",
                "}",
            ]
        },
        {
            'title': 'Q-BUL-03: Jurnal per Truck/Armada',
            'desc': 'Filter jurnal untuk armada tertentu (useful untuk laporan per truck).',
            'code': [
                "// Q-BUL-03: Jurnal per Armada",
                "async function getJournalsByTruck(truckId) {",
                "  const q = query(",
                "    collection(db, 'journals'),",
                "    where('status', '==', 'posted'),",
                "    where('truckId', '==', truckId)",
                "  )",
                "  const snap = await getDocs(q)",
                "  return snap.docs.map(d => ({ id: d.id, ...d.data() }))",
                "}",
            ]
        },
        {
            'title': 'Q-BUL-04: Semua Invoice/Penjualan',
            'desc': 'Ambil semua faktur penjualan aktif.',
            'code': [
                "// Q-BUL-04: Semua Invoice Penjualan",
                "async function getAllInvoices() {",
                "  const q = query(",
                "    collection(db, 'invoices'),",
                "    orderBy('date', 'desc')",
                "  )",
                "  const snap = await getDocs(q)",
                "  return snap.docs.map(d => ({ id: d.id, ...d.data() }))",
                "}",
            ]
        },
        {
            'title': 'Q-BUL-05: Invoice Belum Lunas (Outstanding AR)',
            'desc': 'Filter invoice yang masih outstanding (unpaid atau partial).',
            'code': [
                "// Q-BUL-05: Invoice Belum Lunas",
                "async function getOutstandingInvoices() {",
                "  const snap = await getDocs(query(",
                "    collection(db, 'invoices')",
                "  ))",
                "  return snap.docs",
                "    .map(d => ({ id: d.id, ...d.data() }))",
                "    .filter(inv => ['unpaid', 'partial'].includes(inv.status))",
                "    .sort((a, b) => a.date.localeCompare(b.date))",
                "}",
            ]
        },
        {
            'title': 'Q-BUL-06: Data Rekap Akun (Saldo per Akun)',
            'desc': 'Hitung saldo setiap akun dari semua jurnal — digunakan untuk neraca & laba rugi.',
            'code': [
                "// Q-BUL-06: Rekap Saldo per Akun",
                "async function getAccountBalances(endDate) {",
                "  const journals = await getJournalsByPeriod('1900-01-01', endDate)",
                "  const balances = {}",
                "  journals.forEach(j => {",
                "    j.lines?.forEach(line => {",
                "      if (!balances[line.accountCode])",
                "        balances[line.accountCode] = { debit: 0, credit: 0 }",
                "      balances[line.accountCode].debit += (line.debit || 0)",
                "      balances[line.accountCode].credit += (line.credit || 0)",
                "    })",
                "  })",
                "  return balances  // { '1111': { debit: X, credit: Y }, ... }",
                "}",
            ]
        },
        {
            'title': 'Q-BUL-07: Semua Data Kas/Bank',
            'desc': 'Ambil transaksi kas dan bank.',
            'code': [
                "// Q-BUL-07: Transaksi Kas/Bank",
                "async function getKasBank(startDate, endDate) {",
                "  const snap = await getDocs(query(",
                "    collection(db, 'kas_bank'),",
                "    orderBy('date', 'desc')",
                "  ))",
                "  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }))",
                "  if (startDate) results = results.filter(r => r.date >= startDate)",
                "  if (endDate)   results = results.filter(r => r.date <= endDate)",
                "  return results",
                "}",
            ]
        },
        {
            'title': 'Q-BUL-08: Semua Data Biaya',
            'desc': 'Ambil semua biaya operasional.',
            'code': [
                "// Q-BUL-08: Data Biaya",
                "async function getAllBiaya(startDate, endDate) {",
                "  const snap = await getDocs(collection(db, 'biaya'))",
                "  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }))",
                "  if (startDate) results = results.filter(r => r.date >= startDate)",
                "  if (endDate)   results = results.filter(r => r.date <= endDate)",
                "  return results.sort((a,b) => a.date.localeCompare(b.date))",
                "}",
            ]
        },
    ]

    for q in queries:
        story.append(KeepTogether([
            Paragraph(f'<b>{q["title"]}</b>', styles['h4']),
            Paragraph(q['desc'], styles['note']),
            code_block(q['code'], styles),
            Spacer(1, 8),
        ]))

    story.append(PageBreak())

    # 2.3 Kode Export Excel
    story.append(Paragraph('2.3 Kode Export Excel — BUL-Accounting (Siap Pakai)', styles['h2']))
    story.append(info_box(
        'Fungsi-fungsi di bawah dapat langsung ditambahkan ke <i>src/utils/exportUtils.js</i>. '
        'Library <b>xlsx</b> sudah tersedia. Cukup import dan panggil dari komponen yang sesuai.',
        styles))
    story.append(Spacer(1, 6))

    export_codes = [
        {
            'title': 'Export Penjualan (Invoice) ke Excel',
            'code': [
                "// Tambahkan ke exportUtils.js",
                "export function exportPenjualanToExcel(invoices, filename = 'Penjualan') {",
                "  const rows = invoices.map(inv => ({",
                "    'Tanggal':       inv.date,",
                "    'No. Invoice':   inv.invoiceNo || '-',",
                "    'Pelanggan':     inv.customerName || inv.customerId,",
                "    'Armada':        inv.truckId || '-',",
                "    'Jumlah':        inv.amount || 0,",
                "    'Status':        inv.status,",
                "    'Keterangan':    inv.description || '',",
                "  }))",
                "  const ws = XLSX.utils.json_to_sheet(rows)",
                "  ws['!cols'] = [",
                "    {wch:12},{wch:16},{wch:25},{wch:15},{wch:18},{wch:12},{wch:30}",
                "  ]",
                "  const wb = XLSX.utils.book_new()",
                "  XLSX.utils.book_append_sheet(wb, ws, 'Penjualan')",
                "  XLSX.writeFile(wb, `${filename}.xlsx`)",
                "}",
            ]
        },
        {
            'title': 'Export Jurnal Lengkap dengan Detail Lines',
            'code': [
                "export function exportJurnalDetailToExcel(journals, filename = 'Jurnal_Detail') {",
                "  const rows = []",
                "  journals.forEach((j, idx) => {",
                "    j.lines?.forEach((line, li) => {",
                "      rows.push({",
                "        'No':          li === 0 ? idx + 1 : '',",
                "        'Tanggal':     li === 0 ? j.date : '',",
                "        'No.Jurnal':   li === 0 ? j.id.slice(0,8).toUpperCase() : '',",
                "        'Keterangan':  li === 0 ? j.description : '',",
                "        'Tipe':        li === 0 ? (j.type || '-') : '',",
                "        'Armada':      li === 0 ? (j.truckId || '-') : '',",
                "        'Kode Akun':   line.accountCode,",
                "        'Debit':       line.debit || 0,",
                "        'Kredit':      line.credit || 0,",
                "        'Ket. Baris':  line.description || '',",
                "      })",
                "    })",
                "    rows.push({}) // separator",
                "  })",
                "  const ws = XLSX.utils.json_to_sheet(rows)",
                "  ws['!cols'] = [",
                "    {wch:4},{wch:12},{wch:12},{wch:35},{wch:14},",
                "    {wch:14},{wch:12},{wch:18},{wch:18},{wch:25}",
                "  ]",
                "  const wb = XLSX.utils.book_new()",
                "  XLSX.utils.book_append_sheet(wb, ws, 'Jurnal')",
                "  XLSX.writeFile(wb, `${filename}.xlsx`)",
                "}",
            ]
        },
        {
            'title': 'Export Semua Koleksi Sekaligus (Multi-Sheet)',
            'code': [
                "export async function exportAllDataToExcel(db, filename = 'BUL_All_Data') {",
                "  const wb = XLSX.utils.book_new()",
                "  // Sheet 1: Jurnal",
                "  const journals = await getAllJournals(db)",
                "  const jRows = []",
                "  journals.forEach(j => j.lines?.forEach(line => jRows.push({",
                "    Tanggal: j.date, Jurnal: j.id.slice(0,8),",
                "    Keterangan: j.description, Akun: line.accountCode,",
                "    Debit: line.debit || 0, Kredit: line.credit || 0",
                "  })))",
                "  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jRows), 'Jurnal')",
                "  // Sheet 2: Penjualan",
                "  const invoices = await getAllInvoices(db)",
                "  const iRows = invoices.map(inv => ({",
                "    Tanggal: inv.date, Invoice: inv.invoiceNo,",
                "    Pelanggan: inv.customerName, Jumlah: inv.amount, Status: inv.status",
                "  }))",
                "  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(iRows), 'Penjualan')",
                "  XLSX.writeFile(wb, `${filename}.xlsx`)",
                "}",
            ]
        },
    ]

    for ec in export_codes:
        story.append(KeepTogether([
            Paragraph(f'<b>{ec["title"]}</b>', styles['h4']),
            code_block(ec['code'], styles),
            Spacer(1, 8),
        ]))

    story.append(PageBreak())


# ─── BAB 3: ERP-ACC ─────────────────────────────────────────────────────────
def build_chapter3(story, styles):
    for e in section_header('3. ERP-ACC — Tabel Supabase (PostgreSQL)', styles, color=BLUE):
        story.append(e)

    # 3.1 Peta relasi
    story.append(Paragraph('3.1 Peta Relasi Tabel Utama', styles['h2']))
    rel_data = [
        ['Tabel', 'Relasi Utama', 'Deskripsi'],
        ['customers', '→ invoices, sales_orders, payments', 'Master data pelanggan'],
        ['suppliers', '→ invoices, purchase_orders, payments', 'Master data supplier'],
        ['products', '→ sales/purchase_order_items, inventory_stock', 'Master produk/barang'],
        ['units', '→ products, order_items', 'Satuan ukuran (kg, ton, m3, dll.)'],
        ['coa', '→ journal_items', 'Chart of Accounts (akun buku besar)'],
        ['tax_codes', '→ products, invoices', 'Kode pajak (PPN, PPh, dll.)'],
        ['payment_terms', '→ sales_orders, purchase_orders', 'Termin pembayaran'],
        ['warehouses', '→ orders, goods_docs, stock', 'Gudang/lokasi stok'],
        ['sales_orders', '→ goods_deliveries, invoices', 'Order penjualan'],
        ['sales_order_items', '← sales_orders', 'Line item SO'],
        ['goods_deliveries', '→ invoices (linked)', 'Surat jalan pengiriman'],
        ['goods_delivery_items', '← goods_deliveries', 'Line item GD'],
        ['purchase_orders', '→ goods_receipts, invoices', 'Order pembelian'],
        ['purchase_order_items', '← purchase_orders', 'Line item PO'],
        ['goods_receipts', '→ invoices (linked)', 'Penerimaan barang'],
        ['goods_receipt_items', '← goods_receipts', 'Line item GR'],
        ['invoices', '→ payments, journals', 'Faktur (sales & purchase)'],
        ['invoice_items', '← invoices', 'Line item faktur'],
        ['payments', '→ journals, accounts', 'Pembayaran AR/AP'],
        ['journals', '→ journal_items', 'Header jurnal akuntansi'],
        ['journal_items', '← journals, coa', 'Baris debit/kredit jurnal'],
        ['accounts', '→ payments, transfers', 'Rekening kas & bank'],
        ['assets', '→ asset_categories, journals', 'Aset tetap'],
        ['asset_categories', '→ assets', 'Kategori aset tetap'],
        ['inventory_stock', '← products, warehouses', 'Saldo stok per produk'],
        ['inventory_movements', '← products, orders', 'Mutasi stok'],
        ['sales_returns', '→ sales_orders', 'Return penjualan'],
        ['sales_return_items', '← sales_returns', 'Line item return penjualan'],
        ['purchase_returns', '→ purchase_orders', 'Return pembelian'],
        ['purchase_return_items', '← purchase_returns', 'Line item return pembelian'],
    ]
    story.append(data_table(rel_data[0], rel_data[1:], styles,
                            col_widths=[4.5*cm, 7*cm, 5*cm]))
    story.append(PageBreak())

    # 3.2 SQL Queries
    story.append(Paragraph('3.2 SQL Queries untuk Export Excel', styles['h2']))
    story.append(Paragraph(
        'Query berikut dijalankan langsung di Supabase SQL Editor '
        '(Database → SQL Editor) atau melalui PostgreSQL client. '
        'Ganti <i>[YYYY-MM-DD]</i> dengan tanggal yang diinginkan.',
        styles['body']))
    story.append(Spacer(1, 6))

    sql_queries = [
        {
            'id': 'Q-ERP-01',
            'title': 'Export Sales Orders Lengkap',
            'desc': 'Semua Sales Order dengan nama pelanggan, status, nilai, dan payment term.',
            'code': [
                "-- Q-ERP-01: Export Sales Orders",
                "SELECT",
                "  so.id,",
                "  so.so_number        AS \"No SO\",",
                "  so.date             AS \"Tanggal\",",
                "  c.name              AS \"Pelanggan\",",
                "  pt.name             AS \"Termin Bayar\",",
                "  w.name              AS \"Gudang\",",
                "  so.subtotal,",
                "  so.tax_amount       AS \"PPN\",",
                "  so.total            AS \"Total\",",
                "  so.status,",
                "  so.notes            AS \"Catatan\",",
                "  so.created_at",
                "FROM sales_orders so",
                "LEFT JOIN customers  c  ON c.id  = so.customer_id",
                "LEFT JOIN payment_terms pt ON pt.id = so.payment_term_id",
                "LEFT JOIN warehouses  w  ON w.id  = so.warehouse_id",
                "ORDER BY so.date DESC, so.created_at DESC;",
            ]
        },
        {
            'id': 'Q-ERP-02',
            'title': 'Export Sales Orders + Item Lines (Detail)',
            'desc': 'Detail baris per produk dari setiap Sales Order.',
            'code': [
                "-- Q-ERP-02: Sales Orders dengan Item Detail",
                "SELECT",
                "  so.so_number        AS \"No SO\",",
                "  so.date             AS \"Tanggal SO\",",
                "  c.name              AS \"Pelanggan\",",
                "  so.status           AS \"Status SO\",",
                "  p.sku               AS \"SKU\",",
                "  p.name              AS \"Produk\",",
                "  u.name              AS \"Satuan\",",
                "  soi.quantity        AS \"Qty\",",
                "  soi.unit_price      AS \"Harga\",",
                "  soi.tax_amount      AS \"Pajak\",",
                "  soi.total           AS \"Subtotal Baris\"",
                "FROM sales_orders so",
                "JOIN sales_order_items soi ON soi.sales_order_id = so.id",
                "JOIN customers c  ON c.id  = so.customer_id",
                "JOIN products  p  ON p.id  = soi.product_id",
                "JOIN units     u  ON u.id  = soi.unit_id",
                "ORDER BY so.date DESC, so.so_number, p.name;",
            ]
        },
        {
            'id': 'Q-ERP-03',
            'title': 'Export Sales Invoices (Faktur Penjualan)',
            'desc': 'Semua faktur penjualan beserta status pembayaran dan sisa tagihan.',
            'code': [
                "-- Q-ERP-03: Sales Invoices",
                "SELECT",
                "  inv.invoice_number  AS \"No Faktur\",",
                "  inv.date            AS \"Tanggal\",",
                "  inv.due_date        AS \"Jatuh Tempo\",",
                "  c.name              AS \"Pelanggan\",",
                "  so.so_number        AS \"Ref SO\",",
                "  inv.subtotal,",
                "  inv.tax_amount      AS \"PPN\",",
                "  inv.total           AS \"Total\",",
                "  inv.amount_paid     AS \"Sudah Dibayar\",",
                "  (inv.total - inv.amount_paid) AS \"Sisa Tagihan\",",
                "  inv.status,",
                "  CASE",
                "    WHEN inv.due_date < CURRENT_DATE",
                "     AND inv.status NOT IN ('paid','cancelled')",
                "    THEN 'JATUH TEMPO'",
                "    ELSE '-'",
                "  END AS \"Overdue\"",
                "FROM invoices inv",
                "JOIN customers c ON c.id = inv.customer_id",
                "LEFT JOIN sales_orders so ON so.id = inv.sales_order_id",
                "WHERE inv.type = 'sales'",
                "ORDER BY inv.date DESC;",
            ]
        },
        {
            'id': 'Q-ERP-04',
            'title': 'Export Purchase Orders',
            'desc': 'Semua Purchase Order dengan supplier dan nilai.',
            'code': [
                "-- Q-ERP-04: Purchase Orders",
                "SELECT",
                "  po.po_number        AS \"No PO\",",
                "  po.date             AS \"Tanggal\",",
                "  s.name              AS \"Supplier\",",
                "  pt.name             AS \"Termin Bayar\",",
                "  w.name              AS \"Gudang\",",
                "  po.subtotal,",
                "  po.tax_amount       AS \"PPN\",",
                "  po.total            AS \"Total\",",
                "  po.status,",
                "  po.notes            AS \"Catatan\"",
                "FROM purchase_orders po",
                "LEFT JOIN suppliers     s  ON s.id  = po.supplier_id",
                "LEFT JOIN payment_terms pt ON pt.id = po.payment_term_id",
                "LEFT JOIN warehouses    w  ON w.id  = po.warehouse_id",
                "ORDER BY po.date DESC;",
            ]
        },
        {
            'id': 'Q-ERP-05',
            'title': 'Export Purchase Invoices (Hutang Usaha)',
            'desc': 'Faktur pembelian dengan status dan sisa hutang ke supplier.',
            'code': [
                "-- Q-ERP-05: Purchase Invoices / Hutang Usaha",
                "SELECT",
                "  inv.invoice_number  AS \"No Faktur\",",
                "  inv.date            AS \"Tanggal\",",
                "  inv.due_date        AS \"Jatuh Tempo\",",
                "  s.name              AS \"Supplier\",",
                "  po.po_number        AS \"Ref PO\",",
                "  inv.total           AS \"Total\",",
                "  inv.amount_paid     AS \"Sudah Dibayar\",",
                "  (inv.total - inv.amount_paid) AS \"Sisa Hutang\",",
                "  inv.status,",
                "  CASE",
                "    WHEN inv.due_date < CURRENT_DATE",
                "     AND inv.status NOT IN ('paid','cancelled')",
                "    THEN 'JATUH TEMPO'",
                "    ELSE '-'",
                "  END AS \"Overdue\"",
                "FROM invoices inv",
                "JOIN suppliers s ON s.id = inv.supplier_id",
                "LEFT JOIN purchase_orders po ON po.id = inv.purchase_order_id",
                "WHERE inv.type = 'purchase'",
                "ORDER BY inv.date DESC;",
            ]
        },
        {
            'id': 'Q-ERP-06',
            'title': 'Export Pembayaran (Penerimaan & Pengeluaran)',
            'desc': 'Semua transaksi pembayaran melalui kas/bank.',
            'code': [
                "-- Q-ERP-06: Semua Pembayaran",
                "SELECT",
                "  p.date              AS \"Tanggal\",",
                "  p.type              AS \"Tipe\",",
                "  COALESCE(c.name, s.name) AS \"Pihak\",",
                "  acc.name            AS \"Rekening\",",
                "  inv.invoice_number  AS \"Ref Faktur\",",
                "  p.amount            AS \"Jumlah\",",
                "  p.notes             AS \"Catatan\",",
                "  p.created_at        AS \"Dibuat Pada\"",
                "FROM payments p",
                "LEFT JOIN customers c   ON c.id   = p.customer_id",
                "LEFT JOIN suppliers s   ON s.id   = p.supplier_id",
                "LEFT JOIN accounts  acc ON acc.id = p.account_id",
                "LEFT JOIN invoices  inv ON inv.id  = p.invoice_id",
                "ORDER BY p.date DESC;",
            ]
        },
        {
            'id': 'Q-ERP-07',
            'title': 'Export Jurnal Akuntansi Lengkap',
            'desc': 'Semua jurnal dengan baris debit/kredit dan kode akun COA.',
            'code': [
                "-- Q-ERP-07: Jurnal Akuntansi Detail",
                "SELECT",
                "  j.journal_number    AS \"No Jurnal\",",
                "  j.date              AS \"Tanggal\",",
                "  j.source            AS \"Sumber\",",
                "  j.description       AS \"Keterangan\",",
                "  j.is_posted         AS \"Diposting\",",
                "  coa.code            AS \"Kode Akun\",",
                "  coa.name            AS \"Nama Akun\",",
                "  ji.debit,",
                "  ji.credit,",
                "  ji.description      AS \"Ket. Baris\"",
                "FROM journals j",
                "JOIN journal_items ji ON ji.journal_id = j.id",
                "JOIN coa ON coa.id = ji.coa_id",
                "WHERE j.is_posted = true",
                "ORDER BY j.date DESC, j.journal_number, coa.code;",
            ]
        },
        {
            'id': 'Q-ERP-08',
            'title': 'Laporan Buku Besar per Akun',
            'desc': 'Riwayat mutasi satu akun dengan saldo berjalan (running balance).',
            'code': [
                "-- Q-ERP-08: Buku Besar Akun (ganti '1111' dengan kode akun yang diinginkan)",
                "WITH ledger AS (",
                "  SELECT",
                "    j.date,",
                "    j.journal_number,",
                "    j.description,",
                "    ji.debit,",
                "    ji.credit",
                "  FROM journal_items ji",
                "  JOIN journals j ON j.id = ji.journal_id",
                "  JOIN coa ON coa.id = ji.coa_id",
                "  WHERE coa.code = '1111'  -- <-- ganti kode akun",
                "    AND j.is_posted = true",
                "  ORDER BY j.date, j.journal_number",
                ")",
                "SELECT",
                "  date            AS \"Tanggal\",",
                "  journal_number  AS \"No Jurnal\",",
                "  description     AS \"Keterangan\",",
                "  debit           AS \"Debit\",",
                "  credit          AS \"Kredit\",",
                "  SUM(debit - credit) OVER (ORDER BY date, journal_number)",
                "                  AS \"Saldo\"",
                "FROM ledger;",
            ]
        },
        {
            'id': 'Q-ERP-09',
            'title': 'Laporan Stok Barang (Inventory)',
            'desc': 'Saldo stok saat ini per produk dan gudang.',
            'code': [
                "-- Q-ERP-09: Stok Barang",
                "SELECT",
                "  p.sku               AS \"SKU\",",
                "  p.name              AS \"Produk\",",
                "  pc.name             AS \"Kategori\",",
                "  u.name              AS \"Satuan Dasar\",",
                "  ist.quantity_on_hand AS \"Stok Tersedia\",",
                "  p.buy_price         AS \"Harga Beli\",",
                "  p.sell_price        AS \"Harga Jual\",",
                "  (ist.quantity_on_hand * p.buy_price) AS \"Nilai Stok\"",
                "FROM inventory_stock ist",
                "JOIN products p ON p.id = ist.product_id",
                "LEFT JOIN product_categories pc ON pc.id = p.category_id",
                "LEFT JOIN units u ON u.id = p.base_unit_id",
                "ORDER BY p.name;",
            ]
        },
        {
            'id': 'Q-ERP-10',
            'title': 'Laporan AR Aging (Umur Piutang)',
            'desc': 'Klasifikasi piutang berdasarkan umur keterlambatan.',
            'code': [
                "-- Q-ERP-10: AR Aging Report",
                "SELECT",
                "  c.name              AS \"Pelanggan\",",
                "  inv.invoice_number  AS \"No Faktur\",",
                "  inv.date            AS \"Tanggal\",",
                "  inv.due_date        AS \"Jatuh Tempo\",",
                "  (inv.total - inv.amount_paid) AS \"Sisa Tagihan\",",
                "  (CURRENT_DATE - inv.due_date) AS \"Hari Terlambat\",",
                "  CASE",
                "    WHEN CURRENT_DATE <= inv.due_date THEN 'Belum Jatuh Tempo'",
                "    WHEN (CURRENT_DATE - inv.due_date) <= 30 THEN '1-30 Hari'",
                "    WHEN (CURRENT_DATE - inv.due_date) <= 60 THEN '31-60 Hari'",
                "    WHEN (CURRENT_DATE - inv.due_date) <= 90 THEN '61-90 Hari'",
                "    ELSE '> 90 Hari'",
                "  END AS \"Bucket\"",
                "FROM invoices inv",
                "JOIN customers c ON c.id = inv.customer_id",
                "WHERE inv.type = 'sales'",
                "  AND inv.status IN ('posted', 'partial')",
                "ORDER BY c.name, inv.due_date;",
            ]
        },
        {
            'id': 'Q-ERP-11',
            'title': 'Laporan AP Aging (Umur Hutang)',
            'desc': 'Klasifikasi hutang ke supplier berdasarkan umur.',
            'code': [
                "-- Q-ERP-11: AP Aging Report",
                "SELECT",
                "  s.name              AS \"Supplier\",",
                "  inv.invoice_number  AS \"No Faktur\",",
                "  inv.date            AS \"Tanggal\",",
                "  inv.due_date        AS \"Jatuh Tempo\",",
                "  (inv.total - inv.amount_paid) AS \"Sisa Hutang\",",
                "  (CURRENT_DATE - inv.due_date) AS \"Hari Terlambat\",",
                "  CASE",
                "    WHEN CURRENT_DATE <= inv.due_date THEN 'Belum Jatuh Tempo'",
                "    WHEN (CURRENT_DATE - inv.due_date) <= 30 THEN '1-30 Hari'",
                "    WHEN (CURRENT_DATE - inv.due_date) <= 60 THEN '31-60 Hari'",
                "    WHEN (CURRENT_DATE - inv.due_date) <= 90 THEN '61-90 Hari'",
                "    ELSE '> 90 Hari'",
                "  END AS \"Bucket\"",
                "FROM invoices inv",
                "JOIN suppliers s ON s.id = inv.supplier_id",
                "WHERE inv.type = 'purchase'",
                "  AND inv.status IN ('posted', 'partial')",
                "ORDER BY s.name, inv.due_date;",
            ]
        },
        {
            'id': 'Q-ERP-12',
            'title': 'Laporan Aset Tetap',
            'desc': 'Daftar aset tetap dengan nilai buku dan penyusutan.',
            'code': [
                "-- Q-ERP-12: Aset Tetap",
                "SELECT",
                "  a.code              AS \"Kode Aset\",",
                "  a.name              AS \"Nama Aset\",",
                "  ac.name             AS \"Kategori\",",
                "  a.acquisition_date  AS \"Tgl Perolehan\",",
                "  a.acquisition_cost  AS \"Harga Perolehan\",",
                "  a.salvage_value     AS \"Nilai Residu\",",
                "  a.useful_life_months AS \"Masa Manfaat (Bln)\",",
                "  a.depreciation_method AS \"Metode\",",
                "  a.accumulated_depreciation AS \"Akum. Penyusutan\",",
                "  (a.acquisition_cost - a.accumulated_depreciation) AS \"Nilai Buku\",",
                "  a.status",
                "FROM assets a",
                "LEFT JOIN asset_categories ac ON ac.id = a.category_id",
                "WHERE a.is_active = true",
                "ORDER BY ac.name, a.code;",
            ]
        },
        {
            'id': 'Q-ERP-13',
            'title': 'Laporan Sales Return (Return Penjualan)',
            'desc': 'Semua return penjualan dengan produk dan nilainya.',
            'code': [
                "-- Q-ERP-13: Sales Returns",
                "SELECT",
                "  sr.return_number    AS \"No Return\",",
                "  sr.date             AS \"Tanggal\",",
                "  c.name              AS \"Pelanggan\",",
                "  so.so_number        AS \"Ref SO\",",
                "  p.name              AS \"Produk\",",
                "  u.name              AS \"Satuan\",",
                "  sri.quantity        AS \"Qty Return\",",
                "  sri.unit_price      AS \"Harga\",",
                "  sri.total           AS \"Nilai Return\",",
                "  sr.status",
                "FROM sales_returns sr",
                "JOIN sales_return_items sri ON sri.sales_return_id = sr.id",
                "JOIN customers c   ON c.id  = sr.customer_id",
                "JOIN products  p   ON p.id  = sri.product_id",
                "JOIN units     u   ON u.id  = sri.unit_id",
                "LEFT JOIN sales_orders so ON so.id = sr.sales_order_id",
                "ORDER BY sr.date DESC;",
            ]
        },
        {
            'id': 'Q-ERP-14',
            'title': 'Neraca Saldo (Trial Balance)',
            'desc': 'Saldo debit dan kredit semua akun COA.',
            'code': [
                "-- Q-ERP-14: Neraca Saldo",
                "SELECT",
                "  coa.code            AS \"Kode Akun\",",
                "  coa.name            AS \"Nama Akun\",",
                "  coa.account_type    AS \"Tipe\",",
                "  SUM(ji.debit)       AS \"Total Debit\",",
                "  SUM(ji.credit)      AS \"Total Kredit\",",
                "  (SUM(ji.debit) - SUM(ji.credit)) AS \"Saldo\"",
                "FROM coa",
                "LEFT JOIN journal_items ji ON ji.coa_id = coa.id",
                "LEFT JOIN journals j ON j.id = ji.journal_id AND j.is_posted = true",
                "GROUP BY coa.id, coa.code, coa.name, coa.account_type",
                "HAVING (SUM(ji.debit) != 0 OR SUM(ji.credit) != 0)",
                "ORDER BY coa.code;",
            ]
        },
        {
            'id': 'Q-ERP-15',
            'title': 'Laporan Rekap Penjualan per Pelanggan',
            'desc': 'Total penjualan dikelompokkan per pelanggan dalam periode tertentu.',
            'code': [
                "-- Q-ERP-15: Rekap Penjualan per Pelanggan",
                "-- Ganti '[START]' dan '[END]' dengan tanggal, mis. '2026-01-01' dan '2026-05-31'",
                "SELECT",
                "  c.name              AS \"Pelanggan\",",
                "  COUNT(inv.id)       AS \"Jumlah Faktur\",",
                "  SUM(inv.subtotal)   AS \"Total Subtotal\",",
                "  SUM(inv.tax_amount) AS \"Total PPN\",",
                "  SUM(inv.total)      AS \"Total Penjualan\",",
                "  SUM(inv.amount_paid)AS \"Total Dibayar\",",
                "  SUM(inv.total - inv.amount_paid) AS \"Total Sisa\"",
                "FROM invoices inv",
                "JOIN customers c ON c.id = inv.customer_id",
                "WHERE inv.type = 'sales'",
                "  AND inv.status NOT IN ('draft','cancelled')",
                "  AND inv.date BETWEEN '[START]' AND '[END]'",
                "GROUP BY c.id, c.name",
                "ORDER BY SUM(inv.total) DESC;",
            ]
        },
    ]

    for q in sql_queries:
        story.append(KeepTogether([
            Paragraph(
                f'<font color="#1565C0"><b>{q["id"]}</b></font> — {q["title"]}',
                styles['h3']),
            Paragraph(q['desc'], styles['note']),
            code_block(q['code'], styles),
            Spacer(1, 10),
        ]))

    story.append(PageBreak())

    # 3.3 Supabase JS Client Queries
    story.append(Paragraph('3.3 Supabase JavaScript Client Queries', styles['h2']))
    story.append(Paragraph(
        'Alternatif SQL, gunakan Supabase JS client langsung dari React/Node.js '
        '(sudah tersedia di erp-acc via <i>src/lib/supabase.js</i>):',
        styles['body']))
    story.append(Spacer(1, 6))

    js_queries = [
        {
            'title': 'Setup: Install xlsx di ERP-ACC',
            'code': [
                "# Jalankan di: apps/erp-acc/erp-app/",
                "npm install xlsx",
                "",
                "# Kemudian import di file yang membutuhkan:",
                "import * as XLSX from 'xlsx'",
            ]
        },
        {
            'title': 'Fetch Sales Orders + Detail untuk Excel',
            'code': [
                "import { supabase } from '../lib/supabase'",
                "import * as XLSX from 'xlsx'",
                "",
                "export async function exportSalesOrdersToExcel() {",
                "  const { data, error } = await supabase",
                "    .from('sales_orders')",
                "    .select(`",
                "      so_number, date, status, subtotal, tax_amount, total, notes,",
                "      customer:customers(name),",
                "      items:sales_order_items(",
                "        quantity, unit_price, total,",
                "        product:products(name, sku),",
                "        unit:units(name)",
                "      )",
                "    `)",
                "    .order('date', { ascending: false })",
                "  if (error) throw error",
                "",
                "  // Flatten untuk Excel (1 baris per item)",
                "  const rows = []",
                "  data.forEach(so => {",
                "    so.items.forEach(item => {",
                "      rows.push({",
                "        'No SO':       so.so_number,",
                "        'Tanggal':     so.date,",
                "        'Pelanggan':   so.customer?.name,",
                "        'Status':      so.status,",
                "        'SKU':         item.product?.sku,",
                "        'Produk':      item.product?.name,",
                "        'Satuan':      item.unit?.name,",
                "        'Qty':         item.quantity,",
                "        'Harga':       item.unit_price,",
                "        'Subtotal':    item.total,",
                "        'Total SO':    so.total,",
                "      })",
                "    })",
                "  })",
                "",
                "  const ws = XLSX.utils.json_to_sheet(rows)",
                "  const wb = XLSX.utils.book_new()",
                "  XLSX.utils.book_append_sheet(wb, ws, 'Sales Orders')",
                "  XLSX.writeFile(wb, 'SalesOrders.xlsx')",
                "}",
            ]
        },
        {
            'title': 'Fetch Invoices (Piutang) untuk Excel',
            'code': [
                "export async function exportSalesInvoicesToExcel() {",
                "  const { data, error } = await supabase",
                "    .from('invoices')",
                "    .select(`",
                "      invoice_number, date, due_date, subtotal,",
                "      tax_amount, total, amount_paid, status,",
                "      customer:customers(name)`,)",
                "    .eq('type', 'sales')",
                "    .order('date', { ascending: false })",
                "  if (error) throw error",
                "",
                "  const rows = data.map(inv => ({",
                "    'No Faktur':      inv.invoice_number,",
                "    'Tanggal':        inv.date,",
                "    'Jatuh Tempo':    inv.due_date,",
                "    'Pelanggan':      inv.customer?.name,",
                "    'Total':          inv.total,",
                "    'Sudah Dibayar':  inv.amount_paid,",
                "    'Sisa':           inv.total - inv.amount_paid,",
                "    'Status':         inv.status,",
                "  }))",
                "",
                "  const ws = XLSX.utils.json_to_sheet(rows)",
                "  const wb = XLSX.utils.book_new()",
                "  XLSX.utils.book_append_sheet(wb, ws, 'Faktur Penjualan')",
                "  XLSX.writeFile(wb, 'FakturPenjualan.xlsx')",
                "}",
            ]
        },
        {
            'title': 'Export Multi-Sheet: SO + Invoices + Payments',
            'code': [
                "export async function exportAllErpToExcel() {",
                "  const wb = XLSX.utils.book_new()",
                "",
                "  // Fetch semua data secara paralel",
                "  const [soRes, invRes, payRes] = await Promise.all([",
                "    supabase.from('sales_orders')",
                "      .select('so_number,date,status,total,customer:customers(name)')",
                "      .order('date', { ascending: false }),",
                "    supabase.from('invoices')",
                "      .select('invoice_number,date,due_date,total,amount_paid,status,customer:customers(name)')",
                "      .eq('type','sales').order('date', { ascending: false }),",
                "    supabase.from('payments')",
                "      .select('date,type,amount,notes,account:accounts(name),invoice:invoices(invoice_number)')",
                "      .order('date', { ascending: false }),",
                "  ])",
                "",
                "  // Sheet 1: Sales Orders",
                "  const soRows = soRes.data.map(r => ({",
                "    'No SO': r.so_number, 'Tanggal': r.date,",
                "    'Pelanggan': r.customer?.name, 'Status': r.status, 'Total': r.total",
                "  }))",
                "  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(soRows), 'SO')",
                "",
                "  // Sheet 2: Invoices",
                "  const invRows = invRes.data.map(r => ({",
                "    'No Faktur': r.invoice_number, 'Tanggal': r.date,",
                "    'Pelanggan': r.customer?.name, 'Total': r.total,",
                "    'Dibayar': r.amount_paid, 'Sisa': r.total - r.amount_paid, 'Status': r.status",
                "  }))",
                "  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows), 'Faktur')",
                "",
                "  // Sheet 3: Payments",
                "  const payRows = payRes.data.map(r => ({",
                "    'Tanggal': r.date, 'Tipe': r.type, 'Rekening': r.account?.name,",
                "    'Ref Faktur': r.invoice?.invoice_number, 'Jumlah': r.amount",
                "  }))",
                "  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payRows), 'Pembayaran')",
                "",
                "  XLSX.writeFile(wb, `ERP_Export_${new Date().toISOString().slice(0,10)}.xlsx`)",
                "}",
            ]
        },
    ]

    for jq in js_queries:
        story.append(KeepTogether([
            Paragraph(f'<b>{jq["title"]}</b>', styles['h4']),
            code_block(jq['code'], styles),
            Spacer(1, 8),
        ]))

    story.append(PageBreak())


# ─── BAB 4: Template Script ──────────────────────────────────────────────────
def build_chapter4(story, styles):
    for e in section_header('4. Template Script Export All-in-One', styles, color=TEAL):
        story.append(e)

    story.append(Paragraph('4.1 Node.js Script — Export Semua Data ERP-ACC ke Excel', styles['h2']))
    story.append(info_box(
        'Script ini dapat dijalankan dari command line untuk export seluruh data ERP-ACC '
        'ke satu file Excel multi-sheet. Berguna untuk backup data, laporan bulanan, '
        'atau audit trail.',
        styles, bg=BLUE_BG, border=TEAL))
    story.append(Spacer(1, 6))

    story.append(code_block([
        "// File: scripts/exportErpToExcel.mjs",
        "// Jalankan: node scripts/exportErpToExcel.mjs",
        "",
        "import { createClient } from '@supabase/supabase-js'",
        "import * as XLSX from 'xlsx'",
        "import { writeFileSync } from 'fs'",
        "",
        "const supabase = createClient(",
        "  process.env.VITE_SUPABASE_URL,",
        "  process.env.SUPABASE_SERVICE_ROLE_KEY  // gunakan service role untuk full access",
        ")",
        "",
        "async function fetchAll(table, select = '*') {",
        "  const { data, error } = await supabase.from(table).select(select)",
        "  if (error) { console.error(`Error ${table}:`, error.message); return [] }",
        "  return data",
        "}",
        "",
        "async function main() {",
        "  console.log('Mengambil data...')",
        "  const wb = XLSX.utils.book_new()",
        "",
        "  // Sales Orders",
        "  const so = await fetchAll('sales_orders',",
        "    'so_number,date,status,total,customer:customers(name)')",
        "  XLSX.utils.book_append_sheet(wb,",
        "    XLSX.utils.json_to_sheet(so.map(r => ({",
        "      'No SO': r.so_number, 'Tanggal': r.date,",
        "      'Pelanggan': r.customer?.name, 'Status': r.status, 'Total': r.total",
        "    }))), 'Sales Orders')",
        "",
        "  // Purchase Orders",
        "  const po = await fetchAll('purchase_orders',",
        "    'po_number,date,status,total,supplier:suppliers(name)')",
        "  XLSX.utils.book_append_sheet(wb,",
        "    XLSX.utils.json_to_sheet(po.map(r => ({",
        "      'No PO': r.po_number, 'Tanggal': r.date,",
        "      'Supplier': r.supplier?.name, 'Status': r.status, 'Total': r.total",
        "    }))), 'Purchase Orders')",
        "",
        "  // Invoices (Sales)",
        "  const sinv = await fetchAll('invoices',",
        "    'invoice_number,date,due_date,total,amount_paid,status,customer:customers(name)')",
        "  XLSX.utils.book_append_sheet(wb,",
        "    XLSX.utils.json_to_sheet(",
        "      sinv.filter(r => r.type === 'sales').map(r => ({",
        "        'No Faktur': r.invoice_number, 'Pelanggan': r.customer?.name,",
        "        'Total': r.total, 'Dibayar': r.amount_paid, 'Status': r.status",
        "      }))), 'Faktur Penjualan')",
        "",
        "  // Payments",
        "  const pay = await fetchAll('payments',",
        "    'date,type,amount,notes,account:accounts(name)')",
        "  XLSX.utils.book_append_sheet(wb,",
        "    XLSX.utils.json_to_sheet(pay.map(r => ({",
        "      'Tanggal': r.date, 'Tipe': r.type,",
        "      'Rekening': r.account?.name, 'Jumlah': r.amount",
        "    }))), 'Pembayaran')",
        "",
        "  // Stok",
        "  const stk = await fetchAll('inventory_stock',",
        "    'quantity_on_hand,product:products(name,sku,buy_price)')",
        "  XLSX.utils.book_append_sheet(wb,",
        "    XLSX.utils.json_to_sheet(stk.map(r => ({",
        "      'SKU': r.product?.sku, 'Produk': r.product?.name,",
        "      'Stok': r.quantity_on_hand,",
        "      'Nilai': r.quantity_on_hand * (r.product?.buy_price || 0)",
        "    }))), 'Stok')",
        "",
        "  const filename = `ERP_Export_${new Date().toISOString().slice(0,10)}.xlsx`",
        "  XLSX.writeFile(wb, filename)",
        "  console.log(`Export selesai: ${filename}`)",
        "}",
        "",
        "main().catch(console.error)",
    ], styles))

    story.append(Spacer(1, 10))
    story.append(Paragraph('4.2 Cara Menjalankan Script', styles['h2']))

    story.append(code_block([
        "# 1. Masuk ke direktori erp-acc",
        "cd apps/erp-acc/erp-app",
        "",
        "# 2. Install dependensi (jika belum)",
        "npm install xlsx @supabase/supabase-js",
        "",
        "# 3. Set environment variables",
        "# Windows PowerShell:",
        "$env:VITE_SUPABASE_URL = 'https://xxxx.supabase.co'",
        "$env:SUPABASE_SERVICE_ROLE_KEY = 'eyJhb...'",
        "",
        "# 4. Jalankan script",
        "node scripts/exportErpToExcel.mjs",
        "",
        "# Output: ERP_Export_2026-05-28.xlsx (di folder saat ini)",
    ], styles))

    story.append(Spacer(1, 8))
    story.append(info_box(
        '<b>PENTING — Service Role Key:</b> Script ini menggunakan '
        '<b>SUPABASE_SERVICE_ROLE_KEY</b> (bukan anon key) agar bisa membaca '
        'semua data tanpa batasan RLS. Jangan pernah expose key ini ke browser! '
        'Gunakan hanya di server/script lokal yang aman.',
        styles, bg=HexColor('#FFEBEE'), border=HexColor('#C62828')))

    story.append(PageBreak())


# ─── BAB 5: Catatan Keamanan ─────────────────────────────────────────────────
def build_chapter5(story, styles):
    for e in section_header('5. Catatan Keamanan & Best Practice', styles, color=DARK_GRAY):
        story.append(e)

    tips = [
        ('Jangan Expose API Key di Browser',
         'Service Role Key Supabase harus hanya digunakan di server atau script lokal. '
         'Di React app (browser), gunakan hanya anon key + RLS policy yang tepat.'),
        ('Gunakan RLS untuk Akses Data',
         'Pastikan Row Level Security (RLS) aktif di Supabase. Export dari browser '
         'hanya akan mendapatkan data yang diizinkan oleh policy role pengguna yang sedang login.'),
        ('Filter Data Sebelum Export',
         'Jangan fetch semua data sekaligus jika data sudah banyak (>10.000 baris). '
         'Selalu tambahkan filter tanggal atau parameter lain untuk membatasi ukuran export.'),
        ('Validasi Hak Akses Pengguna',
         'Tambahkan pengecekan role sebelum memperbolehkan export. Misalnya, hanya '
         'role admin_keuangan atau owner yang dapat mengeksport data keuangan.'),
        ('Audit Trail Export',
         'Catat setiap aksi export di audit log — siapa yang mengeksport, kapan, '
         'dan data apa. Ini penting untuk compliance dan keamanan.'),
        ('Enkripsi File Excel Sensitif',
         'Untuk data sangat sensitif (data keuangan, daftar pelanggan), pertimbangkan '
         'untuk menambahkan password protection pada file Excel menggunakan library xlsx.'),
        ('Integrasi Power Query Excel (ERP-ACC)',
         'Supabase mendukung koneksi langsung dari Excel via Power Query menggunakan '
         'REST API. URL: https://[project-id].supabase.co/rest/v1/[table]. '
         'Tambahkan header Authorization: Bearer [anon-key].'),
        ('Backup Berkala via Script',
         'Jadwalkan script Node.js exportErpToExcel.mjs untuk berjalan otomatis '
         'setiap minggu atau bulan menggunakan Windows Task Scheduler atau cron job.'),
    ]

    for i, (title, desc) in enumerate(tips):
        story.append(KeepTogether([
            Paragraph(f'{i+1}. {title}', styles['h3']),
            Paragraph(desc, styles['body']),
            Spacer(1, 4),
        ]))

    story.append(Spacer(1, 10))
    story.append(HRFlowable(width='100%', thickness=1, color=MED_GRAY, spaceAfter=8))

    # Ringkasan akhir
    summary = [
        ['App', 'Export Excel', 'Metode Terbaik', 'Effort'],
        ['BUL-Accounting', 'Sudah ada (sebagian)', 'Tambah fungsi export di exportUtils.js', 'Rendah'],
        ['ERP-ACC', 'Belum ada', 'Install xlsx + buat exportUtils.js baru', 'Sedang'],
        ['ERP-ACC (DB)', 'SQL Query', 'Supabase SQL Editor → Export CSV → Buka di Excel', 'Sangat Rendah'],
        ['ERP-ACC (Live)', 'Power Query', 'Excel → Get Data → Web → Supabase REST API', 'Sedang'],
    ]
    story.append(Paragraph('Ringkasan Akhir', styles['h2']))
    story.append(data_table(summary[0], summary[1:], styles,
                            col_widths=[3.5*cm, 3.5*cm, 6.5*cm, 3*cm]))

    story.append(Spacer(1, 12))
    story.append(info_box(
        '<b>Langkah Pertama yang Direkomendasikan:</b><br/>'
        '1. Untuk BUL-Accounting: tambahkan tombol Export di PenjualanPage, KasBankPage, BiayaPage.<br/>'
        '2. Untuk ERP-ACC: jalankan Q-ERP-01 s/d Q-ERP-15 di Supabase SQL Editor untuk '
        'memverifikasi data, lalu install xlsx dan buat fungsi export.<br/>'
        '3. Jangka panjang: hubungkan Excel ke Supabase via Power Query untuk laporan '
        'yang selalu up-to-date.',
        styles, bg=BLUE_BG, border=TEAL))


# ─── Header / Footer ────────────────────────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    # Header line
    canvas.setStrokeColor(ORANGE)
    canvas.setLineWidth(1.5)
    canvas.line(doc.leftMargin, H - 1.8*cm, W - doc.rightMargin, H - 1.8*cm)
    canvas.setFont('Helvetica-Bold', 8)
    canvas.setFillColor(ORANGE)
    canvas.drawString(doc.leftMargin, H - 1.5*cm, 'ERP Data → Excel Integration Guide')
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(HexColor('#9E9E9E'))
    canvas.drawRightString(W - doc.rightMargin, H - 1.5*cm, '28 Mei 2026')

    # Footer
    canvas.setStrokeColor(MED_GRAY)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, 1.8*cm, W - doc.rightMargin, 1.8*cm)
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(HexColor('#9E9E9E'))
    canvas.drawString(doc.leftMargin, 1.3*cm,
                      'BUL-Accounting (Firebase) & ERP-ACC (Supabase) — Internal Reference')
    canvas.drawRightString(W - doc.rightMargin, 1.3*cm, f'Halaman {doc.page}')
    canvas.restoreState()


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    out_path = r'C:\Project\ERP_Excel_Integration_Query_Guide.pdf'
    doc = SimpleDocTemplate(
        out_path,
        pagesize=A4,
        leftMargin=2*cm,
        rightMargin=2*cm,
        topMargin=2.5*cm,
        bottomMargin=2.5*cm,
        title='ERP Data → Excel Integration Guide',
        author='ERP System — Internal',
        subject='Query Reference & Export Guide',
    )

    styles = build_styles()
    story = []

    build_cover(story, styles)
    build_toc(story, styles)
    build_chapter1(story, styles)
    build_chapter2(story, styles)
    build_chapter3(story, styles)
    build_chapter4(story, styles)
    build_chapter5(story, styles)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f'PDF berhasil dibuat: {out_path}')


if __name__ == '__main__':
    main()
