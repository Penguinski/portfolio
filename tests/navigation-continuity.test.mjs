import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

// Exercise the deployed navigation transaction, not a separate implementation.
const source=readFileSync(new URL('../assets/styles-D6VA2fPk.js',import.meta.url),'utf8');
const transaction=source.slice(source.indexOf('async function tt('),source.indexOf('function nt('));
const waitForNavigation=source.slice(source.indexOf("async function waitForNavigation("),source.indexOf("async function tt("));
const restore=source.slice(source.indexOf('function restorePreviousEntry('),source.indexOf('// Keep the current page intact'));
function fixture(failAt, mode='push') {
  const events=[], native=[], pushes=[], classes=new Set();
  const location={href:'https://ksw.ski/about/',pathname:'/about/',assign:url=>native.push(url),reload:()=>native.push('reload')};
  const history={state:{portfolioIndex:2,path:'/about/',scrollY:80},
    pushState(state,_,url){this.state=state;pushes.push(state);location.href=url;location.pathname=new URL(url).pathname;},
    replaceState(state){this.state=state;}};
  if(mode==='pop'){location.href='https://ksw.ski/';location.pathname='/';history.state={portfolioIndex:1,path:'/',scrollY:220};}
  let stopped=0, complete=0, installed=0, backgroundCancels=0, failureUsed=false;
  const controller=()=>({prepareForTransition(){},stop(){stopped++;},completeTransitionEntry(){complete++;},showEverything(){}});
  const fail=phase=>{if(failAt===phase&&!failureUsed){failureUsed=true;throw new Error('test '+phase);}};
  const doc={querySelector:()=>({})};
  const context={console,URL,AbortController,DOMException,Error,Map,Set,Number,Promise,
    A:false,ee:0,P:null,k:2,w:'portfolioIndex',T:new Map(),S:'/',O:'https://ksw.ski/about/',D:controller(),j:null,
    history,window:{location,scrollY:80,scrollTo(x,y){this.scrollY=y;}},
    document:{querySelector:()=>({}),body:{style:{removeProperty(){}}}},Element:{prototype:{animate(){}}},
    x:{classList:{add(...v){v.forEach(x=>classes.add(x));},remove(...v){v.forEach(x=>classes.delete(x));}}},
    U:(phase,data)=>events.push({phase,...data}),H:(type,data)=>events.push({type,...data}),
    et:(mode,state)=>mode==='pop'?state.scrollY:0,ye(){},oe:Promise.resolve(),
    K:async(promise,timeout,label)=>{fail(label);return promise;},Q(){},
    Se:async()=>{fail('fetch');return doc;},t:{matches:failAt==='reduced-motion'},
    prepareDestinationAssets:async()=>{},se:()=>({exitDuration:220,sharedDuration:400,sharedDistanceCap:0,enterDuration:320}),
    $e:()=>({getAnimations:()=>[],remove(){}}),ze:()=>{fail(installed?'measure-destination':'measure-source');return [];},
    Ve:()=>[],Ie(){},He(){},he:async()=>{},Ke:async()=>{},
    Ze:()=>{installed++;return {destinationBackground:'#282828',updateNavigation(){}};},
    u:controller,We:()=>[],qe:async(...args)=>{args.at(-1).backgroundAnimation={cancel(){backgroundCancels++;}};return {};},
    Je:async()=>{},Z:async()=>{},maximumEntryDelay:()=>475,$(){},Ue(){},Xe(){},ve:()=> 'backward'
  };
  vm.createContext(context);vm.runInContext(restore+waitForNavigation+transaction,context);
  return {context,events,native,pushes,classes,get installed(){return installed},get complete(){return complete}};
}
for(const mode of ['push','pop']) {
  for(const phase of [undefined,'measure-source','exit animation','measure-destination','shared animation','entry animation','final transition paint']) {
    test(`${mode}: ${phase||'normal'} reaches destination without document navigation`,async()=>{
      const f=fixture(phase,mode),c=f.context;
      const ok=await c.tt(new URL('https://ksw.ski/'),'backward',{mode,state:{scrollY:220},index:1});
      assert.equal(ok,true);assert.deepEqual(f.native,[]);assert.equal(f.installed,1);
      assert.equal(f.pushes.length,mode==='push'?1:0);assert.equal(c.O,'https://ksw.ski/');
      assert.equal(c.window.scrollY,mode==='push'?0:220);assert.equal(c.A,false);assert.equal(c.P,null);
      assert.equal(f.classes.size,0);assert.ok(f.complete>=1);
      if(phase) assert.ok(f.events.some(e=>e.type==='transition-recovered'));
    });
  }
}
test('HTML fetch failure retains native navigation fallback',async()=>{
 const f=fixture('fetch');assert.equal(await f.context.tt(new URL('https://ksw.ski/'),'backward'),false);
 assert.deepEqual(f.native,['https://ksw.ski/']);assert.equal(f.pushes.length,0);
});
test('reduced motion retains native navigation',async()=>{
 const f=fixture('reduced-motion');await f.context.tt(new URL('https://ksw.ski/'),'backward');
 assert.deepEqual(f.native,['https://ksw.ski/']);assert.equal(f.installed,0);
});
test('previous browser entry is stored and restored after refresh',async()=>{
 const f=fixture();await f.context.tt(new URL('https://ksw.ski/'),'backward');
 const c=f.context;c.T=new Map();vm.runInContext(restore,c);c.restorePreviousEntry();
 assert.equal(c.T.get(2),'/about/');assert.equal(c.history.state.portfolioPrevious.index,2);
});
test('missing or mismatched previous entry does not invent browser history',()=>{
 const f=fixture(),c=f.context;vm.runInContext(restore,c);
 for(const previous of [undefined,{index:99,path:'/'},{index:1,path:'//external.test/'}]){
 c.history.state.portfolioPrevious=previous;c.restorePreviousEntry();assert.equal(c.T.size,0);
 }
});

test('failed image preparation is non-fatal and decoded images are retained for the transition',async()=>{
 const helper=source.slice(source.indexOf('async function prepareDestinationAssets('),source.indexOf('async function tt('));
 const messages=[],context={Image:class{},URL,Promise,me:async()=>{throw new Error('image unavailable');},H:(...event)=>messages.push(event)};
 vm.createContext(context);vm.runInContext(helper,context);
 const navigation={id:1};await context.prepareDestinationAssets({querySelectorAll:()=>[{getAttribute:()=>'/cover.webp'}]},new URL('https://ksw.ski/'),navigation);
 assert.equal(navigation.images[0].src,'https://ksw.ski/cover.webp');
 assert.equal(messages[0][0],'visual-resource-unavailable');
});

test('font timeout does not abort the animated navigation',async()=>{
 const f=fixture('destination fonts');f.context.document.fonts={ready:Promise.resolve()};
 assert.equal(await f.context.tt(new URL('https://ksw.ski/'),'backward'),true);
 assert.deepEqual(f.native,[]);assert.ok(f.events.some(e=>e.type==='visual-resource-unavailable'));
});

test('Back during resource preparation cancels the pending push without reload or history corruption',async()=>{
 const f=fixture(),c=f.context,navigate=c.tt,queued=[];
 c.tt=(...args)=>queued.push(args);
 c.prepareDestinationAssets=async(doc,url,navigation)=>{
   c.j={url:new URL('https://ksw.ski/'),state:{portfolioIndex:1,scrollY:321},index:1};
   c.history.state=c.j.state;
   navigation.superseded=true;navigation.controller.abort();
 };
 assert.equal(await navigate(new URL('https://ksw.ski/projects/agenda-2027/'),'forward'),true);
 assert.deepEqual(f.native,[]);assert.equal(f.pushes.length,0);assert.equal(f.installed,0);
 assert.equal(c.history.state.portfolioIndex,1);assert.equal(c.history.state.scrollY,321);
 assert.equal(queued.length,1);assert.equal(queued[0][2].mode,'pop');assert.equal(c.A,false);
});

test('Back after history commit keeps the queued entry intact',async()=>{
 const f=fixture(),c=f.context,navigate=c.tt,queued=[];
 c.tt=(...args)=>queued.push(args);
 c.Je=async()=>{
   c.j={url:new URL('https://ksw.ski/about/'),state:{portfolioIndex:2,scrollY:80},index:2};
   c.history.state=c.j.state;
 };
 await navigate(new URL('https://ksw.ski/'),'backward');
 assert.equal(c.history.state.portfolioIndex,2);assert.equal(c.history.state.scrollY,80);
 assert.equal(queued.length,1);assert.deepEqual(f.native,[]);
});
