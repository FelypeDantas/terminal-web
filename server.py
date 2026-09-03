import os, json, mimetypes, urllib.parse, html
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"

# Optional roots. If empty, the UI can receive any path the Windows account can access.
ROOTS = [
    {"name": "Este computador", "path": str(Path.home().anchor or "C:\\")}
]

def safe_stat(path):
    try: return os.stat(path)
    except: return None

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(BASE),**kwargs)

    def send_json(self,obj,status=200):
        data=json.dumps(obj,ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        u=urllib.parse.urlsplit(self.path)
        if u.path=="/api/roots":
            return self.send_json({"roots":ROOTS})
        if u.path=="/api/list":
            p=urllib.parse.unquote(urllib.parse.parse_qs(u.query).get("path",[""])[0])
            if not p: p=Path.home().anchor or os.getcwd()
            try:
                p=os.path.abspath(p)
                if not os.path.isdir(p): raise ValueError("Pasta não encontrada ou sem acesso.")
                items=[]
                with os.scandir(p) as it:
                    for e in it:
                        try:
                            st=e.stat(follow_symlinks=False)
                            typ="folder" if e.is_dir(follow_symlinks=False) else "file"
                            items.append({"name":e.name,"path":e.path,"type":typ,"modified":st.st_mtime})
                        except OSError: pass
                items.sort(key=lambda x:(x["type"]!="folder",x["name"].lower()))
                root=os.path.splitdrive(p)[0]+os.sep if os.path.splitdrive(p)[0] else os.path.dirname(p) or p
                return self.send_json({"path":p,"root":root,"items":items})
            except Exception as e: return self.send_json({"error":str(e)},400)
        if u.path=="/api/up":
            p=urllib.parse.unquote(urllib.parse.parse_qs(u.query).get("path",[""])[0])
            return self.send_json({"path":os.path.dirname(os.path.abspath(p)) or p})
        return super().do_GET()

    def do_POST(self):
        u=urllib.parse.urlsplit(self.path)
        if u.path=="/api/mkdir":
            try:
                n=int(self.headers.get("Content-Length","0")); body=json.loads(self.rfile.read(n))
                parent=os.path.abspath(body["path"]); name=body["name"].strip()
                if not name or name in {".",".."} or any(x in name for x in '<>:"/\\|?*'):
                    raise ValueError("Nome de pasta inválido.")
                target=os.path.join(parent,name)
                os.mkdir(target)
                return self.send_json({"ok":True,"path":target})
            except Exception as e:return self.send_json({"error":str(e)},400)
        return self.send_json({"error":"Rota não encontrada"},404)

if __name__=="__main__":
    print("Explorer+ rodando em http://127.0.0.1:8765")
    print("Feche esta janela para encerrar.")
    ThreadingHTTPServer(("127.0.0.1",8765),Handler).serve_forever()
