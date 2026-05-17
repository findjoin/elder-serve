"""Raw WebSocket CDP client for Android WebView."""
import socket, json, time, sys, struct, hashlib, base64, os

WS_KEY = base64.b64encode(os.urandom(16)).decode()
_MSG_ID = [0]

def _next_id():
    _MSG_ID[0] += 1
    return _MSG_ID[0]

def ws_connect(host, port, path):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((host, port))
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {WS_KEY}\r\n"
        f"Sec-WebSocket-Version: 13\r\n"
        f"\r\n"
    )
    sock.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += sock.recv(4096)
    if b"101" not in resp:
        raise Exception(f"Handshake failed: {resp.decode()}")
    return sock

def ws_send(sock, text):
    data = text.encode("utf-8")
    frame = bytearray()
    frame.append(0x81)  # text FIN
    mask_key = os.urandom(4)
    if len(data) < 126:
        frame.append(0x80 | len(data))
    elif len(data) < 65536:
        frame.append(0x80 | 126)
        frame.extend(struct.pack(">H", len(data)))
    else:
        frame.append(0x80 | 127)
        frame.extend(struct.pack(">Q", len(data)))
    frame.extend(mask_key)
    masked = bytearray(data)
    for i in range(len(masked)):
        masked[i] ^= mask_key[i % 4]
    frame.extend(masked)
    sock.sendall(bytes(frame))

def ws_recv(sock, timeout=5):
    sock.settimeout(timeout)
    try:
        head = sock.recv(2)
        if len(head) < 2: return None
        opcode = head[0] & 0x0F
        masked = head[1] & 0x80
        length = head[1] & 0x7F
        if length == 126:
            length = struct.unpack(">H", sock.recv(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", sock.recv(8))[0]
        if masked:
            mask_key = sock.recv(4)
            payload = bytearray(sock.recv(length))
            for i in range(len(payload)):
                payload[i] ^= mask_key[i % 4]
            return bytes(payload).decode("utf-8")
        else:
            return sock.recv(length).decode("utf-8")
    except socket.timeout:
        return None

def cdp_send(sock, method, params=None, msg_id=None):
    if msg_id is None:
        msg_id = _next_id()
    msg = {"id": msg_id, "method": method}
    if params: msg["params"] = params
    ws_send(sock, json.dumps(msg))
    return msg_id

def cdp_recv(sock, msg_id, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        raw = ws_recv(sock, max(0.1, deadline - time.time()))
        if not raw: continue
        try:
            r = json.loads(raw)
            if r.get("id") == msg_id:
                return r
        except: pass
    return None

def cdp_eval(sock, code):
    msg_id = cdp_send(sock, "Runtime.evaluate", {"expression": code, "returnByValue": True, "awaitPromise": True})
    r = cdp_recv(sock, msg_id, 5)
    if r and "result" in r.get("result", {}):
        return r["result"]["result"].get("value")
    return r

def _json_str(s):
    return json.dumps(s)

def cdp_click(sock, selector):
    return cdp_eval(sock, f"var el=document.querySelector({_json_str(selector)});if(el)el.click();!!el")

def cdp_type(sock, selector, text):
    return cdp_eval(sock, f"var el=document.querySelector({_json_str(selector)});if(!el){{'not found'}}else{{el.value={_json_str(text)};el.dispatchEvent(new Event('input',{{bubbles:true}}));'typed'}}")

def cdp_nav(sock, route):
    return cdp_eval(sock, f"""
    (function() {{
        var el = document.querySelector('[data-route="{route}"]');
        if (el) {{ el.click(); return 'navigated to {route}'; }}
        return 'nav not found: {route}';
    }})()
    """)

def cdp_detect_page(sock):
    return cdp_eval(sock, """
    (function() {
        if (document.querySelector('.login-form__submit')) return 'login';
        var nav = document.querySelectorAll('[data-route]');
        var active = '';
        for (var i=0; i<nav.length; i++) {
            if (nav[i].classList.contains('is-active') || nav[i].classList.contains('active')) {
                active = nav[i].getAttribute('data-route') || '';
            }
        }
        if (active) return active;
        var h1 = document.querySelector('h1, .page-title, [class*="title"]');
        if (h1) return 'page:' + h1.textContent.trim().substring(0,30);
        return 'unknown';
    })()
    """)

def cdp_get_identity(sock):
    return cdp_eval(sock, """
    (function() {
        var navTexts = document.querySelectorAll('[data-route]');
        var labels = [];
        for (var i=0; i<navTexts.length; i++) labels.push(navTexts[i].textContent.trim());
        var joined = labels.join(',');
        if (joined.includes('任务中心')) return 'caregiver';
        if (joined.includes('总览')) return 'director';
        if (joined.includes('首页') && joined.includes('健康')) return 'family';
        return joined || 'unknown';
    })()
    """)

def _discover_target():
    import urllib.request
    try:
        resp = urllib.request.urlopen("http://localhost:9222/json", timeout=3)
        pages = json.loads(resp.read().decode())
        for p in pages:
            if p.get("url", "").startswith("http"):
                return p["id"]
    except:
        pass
    return "44D51D05C9FCCBC6F8FEEA024B6DF98F"

if __name__ == "__main__":
    target_id = _discover_target()
    sock = ws_connect("localhost", 9222, f"/devtools/page/{target_id}")
    cdp_send(sock, "Runtime.enable")
    time.sleep(0.2)

    cmd = sys.argv[1] if len(sys.argv) > 1 else "page"

    if cmd == "page":
        title = cdp_eval(sock, "document.title")
        route = cdp_detect_page(sock)
        ident = cdp_get_identity(sock)
        print(f"Title: {title}")
        print(f"Route: {route}")
        print(f"Identity: {ident}")
    elif cmd == "eval":
        result = cdp_eval(sock, sys.argv[2])
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif cmd == "click":
        print(cdp_click(sock, sys.argv[2]))
    elif cmd == "type":
        print(cdp_type(sock, sys.argv[2], sys.argv[3]))
    elif cmd == "nav":
        print(cdp_nav(sock, sys.argv[2]))
    elif cmd == "login":
        user = sys.argv[2] if len(sys.argv) > 2 else "director01"
        pwd = sys.argv[3] if len(sys.argv) > 3 else "test123456"
        # Use correct selectors from loginPage.js
        r1 = cdp_type(sock, "input[name='username']", user)
        r2 = cdp_type(sock, "input[name='password']", pwd)
        r3 = cdp_click(sock, ".login-form__submit")
        print(f"Type user: {r1}, Type pwd: {r2}, Click login: {r3}")
        time.sleep(3)
        route = cdp_detect_page(sock)
        ident = cdp_get_identity(sock)
        print(f"After login -> Route: {route}, Identity: {ident}")
    elif cmd == "logout":
        r = cdp_eval(sock, """
        (function() {
            var btn = document.querySelector('[data-action="logout"]');
            if (!btn) {
                // Try profile page logout
                var btns = document.querySelectorAll('button');
                for (var i=0; i<btns.length; i++) {
                    if (btns[i].textContent.includes('退出')) { btns[i].click(); return 'clicked logout'; }
                }
                // Navigate to profile first
                var prof = document.querySelector('[data-route$="profile"]');
                if (prof) { prof.click(); return 'navigated to profile'; }
                return 'no logout found';
            }
            btn.click(); return 'clicked logout';
        })()
        """)
        print(f"Logout: {r}")
        time.sleep(2)
        route = cdp_detect_page(sock)
        print(f"After logout -> Route: {route}")
    elif cmd == "get_text":
        print(cdp_eval(sock, f"(document.querySelector('{sys.argv[2]}')||{{}}).textContent||'(not found)'"))
    elif cmd == "screenshot_text":
        print(cdp_eval(sock, "document.body.innerText.substring(0,1000)"))

    sock.close()
