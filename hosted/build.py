#!/usr/bin/env python3
"""Builds the app.ask-karla.com upload folder from the app page published on claude.ai.
Usage: python3 hosted/build.py <app page .html> <folder with the artifact's published files> <out dir>
- the app's own <script> tags become type="text/z1-app" so shim.js runs them after sign-in
- config.js, the Supabase client, shim.js go first in <head>; sw.js, .htaccess and the published files are copied
"""
import os, re, shutil, sys

src, files, out = sys.argv[1], sys.argv[2], sys.argv[3]
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
html = open(src, encoding="utf-8").read()

# claude.ai wraps the page in its own skeleton; keep what's inside <body>
m = re.match(r'(?s)<!doctype html><html><head>.*?</head><body>\n?(.*)</body></html>\s*$', html)
body = m.group(1) if m else html

# Walk the real <script> tags only: the text after each opening tag up to its </script> is skipped, so
# "<script>" inside JS strings or inside the embedded office page (type="text/plain") is left alone.
out_parts, i, count, deferred = [], 0, 0, 0
tag_re, end_re = re.compile(r'<script\b[^>]*>', re.I), re.compile(r'</script\s*>', re.I)
while True:
    mt = tag_re.search(body, i)
    if not mt:
        out_parts.append(body[i:]); break
    tag = mt.group(0); count += 1
    me = end_re.search(body, mt.end())
    if not me: raise SystemExit("unclosed <script> at %d" % mt.start())
    is_js = not re.search(r'\btype\s*=', tag) or re.search(r'type\s*=\s*"(text/javascript|module)"', tag)
    if is_js and not re.search(r'\bsrc\s*=', tag):
        tag = '<script type="text/z1-app">'; deferred += 1
    out_parts.append(body[i:mt.start()] + tag + body[mt.end():me.end()])
    i = me.end()
body = "".join(out_parts)

head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="robots" content="noindex,nofollow">'
        '<style>body{margin:0}[hidden]:not([hidden=until-found i]){display:none!important}img{max-width:100%}</style>'
        '<script src="config.js"></script><script src="supabase.js"></script><script src="shim.js"></script>'
        '</head><body>\n')
os.makedirs(out, exist_ok=True)
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(head + body + "</body></html>\n")
for f in ("shim.js", "sw.js"):
    shutil.copy(os.path.join(here, f), os.path.join(out, f))
if not os.path.exists(os.path.join(out, "config.js")):
    shutil.copy(os.path.join(here, "config.js"), os.path.join(out, "config.js"))
shutil.copy(os.path.join(root, "node_modules/@supabase/supabase-js/dist/umd/supabase.js"), os.path.join(out, "supabase.js"))
open(os.path.join(out, ".htaccess"), "w").write(
    "RewriteEngine On\nRewriteCond %{HTTPS} !=on\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]\n"
    "Header always set Strict-Transport-Security \"max-age=31536000\"\nHeader always set X-Content-Type-Options nosniff\n"
    "Header always set Referrer-Policy strict-origin-when-cross-origin\nHeader always set X-Frame-Options SAMEORIGIN\n"
    "<FilesMatch \"^(index\\.html|shim\\.js|sw\\.js|config\\.js)$\">\n  Header set Cache-Control \"no-cache\"\n</FilesMatch>\n")
for dirpath, _, names in os.walk(files):
    for n in names:
        p = os.path.join(dirpath, n); rel = os.path.relpath(p, files)
        if rel == "index.html": continue
        os.makedirs(os.path.dirname(os.path.join(out, rel)), exist_ok=True)
        shutil.copy(p, os.path.join(out, rel))
print(f"{deferred} of {count} scripts deferred; wrote {out}")
