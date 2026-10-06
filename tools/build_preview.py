# Собирает v9 в один самодостаточный HTML для превью-артефакта на claude.ai.
# Запуск из корня репо: python3 tools/build_preview.py <папка_вывода>  -> <папка>/claude-seven.html
import re,json,glob,base64,sys,os
out=os.path.join(sys.argv[1] if len(sys.argv)>1 else '.', 'claude-seven.html')
h=open('v9/index.html').read()
esc=lambda s:s.replace('</script','<\\/script')
mk=open('vendor/marked.min.js').read(); dn=open('v9/figures.js').read()
md={'../'+f:open(f).read() for f in sorted(glob.glob('content/*.md'))}
shim='const MD='+json.dumps(md,ensure_ascii=False)+';const _f=window.fetch.bind(window);window.fetch=(u,o)=>u in MD?Promise.resolve(new Response(MD[u])):_f(u,o);'
font='data:font/woff2;base64,'+base64.b64encode(open('fonts/LORE-Cyrillic.woff2','rb').read()).decode()
logo='data:image/svg+xml;base64,'+base64.b64encode(open('v9/claude-logo.svg','rb').read()).decode()
def rep(a,b):
    global h
    assert a in h,a[:50]; h=h.replace(a,b)
rep('src:url("../fonts/LORE-Cyrillic.woff2") format("woff2"), url("../fonts/LORE-Cyrillic.woff") format("woff");','src:url("'+font+'") format("woff2");')
rep('src="claude-logo.svg"','src="'+logo+'"')
rep('<script src="../vendor/marked.min.js"></script>','<script>'+esc(mk)+'</script>\n<script>'+esc(shim)+'</script>')
rep('<script src="../vendor/three.min.js"></script>','<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>')
rep('<script src="figures.js"></script>','<script>'+esc(dn)+'</script>')
h=re.sub(r'<link rel="icon"[^>]*>\n','',h)
h=h.replace('<title>Claude · ликбез</title>','<title>Claude · семь фигур</title>')
open(out,'w').write(h); print(out)
