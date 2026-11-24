import os, pathlib, sys
from playwright.sync_api import sync_playwright, expect

base=os.environ['VIEWLY_BROWSER_URL'].rstrip('/')
out=pathlib.Path(os.environ.get('VIEWLY_SCREENSHOT_DIR','browser-results'))
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width,height,name in [(1440,900,'desktop'),(390,844,'mobile')]:
        context=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce',is_mobile=name=='mobile',has_touch=name=='mobile')
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda err: errors.append(str(err)))
        try:
            response=page.goto(base,wait_until='domcontentloaded',timeout=45000)
            assert response and response.ok, 'Page not available'
            expect(page.locator('.v-app-shell > .v-topbar')).to_be_visible(timeout=20000)
            expect(page.locator('.v-app-shell > .v-workspace')).to_be_visible()
            page.locator('#app-loader').wait_for(state='hidden',timeout=15000)
            assert page.request.get(base+'/api/health').ok
            if page.locator('.v13-hub').count():
                expect(page.locator('.v13-status')).to_contain_text('Live database',timeout=15000)
                expect(page.locator('.v13-metrics .v13-metric')).to_have_count(4)
                expect(page.locator('.v13-chart .v13-bar-slot')).to_have_count(7)
                page.locator('[data-v13-period="30"]').click()
                expect(page.locator('.v13-chart .v13-bar-slot')).to_have_count(30,timeout=15000)
                expect(page.locator('[data-v13-period="30"]')).to_have_attribute('aria-pressed','true')
                result=page.request.get(base+'/api/workspace?days=30')
                assert result.ok and result.json()['personal'] is None
                assert page.request.get(base+'/api/workspace?days=15').status==422
                page.locator('[data-v13-period="7"]').click()
                expect(page.locator('.v13-chart .v13-bar-slot')).to_have_count(7,timeout=15000)
            elif '127.0.0.1' in base:
                raise AssertionError('V13 creator hub missing from local build')
            page.screenshot(path=str(out/f'{name}-home.png'),full_page=True,animations='disabled')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), 'Horizontal document overflow'
            if name=='desktop':
                rail=page.locator('#viewly-desktop-navigation')
                toggle=page.locator('[data-v7-sidebar-toggle]')
                main=page.locator('.v-workspace')
                expect(rail).to_be_visible()
                assert rail.bounding_box()['x']>main.bounding_box()['x']
                assert page.locator('.v-topbar').bounding_box()['width']>main.bounding_box()['width']
                assert page.locator('.v-topbar').evaluate("e=>getComputedStyle(e).backdropFilter")!='none'
                before=main.bounding_box()['width']
                toggle.click()
                expect(toggle).to_have_attribute('aria-expanded','false')
                expect(rail).to_be_hidden()
                assert main.bounding_box()['width']>before+100
                page.screenshot(path=str(out/'desktop-collapsed.png'),full_page=True,animations='disabled')
                page.reload(wait_until='domcontentloaded')
                expect(toggle).to_have_attribute('aria-expanded','false',timeout=15000)
                toggle.click()
                expect(rail).to_be_visible()
                expect(toggle).to_have_attribute('aria-expanded','true')
                rail.get_by_role('button',name='Music library').click()
                expect(rail.get_by_role('button',name='Music library')).to_have_attribute('aria-current','page')
            else:
                expect(page.locator('.v-bottom-nav')).to_be_visible()
                expect(page.locator('#viewly-desktop-navigation')).to_be_hidden()
                page.locator('[data-v7-tools]').click()
                expect(page.locator('.v7-tools-modal')).to_be_visible()
                page.screenshot(path=str(out/'mobile-menu.png'),animations='disabled')
                page.locator('#overlay .modal-close').click()
                expect(page.locator('.v7-tools-modal')).to_have_count(0)
                page.locator('.v-bottom-nav').get_by_role('button',name='Music').click()
                expect(page.locator('.v-bottom-nav').get_by_role('button',name='Music')).to_have_attribute('aria-current','page')
            assert not errors, 'Browser JavaScript error: '+str(errors[:3])
            print(name+' browser navigation passed',flush=True)
        except Exception:
            page.screenshot(path=str(out/f'{name}-failure.png'),full_page=True)
            raise
        finally: context.close()
    browser.close()
