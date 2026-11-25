"""Desktop/tablet review workflow; isolated DB and mocked providers, no API credits."""
import os
os.environ['SCHEDULER_ENABLED']='false'
import socket
import threading
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import uvicorn
from playwright.sync_api import sync_playwright, expect
from backend import storage
from backend.main import app

def fake_research(state):
    time.sleep(.15)
    score=10 if state['name'].startswith('Skip') else 88
    return dict(fit='Skip' if score==10 else 'Good fit',score=score,
                summary='Provides family dentistry. '+('Evidence that remains available in the full review. '*12),
                reason='Matches the target.' if score==88 else 'Outside target profile.',
                draft='Hello '+state['name']+' team. Can we discuss appointment follow-up?')

with TemporaryDirectory() as directory:
    original=storage.DB_PATH
    storage.DB_PATH=Path(directory)/'browser.sqlite3'
    sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    server=uvicorn.Server(uvicorn.Config(app,log_level='error'))
    thread=threading.Thread(target=lambda:server.run(sockets=[sock]),daemon=True)
    artifacts=Path('.setup-cache');artifacts.mkdir(exist_ok=True)
    with patch('backend.main.research_graph.invoke',side_effect=fake_research),patch('backend.main.firecrawl_search',return_value=[dict(name='Online Dental',location='Not verified',site='https://example.com')]):
        thread.start()
        for _ in range(100):
            if server.started:break
            time.sleep(.05)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--disable-gpu','--in-process-gpu'])
                page=browser.new_page(accept_downloads=True,viewport={'width':1440,'height':1000})
                page.set_default_timeout(10000)
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                base=f'http://127.0.0.1:{port}'
                page.goto(base)
                expect(page.locator('#connection')).to_contain_text('Connected')
                expect(page.locator('#mTotal')).to_have_text('0')
                theme=page.evaluate('({font:getComputedStyle(document.body).fontFamily,canvas:getComputedStyle(document.body).backgroundColor,sidebar:getComputedStyle(document.querySelector(".sidebar")).backgroundColor,summary:getComputedStyle(document.querySelector(".review-summary")).backgroundColor})')
                assert 'Instrument Sans' in theme['font'],theme
                assert theme['canvas']=='rgb(243, 245, 244)',theme
                assert theme['sidebar']=='rgb(17, 28, 36)',theme
                assert theme['summary']=='rgb(15, 61, 55)',theme
                page.evaluate('document.fonts.ready')
                loaded=page.evaluate('Array.from(document.fonts).some(f=>f.family.includes("Instrument Sans")&&f.status==="loaded")')
                print('Instrument Sans webfont loaded:',loaded)
                expect(page.locator('#leadRows')).to_contain_text('Find your first companies')
                page.locator('#source').select_option('csv')
                page.locator('#runBtn').click()
                expect(page.locator('#formError')).to_contain_text('Choose a CSV')
                page.locator('#csvFile').set_input_files({'name':'leads.csv','mimeType':'text/csv','buffer':b'company,location,website\nBright Dental,Texas,\nOak Dental,Texas,\nSkip Dental,Elsewhere,\n'})
                page.locator('#offer').fill('Appointment follow-up software')
                page.locator('#runBtn').click()
                expect(page.locator('#mTotal')).to_have_text('3',timeout=15000)
                expect(page.locator('#runBtn')).to_be_enabled(timeout=15000)
                assert not page.locator('#researchSetup').evaluate('(el)=>el.open')
                expect(page.locator('#leadRows tr')).to_have_count(3)
                assert 'Bright Dental' in page.locator('#leadRows tr').first.inner_text()
                page.locator('#fitFilter').select_option('Skip')
                expect(page.locator('#leadRows tr')).to_have_count(1)
                expect(page.locator('#leadRows')).to_contain_text('Awaiting review')
                page.locator('#fitFilter').select_option('all')
                page.locator('#sortBy').select_option('score-asc')
                assert 'Skip Dental' in page.locator('#leadRows tr').first.inner_text()
                page.locator('#sortBy').select_option('score-desc')
                page.screenshot(path=str(artifacts/'leadflow-desktop.png'),full_page=True)
                page.locator('#search').fill('Bright')
                page.locator('#selectAll').check();page.locator('#approveAll').click()
                expect(page.locator('#mApproved')).to_have_text('1')
                expect(page.locator('#leadRows')).to_contain_text('No matching companies')
                page.locator('[data-filter="approved"]').click()
                page.locator('[data-draft]').click()
                expect(page.locator('#modalbg')).to_be_visible()
                page.locator('#draftText').fill('A changed draft')
                expect(page.locator('#modalStatus')).to_contain_text('return this draft to review')
                expect(page.locator('#modalApprove')).to_be_disabled()
                page.locator('#saveDraft').click()
                expect(page.locator('#mApproved')).to_have_text('0')
                page.locator('[data-filter="review"]').click()
                page.locator('[data-evidence]').click()
                expect(page.locator('#evidenceTitle')).to_be_focused()
                # A failed save must preserve the text and expose a persistent inline error.
                page.route('**/api/leads/*',lambda route:route.fulfill(status=503,json={'detail':'Save temporarily unavailable'}) if route.request.method=='PATCH' else route.continue_())
                page.locator('#draftText').fill('Keep this edit after a failed save')
                page.locator('#saveDraft').click()
                expect(page.locator('#drawerError')).to_contain_text('Save temporarily unavailable')
                expect(page.locator('#draftText')).to_have_value('Keep this edit after a failed save')
                page.unroute('**/api/leads/*')
                page.screenshot(path=str(artifacts/'leadflow-drawer.png'))
                # Native modal dialog contains keyboard focus and restores it on Escape.
                for _ in range(10):
                    page.keyboard.press('Tab')
                    assert page.evaluate('document.querySelector("dialog").contains(document.activeElement)')
                page.keyboard.press('Escape')
                expect(page.locator('[data-draft]')).to_be_focused()
                page.locator('[data-draft]').click();page.locator('#modalApprove').click()
                expect(page.locator('#mApproved')).to_have_text('1')
                page.locator('[data-filter="approved"]').click()
                page.locator('#selectAll').check();page.locator('#sendDemo').click()
                page.locator('[data-filter="sent"]').click()
                expect(page.locator('#leadRows')).to_contain_text('Demo sent')
                page.reload();expect(page.locator('#mTotal')).to_have_text('3')
                page.locator('[data-filter="sent"]').click();expect(page.locator('#leadRows tr')).to_have_count(1)
                page.locator('[data-draft]').click()
                expect(page.locator('#draftText')).to_be_disabled()
                page.keyboard.press('Escape')
                for width in [1024,768,390]:
                    page.set_viewport_size({'width':width,'height':900})
                    if not page.evaluate('document.documentElement.scrollWidth <= innerWidth'):
                        page.screenshot(path=str(artifacts/'leadflow-overflow.png'),full_page=True)
                        print(page.evaluate('Array.from(document.querySelectorAll("body *")).filter(e=>{let r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&!e.closest("table")}).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).slice(0,25)'))
                        raise AssertionError(f'Overflow at {width}')
                    expect(page.get_by_role('link',name='Approval queue',exact=True)).to_be_visible()
                    if width==768:
                        box=page.locator('[data-draft]').bounding_box()
                        assert box['x']+box['width']<=width,'Draft action is off screen on tablet'
                        page.screenshot(path=str(artifacts/'leadflow-tablet.png'),full_page=True)
                with page.expect_download() as download:page.locator('#exportBtn').click()
                assert download.value.suggested_filename=='leadflow-pipeline.csv'
                page.locator('#researchSetup>summary').click()
                page.locator('#source').select_option('firecrawl')
                expect(page.locator('#csvLabel')).to_be_hidden()
                page.locator('#leadLimit').select_option('3');page.locator('#runBtn').click()
                expect(page.locator('#mTotal')).to_have_text('4',timeout=15000)
                expect(page.locator('#runBtn')).to_be_enabled(timeout=15000)
                expect(page.locator('#leadRows')).to_contain_text('Online Dental')
                fixture=dict(id='unsafe',name='=SUM(1,2)',location='<img src=x onerror="window.injected=true">',site='javascript:alert(1)',fit='Maybe',score=50,insight='<script>bad()</script>',draft='Draft',status='review')
                page.route('**/api/leads?limit=1000',lambda route:route.fulfill(json=[fixture]))
                page.locator('.service-details>summary').click();page.locator('#reconnect').click()
                expect(page.locator('#leadRows')).to_contain_text('<img src=x')
                assert page.locator('#leadRows img').count()==0
                page.locator('[data-draft]').click();expect(page.locator('#sourceLink')).to_be_hidden();page.keyboard.press('Escape')
                with page.expect_download() as export:page.locator('#exportBtn').click()
                assert "'=SUM(1,2)" in Path(export.value.path()).read_text(encoding='utf-8-sig')
                offline=browser.new_page();offline.route('**/api/health',lambda route:route.abort());offline.goto(base)
                expect(offline.locator('#modeBadge')).to_have_text('OFFLINE')
                expect(offline.locator('#runBtn')).to_be_disabled();expect(offline.locator('#connectionError')).to_be_visible()
                expect(offline.locator('#mTotal')).to_have_text('0')
                assert not errors,errors
                print('PASS desktop/tablet/mobile, form validation, CSV and online runs, filters/sorting, visible selection, drawer evidence, edit/reapproval, error preservation, keyboard containment/restoration, simulated send, persistence, export, safe imported text/links, offline state; no JS errors')
                browser.close()
        finally:
            server.should_exit=True;thread.join(timeout=10);sock.close();storage.DB_PATH=original
