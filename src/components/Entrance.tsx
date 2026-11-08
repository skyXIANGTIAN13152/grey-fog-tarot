import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ArrowRight, Layers3, LockKeyhole } from 'lucide-react';
import { ritualMotionEnabled, useKeyboardActivation } from '../lib/ritualMotion';

/** A brass seal cut around a single crimson star. */
function ClubSeal() {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.15">
      <path d="M32 2 37 8 47 9 51 17 58 23 56 32 58 41 51 47 47 55 37 56 32 62 27 56 17 55 13 47 6 41 8 32 6 23 13 17 17 9 27 8Z"/>
      <circle cx="32" cy="32" r="21.2"/><circle cx="32" cy="32" r="18.6" strokeDasharray="1 4"/>
      <path d="M17 36q15 18 30-1M23 24q8-11 18-8-8 0-10 7M14 32h7m22 0h7M32 12v5m0 31v5"/>
      <path d="m32 17 3.5 11.2L47 32l-11.5 3.2L32 47l-3.5-11.8L17 32l11.5-3.8Z"/>
    </g>
    <path d="m32 24 3.1 8-3.1 8-3.1-8Z" fill="#be6971" stroke="#e3b0a4" strokeWidth=".65"/>
  </svg>;
}

function EngravedCorner({ side }: { side: string }) {
  return <svg className={`gate-corner gate-corner-${side}`} viewBox="0 0 72 72" fill="none" aria-hidden="true">
    <path d="M1 70V1h69M6 49V6h43M1 31l8-8V9h14l8-8M12 36c0-13 9-20 24-24-4 15-11 24-24 24Z" stroke="currentColor"/>
    <path d="M12 36 35 13M13 13l4 1-3 3Z" stroke="currentColor"/><path d="m1 56 3 5-3 5M56 1l5 3 5-3" fill="currentColor"/>
  </svg>;
}

const ENTRY_TRANSITION_MS = 450;

export default function Entrance() {
  const activation = useKeyboardActivation();
  const [entering, setEntering] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function enter(event: MouseEvent<HTMLAnchorElement>) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (activation.consume() || !ritualMotionEnabled()) return;
    event.preventDefault();
    if (timer.current !== undefined) return;
    setEntering(true);
    timer.current = window.setTimeout(() => { location.hash = 'ritual'; }, ENTRY_TRANSITION_MS);
  }

  return (
    <section className={`assembly-gate${entering ? ' is-entering' : ''}`} aria-labelledby="gate-title">
      <picture className="gate-scene">
        <source media="(max-width: 600px)" srcSet="/scenes/assembly-small.webp"/>
        <img src="/scenes/assembly.webp" alt="" fetchPriority="high" decoding="async"/>
      </picture>
      <div className="gate-shade" aria-hidden="true" />
      <div className="gate-frame" aria-hidden="true">
        {['nw', 'ne', 'sw', 'se'].map(side => <EngravedCorner side={side} key={side}/>)}
      </div>
      <header className="gate-masthead">
        <span className="gate-seal"><ClubSeal/></span>
        <div className="gate-wordmark"><strong>塔罗会</strong><span lang="en">The Tarot Club</span></div>
      </header>
      <div className="gate-invitation">
        <div className="gate-rule" aria-hidden="true"><b/>✦</div>
        <h1 id="gate-title">灰雾之上</h1>
        <div className="gate-subtitle" lang="en">Above the Grey Fog</div>
        <p>青铜长桌前，为你留了一席。</p>
        <a className="gate-enter" href="#ritual" {...activation.handlers} onClick={enter}>
          <span className="gate-gem" aria-hidden="true"/>
          <span>开启占卜仪式</span><ArrowRight size={20} strokeWidth={1.35} aria-hidden="true"/>
        </a>
      </div>
      <footer className="gate-colophon">
        <span><Layers3 size={14} aria-hidden="true"/>78 张塔罗牌 <i aria-hidden="true"/> 6 种牌阵</span>
        <span><LockKeyhole size={13} aria-hidden="true"/>手札保存在本机</span>
      </footer>
      {entering && <div className="gate-mist" aria-hidden="true"/>}
    </section>
  );
}
