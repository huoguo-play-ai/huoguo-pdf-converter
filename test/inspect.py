import sys, zipfile, json, hashlib
from xml.etree import ElementTree as E
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
with zipfile.ZipFile(sys.argv[1]) as z:
    r=E.fromstring(z.read('word/document.xml'))
    footer=[E.fromstring(z.read(f)) for f in z.namelist() if f.startswith('word/footer') and f.endswith('.xml')]
    count=lambda k: len(list(r.iter(W+k)))
    print(json.dumps(dict(pages=1+count('pageBreakBefore'),paragraphs=count('p'),tables=count('tbl'),textboxes=count('txbxContent'),anchors=len(r.findall('.//{*}anchor')),columns=sum(c.get(W+'num')=='2' for c in r.iter(W+'cols')),text=hashlib.sha256(json.dumps([''.join(t.text or '' for t in p.iter(W+'t')) for part in [r,*footer] for p in part.iter(W+'p')],ensure_ascii=False).encode()).hexdigest(),tabs=count('tabs'),shading=count('shd'),borders=count('pBdr'),hanging=sum(W+'hanging' in e.attrib for e in r.iter(W+'ind')),fields=' '.join(e.get(W+'instr').strip() for f in footer for e in f.iter(W+'fldSimple')))))

