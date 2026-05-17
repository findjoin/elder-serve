"""Evaluate JS in Android WebView via CDP WebSocket."""
import json, sys, time, urllib.request
from websocket import create_connection

def _discover_ws():
    try:
        resp = urllib.request.urlopen("http://localhost:9222/json", timeout=3)
        pages = json.loads(resp.read().decode())
        for p in pages:
            if p.get("url", "").startswith("http"):
                return p["webSocketDebuggerUrl"]
    except: pass
    return "ws://localhost:9222/devtools/page/44D51D05C9FCCBC6F8FEEA024B6DF98F"

WS = _discover_ws()

def send(ws, method, params=None):
    msg = {"id": int(time.time()*1000), "method": method}
    if params: msg["params"] = params
    ws.send(json.dumps(msg))

def recv_until(ws, msg_id, timeout=5):
    ws.settimeout(timeout)
    while True:
        try:
            r = json.loads(ws.recv())
            if r.get("id") == msg_id:
                return r
        except: return None

def eval_js(ws, code):
    msg_id = int(time.time()*1000)
    send(ws, "Runtime.evaluate", {"expression": code, "returnByValue": True, "awaitPromise": True, "contextId": 1})
    r = recv_until(ws, msg_id)
    if r and "result" in r.get("result", {}):
        val = r["result"]["result"].get("value")
        return val
    return r

def click(ws, selector):
    return eval_js(ws, f"document.querySelector('{selector}').click(); 'clicked'")

def type_text(ws, selector, text):
    return eval_js(ws, f"var el=document.querySelector('{selector}');el.value='{text}';el.dispatchEvent(new Event('input',{{bubbles:true}}));'typed'")

def get_text(ws, selector):
    return eval_js(ws, f"(document.querySelector('{selector}')||{{}}).textContent||'(not found)'")

def get_inner(ws, selector):
    return eval_js(ws, f"document.querySelector('{selector}').innerHTML.substring(0,500)")

def wait_el(ws, selector, timeout=5):
    return eval_js(ws, f"""
    new Promise((resolve) => {{
        var el = document.querySelector('{selector}');
        if (el) {{ resolve('found'); return; }}
        var obs = new MutationObserver(() => {{
            if (document.querySelector('{selector}')) {{ obs.disconnect(); resolve('found'); }}
        }});
        obs.observe(document.body, {{childList:true,subtree:true}});
        setTimeout(() => {{ obs.disconnect(); resolve('timeout'); }}, {timeout*1000});
    }})
    """)

if __name__ == "__main__":
    ws = create_connection(WS, suppress_origin=True)
    send(ws, "Runtime.enable")
    send(ws, "Page.enable")
    time.sleep(0.2)

    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

    if cmd == "eval":
        print(json.dumps(eval_js(ws, sys.argv[2]), indent=2, ensure_ascii=False))
    elif cmd == "click":
        print(click(ws, sys.argv[2]))
    elif cmd == "type":
        print(type_text(ws, sys.argv[2], sys.argv[3]))
    elif cmd == "get_text":
        print(get_text(ws, sys.argv[2]))
    elif cmd == "get_html":
        print(get_inner(ws, sys.argv[2]))
    elif cmd == "wait":
        print(wait_el(ws, sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 5))
    elif cmd == "page":
        title = eval_js(ws, "document.title")
        route = eval_js(ws, "window.__STATE__ ? window.__STATE__.ui.route : 'N/A'")
        ident = eval_js(ws, "window.__STATE__ ? window.__STATE__.session.identity : 'N/A'")
        print(f"Title: {title}\nRoute: {route}\nIdentity: {ident}")
    elif cmd == "login":
        user = sys.argv[2] if len(sys.argv) > 2 else "director01"
        pwd = sys.argv[3] if len(sys.argv) > 3 else "test123456"
        print(type_text(ws, "#loginUsername", user))
        print(type_text(ws, "#loginPassword", pwd))
        print(click(ws, "#loginBtn"))
        time.sleep(3)
        print(get_text(ws, "body"))

    ws.close()
