import os, pathlib, sys
from playwright.sync_api import sync_playwright, expect

base=os.environ['VIEWLY_BROWSER_URL'].rstrip('/')
out=pathlib.Path(os.environ.get('VIEWLY_SCREENSHOT_DIR','browser-results'))
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
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
            if page.locator('.g15-welcome').count():
                expect(page.locator('.g15-scene')).to_be_visible()
                page.locator('[data-g15-next]').click()
                expect(page.locator('.g15-welcome-copy h2')).to_have_text('Clip. Submit. Verify.')
                page.locator('[data-g15-step="2"]').click()
                expect(page.locator('.g15-welcome-copy h2')).to_have_text('Your first big campaign is free.')
                page.screenshot(path=str(out/f'v15-{name}-welcome.png'),animations='disabled')
                page.locator('[data-g15-dismiss]').click()
                expect(page.locator('.g15-welcome')).to_have_count(0)
                assert page.request.get(base+'/api/growth/policy').json()['premium_threshold_cents']==200000
            elif '127.0.0.1' in base:
                raise AssertionError('V15 welcome missing from local build')
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
                left=page.locator('.v16-left-nav').count()>0
                if '127.0.0.1' in base:
                    assert left, 'Left navigation release marker missing'
                rail_box,main_box=rail.bounding_box(),main.bounding_box()
                if left:
                    assert rail_box['x']+rail_box['width']<=main_box['x']+2, 'Navigation must be left of workspace'
                    assert toggle.bounding_box()['x']<page.locator('.v-topbar').bounding_box()['width']/2
                else:
                    assert rail_box['x']>main_box['x'] # previous live release before deployment
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
                if page.locator('.v16-left-nav').count():
                    assert page.locator('[data-v7-tools]').bounding_box()['x']<width/2
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
    if '127.0.0.1' in base:
        # All fixture accounts and artwork stay in the isolated CI application, never in live staging.
        import subprocess, tempfile, uuid
        for width,height,name in [(1440,900,'desktop'),(390,844,'mobile')]:
            ctx=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce',is_mobile=name=='mobile',has_touch=name=='mobile')
            page=ctx.new_page()
            errors=[]
            page.on('pageerror',lambda err: errors.append(str(err)))
            try:
                key='v14_'+uuid.uuid4().hex[:12]
                headers={'X-Viewly-Request':'1'}
                reg=page.request.post(base+'/api/register',headers=headers,data={'email':key+'@example.test','username':key,'display_name':'CI Artist','role':'artist','password':'Temporary fixture password 01234'})
                assert reg.ok,reg.text()
                with tempfile.TemporaryDirectory() as d:
                    root=pathlib.Path(d)
                    video=root/'video.mp4'
                    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x240:d=6','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-y',str(video)],check=True,timeout=25)
                    rel=page.request.post(base+'/api/releases',headers=headers,multipart={'title':'CI original','genre':'Rap','rights':'on','video':{'name':'video.mp4','mimeType':'video/mp4','buffer':video.read_bytes()}})
                    assert rel.ok,rel.text()
                    for kind,size in [('icon','1024x1024'),('background','1600x900')]:
                        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s='+size,'-frames:v','1','-threads','1','-y',str(root/(kind+'.png'))],check=True,timeout=25)
                    page.goto(base,wait_until='domcontentloaded')
                    expect(page.locator('.v13-status')).to_contain_text('Live database',timeout=20000)
                    page.locator('[data-action="create-campaign"]:visible').first.click()
                    expect(page.locator('#v14-form')).to_be_visible()
                    form=page.locator('#v14-form')
                    form.locator('[name="title"]').fill('CI campaign '+name)
                    form.locator('[name="brief"]').fill('A complete original creative brief with detailed approved instructions for eligible short clips.')
                    nxt=form.locator('[data-v14-next]')
                    nxt.click()
                    expect(form.locator('[name="budget_eur"]')).to_be_visible()
                    nxt.click()
                    expect(form.locator('[name="icon"]')).to_be_visible()
                    form.locator('[name="icon"]').set_input_files(str(root/'icon.png'))
                    form.locator('[name="background"]').set_input_files(str(root/'background.png'))
                    form.locator('[name="headline"]').fill('CI promo preview')
                    nxt.click()
                    form.locator('[name="rights_confirmed"]').check()
                    nxt.click()
                    form.locator('[value="home24"][name="promo"]').check()
                    nxt.click()
                    expect(form.locator('#v14-preview .v14-background')).to_be_visible()
                    page.screenshot(path=str(out/f'v14-{name}-preview.png'),animations='disabled')
                    nxt.click()
                    expect(form.locator('#v14-final .v14-total')).to_contain_text('119.99',timeout=60000)
                    assert page.request.get(base+'/api/promotions/featured').json()['items']==[] or name=='mobile'
                    form.locator('#v14-confirm').check()
                    form.locator('[data-v14-pay]').click()
                    film=page.locator('.v17f')
                    expect(film).to_be_visible(timeout=20000)
                    expect(film.locator('.v17f-stage .v17f-receipt')).to_be_visible()
                    expect(film.locator('.v17f-stage')).to_contain_text('€0.00')
                    expect(film.locator('.v17f-stage')).to_contain_text('CI campaign '+name)
                    expect(film.locator('.v17f-test')).to_contain_text('NO REAL PAYMENT')
                    page.screenshot(path=str(out/f'v17-{name}-film-receipt.png'),animations='disabled')
                    film.locator('[data-v17f="replay"]').click()
                    expect(film.locator('.v17f-stage')).to_contain_text('Your music. Your moment.')
                    film.locator('[data-v17f="receipt"]').click()
                    expect(film.locator('.v17f-stage .v17f-receipt')).to_be_visible()
                    film.locator('[data-v17f="open"]').click()
                    expect(page.locator('.v10-detail h2')).to_contain_text('CI campaign '+name,timeout=20000)
                    page.reload(wait_until='domcontentloaded')
                    expect(page.locator('.v14-sponsored [data-v14-open]').first).to_be_visible(timeout=15000)
                    assert any(x['title']=='CI campaign '+name and x['sandbox'] for x in page.request.get(base+'/api/promotions/featured').json()['items'])
                    page.screenshot(path=str(out/f'v14-{name}-featured.png'),animations='disabled')
                    assert not errors,errors
                    print('V14 '+name+' actual wizard, assets, final checkout and sponsored placement passed',flush=True)
            except Exception:
                page.screenshot(path=str(out/f'v14-{name}-failure.png'),full_page=True)
                raise
            finally: ctx.close()
    if '127.0.0.1' in base:
        # Test the cinematic independently of the reduced-motion workflow suite.
        for name,viewport,fallback,skip_intro in [
            ('cinematic-desktop',{'width':1440,'height':900},False,False),
            ('cinematic-mobile',{'width':390,'height':844},False,True),
            ('cinematic-fallback',{'width':390,'height':844},True,True)]:
            ctx=browser.new_context(viewport=viewport,reduced_motion='no-preference')
            ctx.add_init_script("""window.__v17RevealSeen=false;
                new MutationObserver(()=>{if(document.querySelector('#app.v17-reveal'))window.__v17RevealSeen=true;})
                    .observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});""")
            if fallback:
                ctx.add_init_script("const get=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:get.call(this,type,...args)}")
            page=ctx.new_page()
            errors=[]
            page.on('pageerror',lambda err: errors.append(str(err)))
            page.on('console',lambda msg: print(msg.text,flush=True) if 'VIEWLY cinematic fallback' in msg.text else None)
            try:
                page.goto(base,wait_until='domcontentloaded')
                intro=page.locator('#app-loader.v17-intro')
                expect(intro).to_be_visible(timeout=5000)
                expect(intro.locator('[data-intro-skip]')).to_be_visible()
                expect(page.locator('#app')).to_have_attribute('inert','')
                expect(intro).to_have_attribute('data-ready','true',timeout=8000)
                gpu_available=page.evaluate("""()=>{try{const c=document.createElement('canvas');const gl=c.getContext('webgl');if(!gl)return false;gl.getExtension('WEBGL_lose_context')?.loseContext();return true;}catch{return false}}""")
                if fallback or not gpu_available:
                    expect(intro).to_have_attribute('data-renderer','css')
                    if not fallback:
                        print(name+' headless WebGL unavailable; validating CSS fallback instead',flush=True)
                    expect(intro.locator('.v17-fallback-mark')).to_be_visible()
                else:
                    expect(intro).to_have_attribute('data-renderer','webgl',timeout=5000)
                    expect(intro.locator('canvas')).to_be_visible()
                    assert page.locator('canvas').first.evaluate('(c)=>c.width>10&&c.height>10')
                if skip_intro:
                    intro.locator('[data-intro-skip]').click()
                else:
                    expect(intro).to_have_attribute('data-phase','2',timeout=5000)
                    page.screenshot(path=str(out/f'{name}-intro.png'))
                page.wait_for_function('window.__v17RevealSeen === true',timeout=8000)
                expect(page.locator('#app')).not_to_have_attribute('inert','')
                expect(intro).to_have_count(0,timeout=4000)
                expect(page.locator('.v-app-shell > .v-topbar')).to_be_visible()
                assert not errors,errors
                page.screenshot(path=str(out/f'{name}-finished.png'),animations='disabled')
                print(name+' intro, handoff and cleanup passed',flush=True)
            finally: ctx.close()
    browser.close()
