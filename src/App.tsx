import {lazy, Suspense, useCallback, useEffect, useRef, useState} from 'react';
import {BookOpen, BookMarked, CircleDot, Cable, Menu, X, Check, AlertCircle} from 'lucide-react';
import RitualRoom from './components/Home';
import Entrance from './components/Entrance';
import Library, {CardDetail} from './components/Library';
import History from './components/History';
import Settings from './components/Settings';
const ReadingView = lazy(()=>import('./components/Reading'));
const SelectionRoom = lazy(()=>import('./components/SelectionRoom'));
import Modal from './components/Modal';
import {Sigil} from './components/Artwork';
import {CARD_MAP,buildMessages} from './lib/tarot';
import {createSelection, toDrawnCards, type Selection} from './lib/selection';
import {loadSelectionDraft, saveSelectionDraft, type SelectionDraft} from './lib/selectionDraft';
import {loadReadings,saveReading,deleteReadings,clearReadings,exportReadings,loadConfig,saveConfig,clearConfig,DEFAULT_CONFIG,STORAGE_KEYS} from './lib/storage';
import {streamChat} from './api';
import {useRitualMotion} from './lib/ritualMotion';
import type {Reading,ApiConfig} from './types';

type Page='home'|'ritual'|'selection'|'library'|'history'|'settings'|'reading';
const getPage=(hash = location.hash):Page=>{const id=hash.slice(1).split('?')[0];return ['ritual','selection','library','history','settings','reading'].includes(id)?id as Page:'home';};
const routeId=()=>new URLSearchParams(location.hash.split('?')[1] || '').get('id');
const errorText=(e:unknown)=>e instanceof Error?e.message:'操作没有完成，请重试。';

export default function App() {
  const motionEnabled = useRitualMotion();
  const [draft,setDraft] = useState(loadSelectionDraft);
  const draftRef = useRef(draft);
  const draftStorageWarning = useRef(false);
  const [initialConfig]=useState(()=>{try{return {config:loadConfig(),error:''};}catch(e){return {config:{...DEFAULT_CONFIG},error:errorText(e)};}});
  const [hash,setHash]=useState(()=>location.hash);
  const page = getPage(hash);
  const [readings,setReadings]=useState<Reading[]>([]);const [historyError,setHistoryError]=useState('');
  const [config,setConfig]=useState<ApiConfig>(initialConfig.config);const [active,setActive]=useState<Reading|null>(null);
  const activeRef=useRef<Reading|null>(null);activeRef.current=active;
  const deletedIds=useRef(new Set<string>());
  const [saved,setSaved]=useState(false);
  const [selectedCard,setSelectedCard]=useState<string|null>(null);const closeCard=useCallback(()=>setSelectedCard(null),[]);
  const [notice,setNotice]=useState<{text:string;error:boolean}|null>(null);const noticeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [busy,setBusy]=useState(false);const [chatError,setChatError]=useState('');const controller=useRef<AbortController|null>(null);
  const [menu,setMenu]=useState(false);const dirtyRef=useRef(false);const lastHash=useRef(location.hash);const reportDirty=useCallback((value:boolean)=>{dirtyRef.current=value;},[]);
  const notify=useCallback((text:string,error=false)=>{if(noticeTimer.current)clearTimeout(noticeTimer.current);setNotice({text,error});noticeTimer.current=setTimeout(()=>setNotice(null),error?12000:4500);},[]);
  const reload=useCallback(()=>{try{setReadings(loadReadings());setHistoryError('');}catch(e){setHistoryError(errorText(e));}},[]);
  useEffect(()=>{reload();if(initialConfig.error)notify(initialConfig.error,true);return()=>{if(noticeTimer.current)clearTimeout(noticeTimer.current);};},[reload,notify,initialConfig]);
  useEffect(()=>{
    const restore=()=>{
      if(getPage()!=='reading')return;
      const id=routeId();
      if(id&&activeRef.current?.id===id)return;
      // A missing/deleted URL must never show the previously active reading.
      activeRef.current=null;setActive(null);setSaved(false);setChatError('');
      if(!id)return;
      try{const savedReading=loadReadings().find(r=>r.id===id);if(savedReading){setActive(savedReading);activeRef.current=savedReading;setSaved(true);}else notify('这份手札不存在或已被删除，请从手札重新选择。',true);}catch(e){notify(errorText(e),true);}
    };
    restore();
    const listener=()=>{
      const nextId=new URLSearchParams(location.hash.split('?')[1]||'').get('id');
      if(getPage()==='reading'&&controller.current&&activeRef.current&&nextId!==activeRef.current.id){history.replaceState(null,'',lastHash.current||'#home');notify('当前牌阵仍在生成，请先等待完成或停止生成，再打开另一份手札。',true);return;}
      if(dirtyRef.current&&!window.confirm('接口设置尚未保存，离开后这些修改会丢失。仍要离开吗？')){history.replaceState(null,'',lastHash.current||'#home');return;}
      dirtyRef.current=false;lastHash.current=location.hash;setHash(location.hash);restore();setMenu(false);window.scrollTo({top:0,behavior:'instant'});
    };
    window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener);
  },[notify]);
  useEffect(()=>{const listener=(e:StorageEvent)=>{
    if(e.storageArea!==localStorage)return;
    reload();
    if(e.key===null||(e.key===STORAGE_KEYS.config&&e.newValue===null)){
      setConfig({...DEFAULT_CONFIG});
      try{sessionStorage.removeItem(STORAGE_KEYS.sessionKey);notify('接口设置已在另一个页面清除，本页设置、草稿和密钥也已重置。');}catch(error){notify(`本页接口已停用，但会话密钥未能清除：${errorText(error)}`,true);}
    }
    if(e.key===STORAGE_KEYS.readings||e.key===null){try{const current=activeRef.current;if(current&&!loadReadings().some(r=>r.id===current.id)){deletedIds.current.add(current.id);controller.current?.abort();activeRef.current=null;setActive(null);setSaved(false);notify('这份手札已在另一个页面删除。');if(getPage()==='reading')location.hash='history';}}catch{/* reload already reports the retained corrupt data. */}}
  };window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener);},[reload,notify]);
  useEffect(()=>{if(!busy)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[busy]);
  const persist=useCallback((reading:Reading)=>{try{saveReading(reading);setSaved(true);reload();return true;}catch(e){setSaved(false);notify(errorText(e),true);return false;}},[reload,notify]);
  function storeDraft(next: SelectionDraft | null) {
    draftRef.current = next;
    setDraft(next);
    try {
      saveSelectionDraft(next);
      draftStorageWarning.current = false;
    } catch {
      if (!draftStorageWarning.current && next) notify('本页可继续选牌。浏览器未能暂存进度，请在刷新前完成本次占卜。',true);
      draftStorageWarning.current = true;
    }
  }

  const onDraw=(spreadId:string,question:string,allowReversed:boolean)=>{
    if(busy){notify('请先等待当前解读完成，或停止生成。',true);return;}
    try {
      const next = {id:crypto.randomUUID(), createdAt:new Date().toISOString(), spreadId, question, allowReversed,
        selection:createSelection(spreadId,allowReversed)};
      storeDraft(next);
      location.hash = `selection?id=${next.id}`;
    } catch(e) { notify(errorText(e),true); }
  };
  const changeSelection = (update: (s: Selection) => Selection) => {
    const current = draftRef.current;
    if (!current || getPage() !== 'selection' || routeId() !== current.id) return;
    const selection = update(current.selection);
    if (selection !== current.selection) storeDraft({...current, selection});
  };
  const completeSelection = () => {
    if (busy) { notify('请先等待当前解读完成，或停止生成。',true); return; }
    const current = draftRef.current;
    if (!current || current.id !== routeId() || current.selection.replacement !== null ||
        !current.selection.revealed.every(Boolean)) return;
    try {
      const reading: Reading = {id:current.id, createdAt:current.createdAt, question:current.question,
        spreadId:current.spreadId, cards:toDrawnCards(current.selection,current.spreadId), messages:[], note:''};
      if (persist(reading)) storeDraft(null);
      activeRef.current = reading;
      setActive(reading);
      setChatError('');
      location.replace(`#reading?id=${reading.id}`);
    } catch(e) { notify(errorText(e),true); }
  };
  const onOpen=(reading:Reading)=>{if(busy){notify('请先等待当前解读完成，或停止生成。',true);return;}activeRef.current=reading;setActive(reading);setSaved(true);setChatError('');location.hash=`reading?id=${reading.id}`;};
  const onDelete=(ids:string[]|'all')=>{try{if(busy){notify('请先停止生成，再删除手札。',true);return;}ids==='all'?clearReadings():deleteReadings(ids);if(active&&(ids==='all'||ids.includes(active.id))){setActive(null);setSaved(false);}reload();notify('手札已删除。');}catch(e){notify(errorText(e),true);}};
  const onExport=()=>{try{const url=URL.createObjectURL(new Blob([exportReadings()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`灰雾手札-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('手札备份已导出，文件不含接口密钥。');}catch(e){notify(errorText(e),true);}};
  const onSaveConfig=(next:ApiConfig)=>{try{saveConfig(next);setConfig(next);notify('接口设置已保存。');return true;}catch(e){notify(errorText(e),true);return false;}};
  const onClearConfig=()=>{try{clearConfig();setConfig({...DEFAULT_CONFIG});notify('接口设置与密钥已从当前浏览器清除。');return true;}catch(e){notify(errorText(e),true);return false;}};
  const configured=!!config.baseUrl.trim()&&!!config.model.trim();
  const onSend=async(text:string)=>{
    if(!active||busy)return;if(!configured){notify('请先在接口设置中连接你的 AI 服务。',true);location.hash='settings';return;}
    const original=active;const requestMessages=buildMessages(original,text);
    const next:Reading={...original,messages:[...original.messages,{role:'user',content:text},{role:'assistant',content:''}]};
    let content='';let finished=false;const aborter=new AbortController();controller.current=aborter;setBusy(true);setChatError('');activeRef.current=next;setActive(next);setSaved(false);
    // Preserve the question even if the browser closes before the first token.
    persist({...next,messages:next.messages.slice(0,-1)});setSaved(false);
    try{await streamChat(config,requestMessages,(delta)=>{if(deletedIds.current.has(next.id)||activeRef.current?.id!==next.id)return;content+=delta;const updated={...next,note:activeRef.current.note,messages:[...next.messages.slice(0,-1),{role:'assistant' as const,content}]};activeRef.current=updated;setActive(updated);},aborter.signal);finished=true;}
    catch(e){if(aborter.signal.aborted){if(!deletedIds.current.has(next.id))notify('已停止生成，已收到的内容会保留。');}else setChatError(errorText(e));}
    finally{if(!deletedIds.current.has(next.id)&&activeRef.current?.id===next.id){const result:Reading={...next,note:activeRef.current.note,messages:[...next.messages.slice(0,-1),...(content?[{role:'assistant' as const,content:content+(!finished?'\n\n*（本次生成未完成）*':'')}]:[])]};activeRef.current=result;setActive(result);persist(result);}setBusy(false);controller.current=null;}
  };
  const onNote=(note:string)=>{if(!activeRef.current)return;const next={...activeRef.current,note};activeRef.current=next;setActive(next);if(persist(next))notify('手记已保存。');};
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current !== page) {
      document.getElementById('main-content')?.focus({preventScroll:true});
      window.scrollTo({top:0,behavior:'instant'});
      previousPage.current = page;
    }
  }, [page]);
  const nav=[['ritual','占卜仪式',CircleDot],['library','牌典',BookOpen],['history','手札',BookMarked],['settings','接口设置',Cable]] as const;
  const atEntrance = page === 'home';
  const activeNav = page === 'reading' || page === 'selection' ? 'ritual' : page;
  const displayedCard=selectedCard?CARD_MAP.get(selectedCard):undefined;
  return <div data-ritual-motion={motionEnabled ? 'on' : 'off'} className={`app-shell ${atEntrance?'gate-shell':'chamber-shell'}`}><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus();}}>跳到主要内容</a>
    {!atEntrance && <header className="site-header"><a className="brand" href="#home" aria-label="灰雾之上，返回入场画面"><Sigil simple className="brand-symbol"/><span><strong>灰雾之上</strong><small>Above the Grey Fog</small></span></a>
      <button className="icon-button mobile-menu" aria-label={menu?'关闭导航':'打开导航'} aria-expanded={menu} aria-controls="site-nav" onClick={()=>setMenu(m=>!m)}>{menu?<X size={22}/>:<Menu size={22}/>}</button>
      <nav id="site-nav" className={menu?'open':''} aria-label="主导航">{nav.map(([id,label,Icon])=><a key={id} className={activeNav===id?'active':''} aria-current={activeNav===id?'page':undefined} href={`#${id}`}><Icon size={15}/>{label}</a>)}</nav>
      <a className={`connection-pill ${configured?'connected':''}`} href="#settings"><span/>{configured?'AI 已配置':'连接你的 AI'}</a>
    </header>}
    <main id="main-content" tabIndex={-1}>
      {atEntrance && <Entrance/>}
      {page==='ritual'&&<RitualRoom onDraw={onDraw} onCard={setSelectedCard} pendingId={draft?.id}/>}
      {page==='selection' && (draft && draft.id === routeId() ?
        <Suspense fallback={<div className="empty-state">正在铺开牌扇…</div>}>
          <SelectionRoom key={draft.id} spreadId={draft.spreadId} question={draft.question}
            selection={draft.selection} onChange={changeSelection} onComplete={completeSelection}/>
        </Suspense> :
        <div className="empty-state"><h1>回到青铜长桌</h1><p>从长桌开启一副牌，或到手札查看已经完成的牌阵。</p>
          <a className="button primary" href="#ritual">选择牌阵</a></div>)}
      {page==='library'&&<Library onCard={setSelectedCard}/>}
      {page==='history'&&<History readings={readings} error={historyError} onOpen={onOpen} onDelete={onDelete} onExport={onExport}/>}
      {page==='settings'&&<Settings config={config} onSave={onSaveConfig} onClear={onClearConfig} onDirty={reportDirty}/>}
      {page==='reading'&&(active?<Suspense fallback={<div className="empty-state">正在展开牌阵…</div>}><ReadingView key={active.id} reading={active} configured={configured} busy={busy} error={chatError} onSend={onSend} onStop={()=>controller.current?.abort()} onCard={setSelectedCard} onNote={onNote} saved={saved}/></Suspense>:<div className="empty-state"><BookMarked size={35}/><h1>继续一段未完的探索</h1><p>你可以从手札打开已保存的牌阵，或开始新的占卜。</p><div className="toolbar-actions"><a className="button primary" href="#history">打开手札</a><a className="button secondary" href="#ritual">重新抽牌</a></div></div>)}
    </main>
    {!atEntrance && <footer className="site-footer"><a href="#home" className="footer-brand">✦ 返回灰雾之上</a><span>本地塔罗手札</span></footer>}
    {notice&&<div className={`notice ${notice.error?'notice-error':''}`} role="status">{notice.error?<AlertCircle size={18}/>:<Check size={18}/>}<span>{notice.text}</span><button className="icon-button" aria-label="关闭提示" onClick={()=>setNotice(null)}><X size={16}/></button></div>}
    {displayedCard&&<Modal title={displayedCard.nameZh} onClose={closeCard} wide><CardDetail key={displayedCard.name_short} card={displayedCard}/></Modal>}
  </div>;
}
