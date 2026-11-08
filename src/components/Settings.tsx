import {useEffect, useState, type FormEvent} from 'react';
import {Cable, Check, Eye, EyeOff, LoaderCircle, PlugZap, Save, ShieldCheck} from 'lucide-react';
import type {ApiConfig} from '../types';
import {streamChat} from '../api';
import {DEFAULT_CONFIG} from '../lib/storage';

const PRESETS: {id:string;name:string;provider:ApiConfig['provider'];url:string;model:string;hint:string}[]=[
  {id:'deepseek',name:'DeepSeek',provider:'openai',url:'https://api.deepseek.com',model:'deepseek-chat',hint:'填写你在 DeepSeek 开放平台创建的 API Key。'},
  {id:'openai',name:'OpenAI',provider:'openai',url:'https://api.openai.com/v1',model:'',hint:'填写可用模型名称和 API Key；以服务商控制台为准。'},
  {id:'siliconflow',name:'硅基流动',provider:'openai',url:'https://api.siliconflow.cn/v1',model:'',hint:'从服务商控制台复制完整模型 ID 与 API Key。'},
  {id:'ollama',name:'Ollama 本地模型',provider:'openai',url:'http://127.0.0.1:11434/v1',model:'',hint:'先在本机启动 Ollama，模型名称与本机已下载的模型一致，可不填密钥。'},
  {id:'anthropic',name:'Anthropic',provider:'anthropic',url:'https://api.anthropic.com/v1',model:'',hint:'使用 Anthropic Messages 协议，填写可用的模型 ID。'},
  {id:'gemini',name:'Google Gemini',provider:'gemini',url:'https://generativelanguage.googleapis.com/v1beta',model:'',hint:'使用 Gemini 原生协议，填写 Google AI Studio 的密钥和模型 ID。'},
  {id:'custom',name:'自定义接口',provider:'openai',url:'',model:'',hint:'支持 OpenAI 兼容、Anthropic 和 Gemini 协议，可连接自己的中转或本地服务。'},
];

export default function Settings({config,onSave,onClear,onDirty}:{config:ApiConfig;onSave:(c:ApiConfig)=>boolean;onClear:()=>boolean;onDirty:(dirty:boolean)=>void}) {
  const [form,setForm]=useState(config); const [showKey,setShowKey]=useState(false);
  const [status,setStatus]=useState<{kind:'error'|'success';text:string}|null>(null); const [testing,setTesting]=useState(false);
  useEffect(()=>{setForm(config);if(!config.baseUrl&&!config.model&&!config.apiKey){setShowKey(false);setStatus(null);}},[config]);
  const dirty=JSON.stringify(form)!==JSON.stringify(config);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  useEffect(()=>{if(!dirty)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  const change=<K extends keyof ApiConfig>(key:K,value:ApiConfig[K])=>{setForm(f=>({...f,[key]:value}));setStatus(null);};
  const choose=(id:string)=>{const p=PRESETS.find(p=>p.id===id)!;setForm(f=>({...f,preset:id,provider:p.provider,baseUrl:p.url,model:p.model,apiKey:''}));setStatus(null);};
  const validate=()=>{
    if(!form.baseUrl.trim())return '请填写接口地址。';
    try{const url=new URL(form.baseUrl);if(!['https:','http:'].includes(url.protocol))return '接口地址需要以 https:// 或 http:// 开头。';}catch{return '接口地址不完整，请从服务商控制台复制。';}
    if(!form.model.trim())return '请填写你要使用的模型名称。';
    return '';
  };
  const test=async()=>{
    const error=validate();if(error){setStatus({kind:'error',text:error});return;}
    setTesting(true);setStatus(null);
    try{await streamChat(form,[],()=>{},undefined,true);setStatus({kind:'success',text:'连接成功，模型已回应。保存设置后即可开始 AI 解读。'});}catch(e){setStatus({kind:'error',text:e instanceof Error?e.message:'连接失败，请检查设置。'});}finally{setTesting(false);}
  };
  const save=(e:FormEvent)=>{e.preventDefault();const error=validate();if(error){setStatus({kind:'error',text:error});return;}if(onSave(form))setStatus({kind:'success',text:'接口设置已保存。现在可以返回占卜并请求 AI 解读。'});};
  const selected=PRESETS.find(p=>p.id===form.preset)||PRESETS[6];
  return <section className="page-section settings-page"><div className="page-intro"><div className="page-ornament"><Cable size={25}/></div><h1>接通你的灵感</h1><p>选择 AI 服务，填入自己的接口。无需修改任何代码。</p></div>
    <div className="settings-layout"><form className="settings-form" onSubmit={save}>
      <div className="form-step"><span className="step-number">1</span><h2>选择服务</h2></div>
      <div className="provider-grid">{PRESETS.map(p=><button type="button" key={p.id} aria-pressed={form.preset===p.id} className={`provider-button ${form.preset===p.id?'selected':''}`} onClick={()=>choose(p.id)}>{p.name}{form.preset===p.id&&<Check size={14}/>}</button>)}</div>
      <p className="field-help">{selected.hint}</p>
      <div className="form-step"><span className="step-number">2</span><h2>填写连接信息</h2></div>
      <label className="field">接口协议<select name="protocol" value={form.provider} onChange={e=>change('provider',e.target.value as ApiConfig['provider'])}><option value="openai">OpenAI 兼容（Chat Completions）</option><option value="anthropic">Anthropic Messages</option><option value="gemini">Google Gemini</option></select></label>
      <label className="field">接口地址<input name="baseUrl" type="url" autoComplete="off" spellCheck={false} value={form.baseUrl} onChange={e=>change('baseUrl',e.target.value)} placeholder="https://你的服务地址/v1" required/></label>
      <p className="field-help">可粘贴基础地址或完整对话接口地址，本地模型可使用 http://127.0.0.1。</p>
      <label className="field" htmlFor="api-key">API Key <span className="field-hint">本地模型可留空</span></label><div className="secret-field"><input id="api-key" name="apiKey" type={showKey?'text':'password'} autoComplete="off" spellCheck={false} value={form.apiKey} onChange={e=>change('apiKey',e.target.value)} placeholder="粘贴你的密钥…"/><button type="button" className="icon-button" onClick={()=>setShowKey(v=>!v)} aria-label={showKey?'隐藏密钥':'显示密钥'}>{showKey?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
      <label className="field">模型名称<input name="model" autoComplete="off" spellCheck={false} value={form.model} onChange={e=>change('model',e.target.value)} placeholder="复制服务商提供的模型 ID…" required/></label>
      <label className="checkbox-label remember-label"><input type="checkbox" checked={form.rememberKey} onChange={e=>change('rememberKey',e.target.checked)}/>在这台设备记住密钥</label>
      <p className="field-help">{form.rememberKey?'密钥将以明文保存在当前浏览器的本地存储中，请仅在自己的设备上使用。':'默认仅在当前浏览器会话保留密钥，结束会话后需要重新填写。'}</p>
      <div className="form-step"><span className="step-number">3</span><h2>测试并保存</h2></div>
      <p className="field-help">测试会向你选择的服务发送一条简短请求，按该服务的计费规则计算。</p>
      {status&&<p role="status" className={`inline-status ${status.kind}`}>{status.kind==='success'&&<Check size={17}/>} {status.text}</p>}
      <div className="settings-actions"><button type="button" className="button secondary" disabled={testing} onClick={test}>{testing?<LoaderCircle size={17} className="loading-icon"/>:<PlugZap size={17}/>} {testing?'正在测试…':'测试连接'}</button><button className="button primary" type="submit" disabled={testing}><Save size={16}/> 保存设置</button></div>
      <button className="text-button danger-text" style={{marginTop:24}} type="button" disabled={testing} onClick={()=>{if(window.confirm('清除当前浏览器保存的接口配置与密钥？手札不受影响。')&&onClear()){setForm({...DEFAULT_CONFIG});setStatus(null);}}}>清除接口设置与密钥</button>
    </form><aside className="settings-guide"><ShieldCheck size={25}/><h2>这是一间本地书房</h2><p>抽牌、牌典与手札在本机即可使用。只有主动请求 AI 解读或测试连接时，相关内容才会发送至你配置的服务。</p><div className="guide-divider"/><h3>需要准备什么？</h3><ol><li>服务商提供的接口地址</li><li>你的 API Key</li><li>账号可用的模型名称</li></ol><h3>还没有 AI 接口？</h3><p>也可以直接抽牌，阅读每张牌的中英牌义，记录自己的想法。</p><a className="text-button" href="#ritual">先去抽一组牌</a><div className="guide-divider"/><p className="small-text">更换服务商时会清空当前表单中的密钥，避免将旧密钥发送给新服务。</p></aside></div>
  </section>;
}
