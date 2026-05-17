"""Login to elder serve via CDP."""
import socket, json, time, struct, base64, os, urllib.request

def connect():
    resp = urllib.request.urlopen('http://localhost:9222/json', timeout=3)
    pages = json.loads(resp.read().decode())
    page = next((p for p in pages if p.get('url','').startswith('http') and p.get('visible')), pages[0])
    path = '/' + page['webSocketDebuggerUrl'].split('/', 3)[-1]
    print(f'Connected to page: {page["id"]}')

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect(('localhost', 9222))
    key = base64.b64encode(os.urandom(16)).decode()
    req = f'GET {path} HTTP/1.1\r\nHost: localhost:9222\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'
    sock.sendall(req.encode())
    resp = b''
    while b'\r\n\r\n' not in resp: resp += sock.recv(4096)
    return sock

def ws_send(sock, text):
    data = text.encode('utf-8')
    frame = bytearray()
    frame.append(0x81)
    mask_key = os.urandom(4)
    if len(data) < 126:
        frame.append(0x80 | len(data))
    elif len(data) < 65536:
        frame.append(0x80 | 126)
        frame.extend(struct.pack('>H', len(data)))
    frame.extend(mask_key)
    masked = bytearray(data)
    for i in range(len(masked)): masked[i] ^= mask_key[i % 4]
    frame.extend(masked)
    sock.sendall(bytes(frame))

def ws_recv(sock, timeout=5):
    sock.settimeout(timeout)
    try:
        head = sock.recv(2)
        if len(head) < 2: return None
        length = head[1] & 0x7F
        if length == 126: length = struct.unpack('>H', sock.recv(2))[0]
        elif length == 127: length = struct.unpack('>Q', sock.recv(8))[0]
        total = b''
        while len(total) < length:
            chunk = sock.recv(length - len(total))
            if not chunk: break
            total += chunk
        return total.decode('utf-8')
    except socket.timeout: return None

def drain(sock):
    msgs = []
    while True:
        r = ws_recv(sock, 0.5)
        if not r: break
        msgs.append(r)
    return msgs

def cdp_eval(sock, code):
    mid = int(time.time() * 1000) % 100000 + 1000
    ws_send(sock, json.dumps({'id': mid, 'method': 'Runtime.evaluate', 'params': {'expression': code, 'returnByValue': True, 'awaitPromise': True}}))
    deadline = time.time() + 8
    while time.time() < deadline:
        r = ws_recv(sock, 2)
        if not r: continue
        try:
            obj = json.loads(r)
            if obj.get('id') == mid:
                val = obj.get('result', {}).get('result', {}).get('value')
                if val is None and 'exceptionDetails' in obj.get('result', {}):
                    return '[exception] ' + json.dumps(obj['result']['exceptionDetails'], ensure_ascii=False)[:500]
                return val
        except: pass
    return None

def login(username, password):
    sock = connect()

    # Enable Runtime
    ws_send(sock, json.dumps({'id': 1, 'method': 'Runtime.enable'}))
    time.sleep(0.5)
    drain(sock)

    # Check page
    title = cdp_eval(sock, 'document.title')
    print(f'Title: {title}')

    # Set localStorage and reload so JS reads the correct institutionId
    r = cdp_eval(sock, "localStorage.setItem('elderInstitutionId', 'test-elderserve'); 'OK'")
    print(f'Set localStorage: {r}')
    cdp_eval(sock, 'location.reload()')
    print('Reloading...')
    time.sleep(3)

    # Detect login form
    is_login = cdp_eval(sock, "!!document.querySelector('input[name=username]')")
    print(f'Login form visible: {is_login}')

    if is_login:
        # Fill form
        cdp_eval(sock, "var el=document.querySelector('input[name=username]'); el.value='" + username + "'; el.dispatchEvent(new Event('input',{bubbles:true}))")
        cdp_eval(sock, "var el=document.querySelector('input[name=password]'); el.value='" + password + "'; el.dispatchEvent(new Event('input',{bubbles:true}))")
        print('Form filled')

        # Click login
        cdp_eval(sock, "var el=document.querySelector('.login-form__submit'); if(el) el.click()")
        print('Login clicked, waiting...')
        time.sleep(5)

        # Check result
        title = cdp_eval(sock, 'document.title')
        route = cdp_eval(sock, "window.__STATE__ ? window.__STATE__.ui.route : 'no state'")
        ident = cdp_eval(sock, "window.__STATE__ ? window.__STATE__.session.identity : 'no state'")
        inst_name = cdp_eval(sock, "window.__STATE__ ? window.__STATE__.institution.name : 'no state'")
        print(f'Title: {title}')
        print(f'Route: {route}')
        print(f'Identity: {ident}')
        print(f'Institution: {inst_name}')

    sock.close()

if __name__ == '__main__':
    import sys
    user = sys.argv[1] if len(sys.argv) > 1 else 'test_director'
    pwd = sys.argv[2] if len(sys.argv) > 2 else 'test123456'
    login(user, pwd)
