import zipfile, io, re, sys
sys.stdout.reconfigure(encoding='utf-8')

PATH = 'C:/Project/sj-monitor-firestore-query-v2.xlsx'

with zipfile.ZipFile(PATH, 'r') as z:
    dm = z.read('xl/customXml/item1.xml')
    inner = zipfile.ZipFile(io.BytesIO(dm))
    m = inner.read('Formulas/Section1.m').decode('utf-8')
    shared = [l.strip() for l in m.split('\n') if l.strip().startswith('shared ')]
    print(f'Queries in DataMashup ({len(shared)}):')
    for s in shared:
        print(' ', s[:70])

    wr = z.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    ct = z.read('[Content_Types].xml').decode('utf-8')
    print('\nWorkbook rels:')
    print('  DataMashup   :', 'DataMashup' in wr)
    print('  connections  :', '/relationships/connections' in wr)
    print('Content types:')
    print('  customXml    :', 'customXml/item1.xml' in ct)
    print('  connections  :', 'connections.xml' in ct)

print('\nParsing M code per-query from sheet...')
# Simulate the parse
def parse_section(txt):
    out, cur, buf = [], None, []
    for line in txt.splitlines():
        m = re.match(r'^shared\s+(\w+)\s*=(.*)', line)
        if m:
            if cur: out.append((cur, '\n'.join(buf).strip().rstrip(';').strip()))
            cur = m.group(1); buf = [m.group(2)]
        elif cur: buf.append(line)
    if cur: out.append((cur, '\n'.join(buf).strip().rstrip(';').strip()))
    return out

with zipfile.ZipFile(PATH, 'r') as z:
    inner = zipfile.ZipFile(io.BytesIO(z.read('xl/customXml/item1.xml')))
    m = inner.read('Formulas/Section1.m').decode('utf-8')

queries = parse_section(m)
print(f'Parsed {len(queries)} queries:')
for name, code in queries:
    lines = code.count('\n') + 1
    first_line = code.split('\n')[0].strip()[:60]
    print(f'  {name:28s} ({lines:3d} lines) -> {first_line}...')

print('\n✅ Verifikasi selesai.')
