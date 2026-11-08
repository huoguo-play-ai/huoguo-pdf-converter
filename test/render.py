from pathlib import Path
from subprocess import run, check_output
from shutil import which
import os, re, sys
from xml.sax.saxutils import escape
root=Path(__file__).resolve().parents[1]
out=root/'test-output'
lo=which('soffice')
if not lo:
    print('跳过渲染：未安装 LibreOffice。')
    raise SystemExit
render=out/'渲染'
render.mkdir(exist_ok=True)
env=os.environ.copy()
if sys.platform=='darwin':
    dirs=[Path('/System/Library/Fonts'),Path('/System/Library/Fonts/Supplemental'),Path('/Library/Fonts')]
    dirs.extend(p.parent for p in Path('/System/Library/AssetsV2').glob('com_apple_MobileAsset_Font*/*.asset/AssetData/PingFang.ttc'))
    conf=render/'fonts.conf'
    conf.write_text('<fontconfig>'+''.join('<dir>'+escape(str(p))+'</dir>' for p in dirs)+'<cachedir>'+escape(str(render/'font-cache'))+'</cachedir></fontconfig>')
    env.update(FONTCONFIG_FILE=str(conf),SAL_FONTPATH_PRIVATE=os.pathsep.join(map(str,dirs)))
run([lo,'-env:UserInstallation='+(render/'lo-profile').as_uri(),'--headless','--convert-to','pdf','--outdir',str(render),*map(str,sorted(out.glob('*.docx')))],check=True,env=env)
for f in sorted(out.glob('*.docx')):
    original=root.parent/'claude-python-version'/'测试样本'/(f.stem+'.pdf')
    result=render/(f.stem+'.pdf')
    def count(pdf):
        return int(re.search(rb'Pages:\s+(\d+)',check_output(['pdfinfo',pdf])).group(1))
    a,b=count(original),count(result)
    print(f.stem,'原稿',a,'转换后',b,flush=True)
    for i in range(1,max(a,b)+1):
        imgs=[]
        for label,pdf,n in [('原稿',original,a),('转换后',result,b)]:
            prefix=render/(f.stem+'-'+str(i)+'-'+label)
            if i<=n:
                run(['pdftoppm','-f',str(i),'-l',str(i),'-r','85','-png','-singlefile',pdf,prefix],check=True)
                imgs.append(str(prefix)+'.png')
            else:
                imgs.extend(['-size','703x994','xc:white'])
        run(['magick',*imgs,'+append',render/(f.stem+'-第'+str(i)+'页-对比.png')],check=True)

