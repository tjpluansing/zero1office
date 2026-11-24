"""Build providers.json and doctors.json for the proposal generator from Maxicare's Sep 2026 accredited lists.
Usage: python3 build_providers.py <folder with the xlsx files> <output folder>"""
import sys, json, re, collections, openpyxl
src, out = sys.argv[1], sys.argv[2]
def norm(s):
    s = (s or '').upper().replace('Ñ', 'N')
    s = re.sub(r'\b(INC|INCORPORATED|CORPORATION|CORP|CO|OPC|LTD)\b\.?', ' ', s)
    return re.sub(r'[^A-Z0-9]', '', s)
clean = lambda s: re.sub(r'\s+', ' ', (s or '').strip())
REGION_FIX = {'ARMM': 'BARMM'}
fac, regions = [], []
def reg(r):
    r = REGION_FIX.get(clean(r).upper(), clean(r).upper()) or 'UNKNOWN'
    if r not in regions: regions.append(r)
    return regions.index(r)
for kind, f in (('H', 'Hospital'), ('C', 'Clinics'), ('D', 'Dental Clinics')):
    ws = openpyxl.load_workbook(f'{src}/Maxicare_List of Accredited {f}_Sep2026.xlsx', read_only=True).worksheets[0]
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r[0] or 'DO NOT USE' in str(r[0]).upper(): continue
        region = clean(r[1]).upper()
        prov = clean(r[2]).upper() or ('METRO MANILA' if region == 'NCR' else '')
        fac.append([clean(r[0]), kind, reg(region), prov, clean(r[3]).upper()])
# Maxicare Primary Care Clinics (from Maxicare_PCCs_and_Other_Services.pdf). key = name used in the physician list
NCR = ('NCR', 'METRO MANILA')
PCC = [
 ('ALABANG', 'Maxicare PCC Filinvest Three, Alabang', *NCR, 'MUNTINLUPA CITY'),
 ('AYALA NORTH EXCHANGE', 'Maxicare PCC Ayala North Exchange', *NCR, 'MAKATI CITY'),
 ('BGC', 'Maxicare PCC Bonifacio Technology Center, BGC', *NCR, 'TAGUIG CITY'),
 ('BONIFACIO TECHNOLOGY CENTER', 'Maxicare PCC Bonifacio Technology Center, BGC', *NCR, 'TAGUIG CITY'),
 ('BRIDGETOWNE', 'Maxicare PCC Zeta Tower, Bridgetowne', *NCR, 'PASIG CITY'),
 ('CENTRIS', 'Maxicare PCC Eton Centris', *NCR, 'QUEZON CITY'),
 ('CUBAO', 'Maxicare PCC Araneta City Cubao (temporarily closed)', *NCR, 'QUEZON CITY'),
 ('DONA ELENA', 'Maxicare PCC Doña Elena Tower, Sta. Mesa', *NCR, 'MANILA CITY'),
 ('DOUBLE DRAGON MERIDIAN PARK', 'Maxicare PCC Double Dragon Meridian Park', *NCR, 'PASAY CITY'),
 ('DOUBLE DRAGON - MERIDIAN PARK', 'Maxicare PCC Double Dragon Meridian Park', *NCR, 'PASAY CITY'),
 ('FAIRVIEW', 'Maxicare PCC AD Center Fairview', *NCR, 'QUEZON CITY'),
 ('HEMADY', 'Maxicare PCC Hemady Square', *NCR, 'QUEZON CITY'),
 ('PARANAQUE', 'Maxicare PCC SM City BF Parañaque', *NCR, 'PARAÑAQUE CITY'),
 ('ROBINSONS LAS PINAS', 'Maxicare PCC Robinsons Place Las Piñas', *NCR, 'LAS PIÑAS CITY'),
 ('ROBINSONS METRO EAST', 'Maxicare PCC Robinsons Metro East', *NCR, 'PASIG CITY'),
 ('ROBINSONS NOVALICHES', 'Maxicare PCC Robinsons Novaliches', *NCR, 'QUEZON CITY'),
 ('ROBINSONS OTIS', 'Maxicare PCC Robinsons Otis, Paco', *NCR, 'MANILA CITY'),
 ('VALENZUELA', 'Maxicare PCC Valenzuela', *NCR, 'VALENZUELA CITY'),
 ('VV SOLIVEN', 'Maxicare PCC VV Soliven, Greenhills', *NCR, 'SAN JUAN'),
 (None, 'Maxicare PCC Robinsons Town Mall Malabon', *NCR, 'MALABON CITY'),
 (None, 'Maxicare PCC SM Bicutan', *NCR, 'PARAÑAQUE CITY'),
 (None, 'Maxicare PCC Bagong Silang, Caloocan', *NCR, 'KALOOKAN CITY'),
 (None, 'Maxicare PCC Ayala Malls Marikina', *NCR, 'MARIKINA CITY'),
 ('BAGUIO', 'Maxicare PCC Porta Vaga, Baguio', 'CAR', 'BENGUET', 'BAGUIO CITY'),
 ('CLARK', 'Maxicare PCC SM City Clark', 'REGION 3', 'PAMPANGA', 'ANGELES CITY'),
 ('ROBINSONS STARMILLS', 'Maxicare PCC Robinsons Starmills, San Fernando', 'REGION 3', 'PAMPANGA', 'SAN FERNANDO CITY'),
 ('ROBINSONS MALOLOS', 'Maxicare PCC Robinsons Malolos', 'REGION 3', 'BULACAN', 'MALOLOS CITY'),
 ('SAN JOSE DEL MONTE', 'Maxicare PCC Skyline, San Jose del Monte', 'REGION 3', 'BULACAN', 'SAN JOSE DEL MONTE CITY'),
 (None, 'Maxicare PCC The Leaf, Meycauayan', 'REGION 3', 'BULACAN', 'MEYCAUAYAN'),
 (None, 'Maxicare PCC Robinsons Townsville, Pulilan', 'REGION 3', 'BULACAN', 'PULILAN'),
 (None, 'Maxicare PCC Robinsons Gapan', 'REGION 3', 'NUEVA ECIJA', 'GAPAN CITY'),
 (None, 'Maxicare PCC Robinsons Luisita, Tarlac', 'REGION 3', 'TARLAC', 'TARLAC CITY'),
 ('IMUS', 'Maxicare PCC Metro MPC Building, Imus', 'REGION 4-A', 'CAVITE', 'IMUS'),
 ('SOMO (BACOOR)', 'Maxicare PCC SOMO, Bacoor', 'REGION 4-A', 'CAVITE', 'BACOOR'),
 ('TERRAZA DASMA', 'Maxicare PCC Robinsons Dasmariñas', 'REGION 4-A', 'CAVITE', 'DASMARIÑAS'),
 (None, 'Maxicare PCC Robinsons General Trias', 'REGION 4-A', 'CAVITE', 'GENERAL TRIAS'),
 ('CALAMBA', 'Maxicare PCC The Mezzo, Calamba', 'REGION 4-A', 'LAGUNA', 'CALAMBA CITY'),
 ('LAGUNA', 'Maxicare PCC Solenad Nuvali, Sta. Rosa', 'REGION 4-A', 'LAGUNA', 'SANTA ROSA CITY'),
 (None, 'Maxicare PCC Robinsons Sta. Rosa', 'REGION 4-A', 'LAGUNA', 'SANTA ROSA CITY'),
 (None, 'Maxicare PCC Southwoods Mall, Biñan', 'REGION 4-A', 'LAGUNA', 'BIÑAN'),
 (None, 'Maxicare PCC Robinsons Galleria South, San Pedro', 'REGION 4-A', 'LAGUNA', 'SAN PEDRO'),
 (None, 'Maxicare PCC Mainstreet Plaza, San Pablo', 'REGION 4-A', 'LAGUNA', 'SAN PABLO CITY'),
 (None, 'Maxicare PCC Robinsons Antipolo', 'REGION 4-A', 'RIZAL', 'ANTIPOLO CITY'),
 (None, 'Maxicare PCC Robinsons Cainta', 'REGION 4-A', 'RIZAL', 'CAINTA'),
 (None, 'Maxicare PCC Robinsons Lipa', 'REGION 4-A', 'BATANGAS', 'LIPA CITY'),
 (None, 'Maxicare PCC ATC Courtyard, Sto. Tomas', 'REGION 4-A', 'BATANGAS', 'SANTO TOMAS'),
 (None, 'Maxicare PCC Pacific Mall, Legazpi', 'REGION 5', 'ALBAY', 'LEGAZPI CITY'),
 ('CEBU BUSINESS PARK', 'Maxicare PCC Cebu Business Park', 'REGION 7', 'CEBU', 'CEBU CITY'),
 ('CEBU EXCHANGE', 'Maxicare PCC Cebu Exchange Tower', 'REGION 7', 'CEBU', 'CEBU CITY'),
 ('CEBU SKYRISE', 'Maxicare PCC Cebu IT Park (Skyrise)', 'REGION 7', 'CEBU', 'CEBU CITY'),
 (None, 'Maxicare PCC Casa Mira, Mandaue', 'REGION 7', 'CEBU', 'MANDAUE CITY'),
 ('BACOLOD', 'Maxicare PCC Bacolod', 'REGION 6', 'NEGROS OCCIDENTAL', 'BACOLOD CITY'),
 ('ILOILO', 'Maxicare PCC Iloilo', 'REGION 6', 'ILOILO', 'ILOILO CITY'),
 ('DAVAO', 'Maxicare PCC Davao', 'REGION 11', 'DAVAO DEL SUR', 'DAVAO CITY'),
 ('CAGAYAN DE ORO', 'Maxicare PCC Cagayan de Oro', 'REGION 10', 'MISAMIS ORIENTAL', 'CAGAYAN DE ORO CITY'),
 (None, 'Maxicare PCC General Santos', 'REGION 12', 'SOUTH COTABATO', 'GENERAL SANTOS CITY (DADIANGAS)'),
]
EXTRA = {  # other primary care providers named in the physician list
 'EMILIO B. RIVERA PRIMARY CARE CENTERS, INC. - SANTO TOMAS': ('REGION 4-A', 'BATANGAS', 'SANTO TOMAS'),
 'MASBATE MMG PRIMARY CARE FACILITY': ('REGION 5', 'MASBATE', 'MASBATE CITY'),
 "SPECIALISTS' PRIMARY CARE OF ILANG, INC.": ('REGION 11', 'DAVAO DEL SUR', 'DAVAO CITY'),
}
byname = collections.defaultdict(list)
for i, f in enumerate(fac): byname[norm(f[0])].append(i)
pccidx = {}
for key, name, r, p, c in PCC:
    j = next((i for i, f in enumerate(fac) if f[1] == 'P' and f[0] == name), None)
    if j is None:
        fac.append([name, 'P', reg(r), p, c]); j = len(fac) - 1
    if key:
        for pre in ('PRIMARY CARE CLINIC - ', 'PRIMARY CARE CENTER - '):
            pccidx[norm(pre + key)] = j
for k, (r, p, c) in EXTRA.items():
    fac.append([k.title(), 'C', reg(r), p, c]); byname[norm(k)].append(len(fac) - 1)
specs, docs, miss = [], {}, collections.Counter()
SHEET = {'Region 4-A': 'REGION 4-A', 'Region 4-B': 'REGION 4-B'}
wb = openpyxl.load_workbook(f'{src}/Maxicare_List of Accredited Physician_Sep2026.xlsx', read_only=True)
for ws in wb.worksheets:
    sreg = ws.title.upper()
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r[0] or not r[3]: continue
        n = norm(r[3])
        hits = [pccidx[n]] if n in pccidx else byname.get(n, [])
        if len(hits) > 1:
            same = [i for i in hits if regions[fac[i][2]] == sreg]
            hits = same or hits
        if not hits: miss[clean(r[3]).upper()] += 1; continue
        sp = clean(r[1]).upper() or 'GENERAL PRACTICE'
        if sp not in specs: specs.append(sp)
        key = (clean(r[0]).upper(), sp)
        d = docs.setdefault(key, [key[0], specs.index(sp), clean(r[2]).upper(), set()])
        d[3].update(hits)
doclist = [[d[0], d[1], d[2], sorted(d[3])] for d in docs.values()]
json.dump({'asOf': 'Sep 2026', 'regions': regions, 'f': fac}, open(f'{out}/providers.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump({'asOf': 'Sep 2026', 'specs': specs, 'd': doclist}, open(f'{out}/doctors.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('facilities', len(fac), 'doctors', len(doclist), 'specs', len(specs), 'unmatched rows', sum(miss.values()))
print(miss.most_common(8))
