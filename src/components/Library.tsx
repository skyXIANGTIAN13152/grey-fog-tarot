import {useDeferredValue, useState} from 'react';
import {Search, X, BookOpen} from 'lucide-react';
import {searchCards} from '../lib/tarot';
import type {TarotCard} from '../types';

const suits=[['all','全部牌组'],['major','大阿卡纳'],['wands','权杖'],['cups','圣杯'],['swords','宝剑'],['pentacles','星币']];
export default function Library({onCard}:{onCard:(id:string)=>void}) {
  const initial=new URLSearchParams(location.hash.split('?')[1]||'');
  const [query,setQuery]=useState(()=>initial.get('q')||''); const [suit,setSuit]=useState(()=>initial.get('suit')||'all');
  const deferred=useDeferredValue(query); const cards=searchCards(deferred,suit);
  const updateUrl=(q:string,s:string)=>{const params=new URLSearchParams();if(q)params.set('q',q);if(s!=='all')params.set('suit',s);history.replaceState(null,'',`#library${params.size?'?'+params:''}`);};
  return <section className="page-section"><div className="page-intro"><div className="page-ornament"><BookOpen size={25}/></div><h1>塔罗牌典</h1><p>七十八扇门，七十八种看待世界的方式。</p></div>
    <div className="library-toolbar"><div className="search-field"><Search size={18}/><input aria-label="搜索塔罗牌" name="cardSearch" autoComplete="off" value={query} onChange={e=>{setQuery(e.target.value);updateUrl(e.target.value,suit);}} placeholder="搜索中文、英文牌名或牌义…"/>{query&&<button className="icon-button" aria-label="清除搜索" onClick={()=>{setQuery('');updateUrl('',suit);}}><X size={16}/></button>}</div><span className="result-count" aria-live="polite">找到 {cards.length} 张牌</span></div>
    <div className="filter-tabs" role="group" aria-label="筛选牌组">{suits.map(([value,label])=><button key={value} className={suit===value?'active':''} aria-pressed={suit===value} onClick={()=>{setSuit(value);updateUrl(query,value);}}>{label}</button>)}</div>
    {cards.length?<div className="library-grid">{cards.map(card=><button className="library-card" key={card.name_short} onClick={()=>onCard(card.name_short)}>
      <div className="library-image"><img src={card.image} alt={card.nameZh} width={180} height={300} loading="lazy"/></div>
      <div className="library-card-name"><h2>{card.nameZh}</h2><span>{card.type==='major'?'大阿卡纳':'小阿卡纳'}</span></div><p>{card.name}</p>
    </button>)}</div>:<div className="empty-state"><Search size={32}/><h2>还没有找到这张牌</h2><p>试试“愚者”“The Fool”或牌义中的关键词。</p><button className="button secondary" onClick={()=>{setQuery('');setSuit('all');updateUrl('','all');}}>显示全部牌</button></div>}
    <p className="source-note">英文牌义完整保留自 <a href="https://github.com/ekelen/tarot-api" target="_blank" rel="noreferrer">tarot-api</a>，附中文译文。牌面为经典 Rider–Waite–Smith 牌组。</p>
  </section>;
}

export function CardDetail({card}:{card:TarotCard}) {
  const [language,setLanguage]=useState<'zh'|'en'>('zh');
  return <div className="card-detail"><div className="card-detail-art"><img src={card.image} alt={`${card.nameZh}牌面`} width={240} height={400}/><span>{card.type==='major'?'大阿卡纳':'小阿卡纳'} · {card.value_int}</span></div><div className="card-detail-copy">
    <p className="latin-name">{card.name}</p><div className="segmented" role="group" aria-label="牌义语言"><button aria-pressed={language==='zh'} className={language==='zh'?'active':''} onClick={()=>setLanguage('zh')}>中文译文</button><button aria-pressed={language==='en'} className={language==='en'?'active':''} onClick={()=>setLanguage('en')}>English 原文</button></div>
    <section><h3>正位 <span>Upright</span></h3><p>{language==='zh'?card.meaningUpZh:card.meaning_up}</p></section>
    <section><h3>逆位 <span>Reversed</span></h3><p>{language==='zh'?card.meaningRevZh:card.meaning_rev}</p></section>
    <section><h3>画面与象征 <span>Symbolism</span></h3><p>{language==='zh'?card.descZh:card.desc}</p></section>
    <small className="muted">译文保留原典的传统表述；它们是象征性牌义，不是对现实事件的断言。</small>
  </div></div>;
}
