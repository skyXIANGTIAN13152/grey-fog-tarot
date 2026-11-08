import {useCallback, useState} from 'react';
import {BookMarked, Download, Search, Trash2, ArrowUpRight, CheckSquare} from 'lucide-react';
import type {Reading} from '../types';
import {CARD_MAP,SPREADS} from '../lib/tarot';
import Modal from './Modal';

export default function History({readings,error,onOpen,onDelete,onExport}:{readings:Reading[];error:string;onOpen:(r:Reading)=>void;onDelete:(ids:string[]|'all')=>void;onExport:()=>void}) {
  const [query,setQuery]=useState('');const [selected,setSelected]=useState<Set<string>>(new Set());
  const [deletion,setDeletion]=useState<string[]|'all'|null>(null);const close=useCallback(()=>setDeletion(null),[]);
  const filtered=readings.filter(r=>`${r.question} ${r.note} ${SPREADS.find(s=>s.id===r.spreadId)?.name} ${r.cards.map(c=>CARD_MAP.get(c.cardId)?.nameZh).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const toggle=(id:string)=>setSelected(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next;});
  const confirm=()=>{if(deletion){onDelete(deletion);setSelected(new Set());setDeletion(null);}};
  return <section className="page-section"><div className="page-intro"><div className="page-ornament"><BookMarked size={25}/></div><h1>灰雾手札</h1><p>收藏每一次翻牌，也留下此刻的自己。</p></div>
    <div className="history-toolbar"><div className="search-field"><Search size={18}/><input aria-label="搜索历史记录" name="historySearch" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索问题、牌名或笔记…"/></div><div className="toolbar-actions"><button className="button secondary compact" onClick={onExport}><Download size={15}/> 导出备份</button><button className="button danger-text compact" disabled={!readings.length&&!error} onClick={()=>setDeletion('all')}><Trash2 size={15}/> 清空手札</button></div></div>
    {error&&<div className="inline-status error">{error} 可以先导出原始备份，再清空手札以恢复使用。</div>}
    {filtered.length>0&&<div className="selection-bar"><label className="checkbox-label"><input type="checkbox" checked={filtered.every(r=>selected.has(r.id))} onChange={e=>setSelected(e.target.checked?new Set(filtered.map(r=>r.id)):new Set())}/>选择当前结果</label><span>{readings.length} 份记录</span>{selected.size>0&&<button className="text-button danger-text" onClick={()=>setDeletion([...selected])}><Trash2 size={14}/> 删除所选（{selected.size}）</button>}</div>}
    <div className="history-list">{filtered.map(r=><article className="history-entry" key={r.id}><label className="entry-checkbox"><input type="checkbox" aria-label={`选择记录：${r.question||'未命名占卜'}`} checked={selected.has(r.id)} onChange={()=>toggle(r.id)}/></label>
      <button className="entry-main" onClick={()=>onOpen(r)}><div className="entry-date"><time dateTime={r.createdAt}>{new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(new Date(r.createdAt))}</time><span>{new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(new Date(r.createdAt))}</span></div>
      <div className="entry-copy"><span className="entry-spread">{SPREADS.find(s=>s.id===r.spreadId)?.name}</span><h2>{r.question||'一次无问的探索'}</h2><p>{r.cards.map(c=>`${CARD_MAP.get(c.cardId)?.nameZh}${c.reversed?'（逆位）':''}`).join(' · ')}</p>{r.note&&<span className="note-preview">手记：{r.note}</span>}</div>
      <div className="entry-thumbnails" aria-hidden="true">{r.cards.slice(0,3).map(c=><img key={c.cardId} src={CARD_MAP.get(c.cardId)?.image} alt="" width={42} height={70} loading="lazy" style={{transform:c.reversed?'rotate(180deg)':undefined}}/>)}</div><ArrowUpRight size={18} className="entry-arrow"/></button>
      <button className="icon-button entry-delete" aria-label={`删除记录：${r.question||'未命名占卜'}`} onClick={()=>setDeletion([r.id])}><Trash2 size={16}/></button>
    </article>)}</div>
    {!filtered.length&&!error&&<div className="empty-state"><BookMarked size={36}/><h2>{query?'没有找到这份手札':'故事还没有开始'}</h2><p>{query?'试试其他问题关键词或牌名。':'完成抽牌后，牌阵与解读会自动保存在这里。'}</p>{query?<button className="button secondary" onClick={()=>setQuery('')}>清除搜索</button>:<a href="#ritual" className="button primary">开启第一次占卜</a>}</div>}
    <p className="source-note"><CheckSquare size={14}/> 手札保存在当前浏览器中。清除浏览器数据会一并删除记录，建议定期导出备份。</p>
    {deletion&&<Modal title={deletion==='all'?'清空全部手札？':'删除所选手札？'} onClose={close}><p className="confirm-copy">{deletion==='all'?'所有已保存的牌阵、对话和笔记将从当前浏览器删除。':`将删除 ${deletion.length} 份手札及其中的对话和笔记。`}此操作无法撤销。</p><div className="modal-actions"><button className="button secondary" onClick={close}>保留手札</button><button className="button danger" onClick={confirm}><Trash2 size={16}/> 确认删除</button></div></Modal>}
  </section>;
}
