import {useEffect, useRef, useState, type FormEvent} from 'react';
import ReactMarkdown from 'react-markdown';
import {ArrowLeft, ArrowUpRight, BookOpen, Check, Feather, LoaderCircle, RotateCcw, Send, Sparkles, Square} from 'lucide-react';
import type {Reading} from '../types';
import {CARD_MAP,SPREADS} from '../lib/tarot';
import ReadingTable from './ReadingTable';

export default function ReadingView({reading,configured,busy,error,onSend,onStop,onCard,onNote,saved}: {
  reading:Reading;configured:boolean;busy:boolean;error:string;saved:boolean;
  onSend:(text:string)=>void;onStop:()=>void;onCard:(id:string)=>void;onNote:(text:string)=>void;
}) {
  const [followup,setFollowup]=useState('');const [note,setNote]=useState(reading.note);
  const chatEnd=useRef<HTMLDivElement>(null);
  const spread=SPREADS.find(s=>s.id===reading.spreadId)!;
  useEffect(()=>{if(!busy&&reading.messages.length)chatEnd.current?.scrollIntoView({block:'nearest'});},[busy]);
  const send=(e:FormEvent)=>{e.preventDefault();if(!configured||busy)return;if(followup.trim()){onSend(followup.trim());setFollowup('');}};
  return <section className="page-section reading-page">
    <div className="reading-breadcrumb"><a href="#ritual" className="text-button"><ArrowLeft size={15}/> 返回仪式</a><span className="saved-state">{saved?<><Check size={13}/> 已存入手札</>:<>尚未保存</>}</span></div>
    <div className="reading-intro"><span className="small-caption">{spread.positions.length} 张牌 · {new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(reading.createdAt))}</span><h1>{spread.name}</h1><p>{reading.question||'此刻，有什么值得我留意？'}</p></div>
    <ReadingTable reading={reading} onCard={onCard}/>
      <div className="reading-content"><div className="interpretation"><div className="section-heading"><div><span className="small-caption">线索逐渐清晰</span><h2><Sparkles size={20}/> AI 解读</h2></div><span className="quiet-label">沿用本次牌阵</span></div>
        {!reading.messages.length?<div className="ai-invitation"><p>让你的 AI 将牌义、牌阵与问题联系起来。<br/>解读之后，可以继续聊一聊。</p>{configured?<button className="button primary" disabled={busy} onClick={()=>onSend('请结合我的问题，解读这次牌阵。')}><Sparkles size={17}/> 解读这组牌</button>:<a href="#settings" className="button primary"><Sparkles size={17}/> 连接 AI，开始解读 <ArrowUpRight size={16}/></a>}<span className="small-text muted">也可以先阅读下方的经典牌义。</span></div>:<div className="chat-log" aria-label="AI 解读与追问记录">{reading.messages.map((message,i)=><article className={`chat-message ${message.role}`} key={i}><div className="message-label">{message.role==='user'?<><Feather size={13}/> 你的提问</>:<><Sparkles size={13}/> 灰雾回响</>}</div>{message.content?<div className="markdown"><ReactMarkdown components={{a:({children,href})=><a href={href} target="_blank" rel="noreferrer">{children}</a>}}>{message.content}</ReactMarkdown></div>:<p className="thinking" role="status">正在连结牌面中的线索…</p>}</article>)}<div ref={chatEnd}/></div>}
        {error&&<p className="inline-status error" role="alert">{error}</p>}
        {busy&&<div className="stream-status" role="status"><LoaderCircle size={15} className="loading-icon"/> 正在生成解读… <button className="text-button" onClick={onStop}><Square size={12}/> 停止生成</button></div>}
        {reading.messages.length>0&&<form className="followup-form" onSubmit={send}><label className="sr-only" htmlFor="followup">继续追问</label><textarea id="followup" name="followup" rows={2} maxLength={3000} value={followup} onChange={e=>setFollowup(e.target.value)} placeholder={configured?'关于这组牌，我还想知道…':'配置 AI 接口后即可继续追问…'} disabled={busy||!configured}/><button className="button primary" type="submit" disabled={busy||!configured||!followup.trim()} aria-label="发送追问"><Send size={17}/><span>追问</span></button></form>}
        {reading.messages.length>0&&!configured&&<a href="#settings" className="text-button">配置接口后继续追问 <ArrowUpRight size={14}/></a>}
      </div><aside className="reading-notebook"><Feather size={22}/><h2>留给自己的话</h2><p>哪张牌触动了你？<br/>把第一瞬间的想法写下来。</p><label className="sr-only" htmlFor="reading-note">本次占卜笔记</label><textarea id="reading-note" name="note" rows={7} maxLength={10000} value={note} onChange={e=>setNote(e.target.value)} onBlur={()=>{if(note!==reading.note)onNote(note);}} placeholder="在这里留下你的手记…"/><button className="button secondary compact" disabled={note===reading.note} onClick={()=>onNote(note)}><Check size={14}/> 保存手记</button><span className="small-text muted">离开输入框时也会自动保存。</span></aside></div>
      <details className="classic-meanings" open><summary><BookOpen size={18}/><h2>经典牌义</h2><span>以牌阵中的正逆位为准</span></summary><div className="meaning-grid">{reading.cards.map((draw,i)=>{const card=CARD_MAP.get(draw.cardId)!;return <article key={draw.cardId}><span className="small-caption">{i+1}. {draw.position}</span><h3>{card.nameZh}<span className={draw.reversed?'reversed-label':''}>{draw.reversed?'逆位':'正位'}</span></h3><p>{draw.reversed?card.meaningRevZh:card.meaningUpZh}</p><button className="text-button" onClick={()=>onCard(card.name_short)}>查看中英完整牌义 <ArrowUpRight size={13}/></button></article>;})}</div></details>
      <div className="reading-end"><p>牌面是一种观察的角度，选择始终在你手中。</p><a href="#ritual" className="text-button"><RotateCcw size={14}/> 开启新的占卜</a></div>
  </section>;
}
