import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

const workbookPath = "data/import/cod_dynasty_historical_player_ratings_v2_fixed.xlsx";
const outPath = "src/data/historicalPlayerRatings.js";
const py = String.raw`
import json, zipfile, xml.etree.ElementTree as ET, re, sys
p=sys.argv[1]
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def colnum(cell):
 m=re.match(r'([A-Z]+)',cell); n=0
 for ch in m.group(1): n=n*26+ord(ch)-64
 return n-1
def slug(v):
 return re.sub(r'^_+|_+$','',re.sub(r'[^a-z0-9]+','_',str(v or '').lower()))
def split_traits(v):
 if not v: return []
 return [x.strip() for x in re.split(r'[;,|]', str(v)) if x.strip()]
with zipfile.ZipFile(p) as z:
 ss=[]
 root=ET.fromstring(z.read('xl/sharedStrings.xml'))
 for si in root.findall(NS+'si'):
  ss.append(''.join(t.text or '' for t in si.iter(NS+'t')))
 relroot=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
 rels={r.attrib['Id']:r.attrib['Target'] for r in relroot}
 wb=ET.fromstring(z.read('xl/workbook.xml'))
 sheet_path=None
 for s in wb.find(NS+'sheets'):
  if s.attrib.get('name')=='Game Ready Ratings':
   rid=s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
   target=rels[rid]
   sheet_path=target.lstrip('/') if target.startswith('/xl/') else 'xl/'+target
 if not sheet_path: raise SystemExit('missing Game Ready Ratings')
 sh=ET.fromstring(z.read(sheet_path))
 rows=[]
 for r in sh.iter(NS+'row'):
  vals=[]
  for c in r.findall(NS+'c'):
   i=colnum(c.attrib['r']); vals += ['']*(i-len(vals)+1)
   v=c.find(NS+'v'); val='' if v is None else v.text
   if c.attrib.get('t')=='s' and val!='': val=ss[int(val)]
   vals[i]=val
  rows.append(vals)
 h=rows[0]
 attrs=['gunny','awareness','objective','sndIQ','clutch','teamwork','composure','adaptability','pace','movement','consistency','leadership','workRate']
 out={}
 for row in rows[1:]:
  d=dict(zip(h,row+['']*(len(h)-len(row))))
  era=slug(d.get('eraId'))
  pid=slug(d.get('playerId') or d.get('displayName'))
  if not era or not pid: continue
  rec={
   'eraId':era,'gameTitle':d.get('gameTitle') or '', 'playerId':pid, 'displayName':d.get('displayName') or '',
   'aliases': split_traits(d.get('aliases')), 'teamName':d.get('teamName') or '', 'role':d.get('role') or 'Unknown',
   'overall': int(float(d.get('overall') or 74)), 'potential': int(float(d.get('potential') or 76)),
   'attributes': {a:int(float(d.get(a) or 74)) for a in attrs},
   'personalityTraits': split_traits(d.get('personalityTraits')), 'eraFitTraits': split_traits(d.get('eraFitTraits')),
   'confidence': d.get('confidence') or 'Medium', 'researchNotes': d.get('researchNotes') or '', 'sourceLinks': d.get('sourceLinks') or ''}
  out.setdefault(era,{})[pid]=rec
 print(json.dumps(out,ensure_ascii=False,indent=2))
`;
const data = execFileSync("python", ["-c", py, workbookPath], { encoding: "utf8", maxBuffer: 50_000_000 });
const js = `// src/data/historicalPlayerRatings.js\n// Generated from ${workbookPath}#Game Ready Ratings.\n// Do not manually re-rate players here; update the workbook and regenerate.\n\nexport const HISTORICAL_PLAYER_RATINGS = ${data.trim()};\n\nexport const HISTORICAL_RATING_ATTRIBUTES = [\n  "gunny", "awareness", "objective", "sndIQ", "clutch", "teamwork", "composure",\n  "adaptability", "pace", "movement", "consistency", "leadership", "workRate",\n];\n\nexport function normalizeHistoricalRatingKey(value) {\n  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");\n}\n\nexport function getEraRatings(eraId) {\n  return HISTORICAL_PLAYER_RATINGS[normalizeHistoricalRatingKey(eraId)] || {};\n}\n\nexport function getHistoricalPlayerRating(eraId, playerId) {\n  return getEraRatings(eraId)[normalizeHistoricalRatingKey(playerId)] || null;\n}\n\nexport function getHistoricalPlayerRatingByName(eraId, displayName) {\n  const key = normalizeHistoricalRatingKey(displayName);\n  const ratings = Object.values(getEraRatings(eraId));\n  return ratings.find(r => normalizeHistoricalRatingKey(r.displayName) === key || (r.aliases || []).some(a => normalizeHistoricalRatingKey(a) === key)) || null;\n}\n\nexport function getPlayerEraOverall(eraId, playerId) {\n  return getHistoricalPlayerRating(eraId, playerId)?.overall ?? null;\n}\n\nexport function getPlayerEraPotential(eraId, playerId) {\n  return getHistoricalPlayerRating(eraId, playerId)?.potential ?? null;\n}\n\nexport function createFallbackHistoricalRating(eraId, playerId, displayName, teamName = "") {\n  const attributes = Object.fromEntries(HISTORICAL_RATING_ATTRIBUTES.map(key => [key, 74]));\n  return { eraId: normalizeHistoricalRatingKey(eraId), gameTitle: "", playerId: normalizeHistoricalRatingKey(playerId || displayName), displayName: displayName || playerId || "Unknown", aliases: [], teamName, role: "Unknown", overall: 74, potential: 76, attributes, personalityTraits: [], eraFitTraits: [], confidence: "Low", researchNotes: "Missing from ratings workbook", sourceLinks: "" };\n}\n`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, js);
console.log(`Wrote ${outPath}`);
