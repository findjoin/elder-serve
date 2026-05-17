"""Helper script for CDP testing."""
import sys, time, json
sys.path.insert(0, '.')
from scripts.cdp_raw import ws_connect, cdp_send, cdp_recv, cdp_eval, cdp_click, cdp_type

PAGE_ID = "44D51D05C9FCCBC6F8FEEA024B6DF98F"

def connect():
    sock = ws_connect('localhost', 9222, '/devtools/page/' + PAGE_ID)
    cdp_send(sock, 'Runtime.enable')
    time.sleep(0.2)
    return sock

def detect_page(sock):
    return cdp_eval(sock, """
(function() {
    if (document.querySelector('.login-form__submit')) return 'login';
    var h1 = document.querySelector('h1');
    if (h1) return 'page:' + h1.textContent.trim().substring(0,30);
    return 'unknown';
})()
""")

def nav_director_people(sock):
    return cdp_eval(sock, 'var el=document.querySelector("[data-route=\'director-people\']");if(el){el.click();return"clicked"}return"not found"')

def get_personnel_rows(sock):
    return cdp_eval(sock, "JSON.stringify(document.querySelectorAll('[data-caregiver-id]').length)")

def get_caregiver_row_text(sock):
    return cdp_eval(sock, """
(function() {
    var rows = document.querySelectorAll('[data-caregiver-id]');
    var texts = [];
    for (var i = 0; i < rows.length; i++) {
        texts.push(rows[i].textContent.replace(/\\s+/g, ' ').trim().substring(0, 120));
    }
    return JSON.stringify(texts);
})()
""")

def click_add_caregiver(sock):
    return cdp_eval(sock, 'var el=document.querySelector("[data-action=\'add-caregiver\']");if(el){el.click();return"clicked "+el.textContent.trim()}return"not found"')

def get_personnel_tab(sock):
    return cdp_eval(sock, 'var el=document.querySelector("[data-tab=\'personnel-caregiver\']");if(el){el.click();return"clicked"}return"not found"')

def fill_form(sock):
    # Fill the caregiver form
    results = []
    r1 = cdp_eval(sock, """
(function() {
    var nameEl = document.querySelector('[data-personnel-form="caregiver"] [name="name"]');
    if (!nameEl) return 'name field not found';
    nameEl.value = '李秀英';
    nameEl.dispatchEvent(new Event('input', {bubbles: true}));
    return 'filled name';
})()
""")
    results.append(r1)

    r2 = cdp_eval(sock, """
(function() {
    var floorEl = document.querySelector('[data-personnel-form="caregiver"] [name="floor"]');
    if (!floorEl) return 'floor field not found';
    floorEl.value = '2';
    floorEl.dispatchEvent(new Event('input', {bubbles: true}));
    return 'filled floor';
})()
""")
    results.append(r2)

    r3 = cdp_eval(sock, """
(function() {
    var userEl = document.querySelector('[data-personnel-form="caregiver"] [name="username"]');
    if (!userEl) return 'username field not found';
    userEl.value = 'lixiuying';
    userEl.dispatchEvent(new Event('input', {bubbles: true}));
    return 'filled username';
})()
""")
    results.append(r3)

    r4 = cdp_eval(sock, """
(function() {
    var pwdEl = document.querySelector('[data-personnel-form="caregiver"] [name="password"]');
    if (!pwdEl) return 'password field not found';
    pwdEl.value = 'test123456';
    pwdEl.dispatchEvent(new Event('input', {bubbles: true}));
    return 'filled password';
})()
""")
    results.append(r4)

    return ' | '.join(results)

def click_save(sock):
    return cdp_eval(sock, 'var el=document.querySelector("[data-action=\'save-personnel-draft\']");if(el){el.click();return"clicked"}return"not found"')

def get_page_text(sock):
    return cdp_eval(sock, 'document.body.innerText.substring(0, 2000)')

if __name__ == "__main__":
    sock = connect()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "page"

    if cmd == "page":
        print(detect_page(sock))
    elif cmd == "nav-people":
        print(nav_director_people(sock))
        time.sleep(1)
        print("Page:", detect_page(sock))
    elif cmd == "caregiver-tab":
        print(get_personnel_tab(sock))
        time.sleep(0.5)
    elif cmd == "caregiver-rows":
        print("Row count:", get_personnel_rows(sock))
        print("Rows:", get_caregiver_row_text(sock))
    elif cmd == "add-caregiver":
        print(click_add_caregiver(sock))
    elif cmd == "fill-form":
        print(fill_form(sock))
    elif cmd == "save":
        print(click_save(sock))
        time.sleep(3)
        print("Page after save:", detect_page(sock))
    elif cmd == "text":
        print(get_page_text(sock))
    elif cmd == "eval":
        code = sys.argv[2]
        result = cdp_eval(sock, code)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif cmd == "full-test":
        # Navigate to personnel
        print("1. Nav to personnel:", nav_director_people(sock))
        time.sleep(1)
        # Go to caregiver tab
        print("2. Caregiver tab:", get_personnel_tab(sock))
        time.sleep(0.5)
        # Get current count
        print("3. Current caregivers:", get_personnel_rows(sock))
        # Click add
        print("4. Add button:", click_add_caregiver(sock))
        time.sleep(0.5)
        # Fill form
        print("5. Fill form:", fill_form(sock))
        # Save
        print("6. Save:", click_save(sock))
        time.sleep(4)
        # Check result
        print("7. After save - caregivers:", get_personnel_rows(sock))
        print("8. Rows:", get_caregiver_row_text(sock))

    sock.close()
