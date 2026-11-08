import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, Layers3, MoonStar } from 'lucide-react';
import { CARDS, SPREADS } from '../lib/tarot';
import { setRitualMotion, useKeyboardActivation, useRitualMotion } from '../lib/ritualMotion';
import './ritual-room.css';

type CardPlace = [x: number, y: number, angle: number, scale: number];
type RitualProps = {
  onDraw: (spread: string, question: string, reversed: boolean) => void;
  onCard: (id: string) => void;
  pendingId?: string;
};

const placements: Record<string, CardPlace[]> = {
  single: [[0, 0, 0, 1.22]],
  three: [[-63, 3, -9, .91], [0, -3, 0, .96], [63, 3, 9, .91]],
  decision: [[0, 41, 0, .65], [-35, 1, -9, .65], [-69, -38, -14, .65], [35, 1, 9, .65], [69, -38, 14, .65]],
  relationship: [[-71, -20, -14, .68], [71, -20, 14, .68], [0, -35, 0, .73], [-34, 32, -5, .68], [34, 32, 5, .68]],
  celtic: [[-23, -5, 0, .47], [-23, -5, 90, .47], [-23, 42, 0, .47], [-66, -5, 0, .47], [-23, -48, 0, .47], [20, -5, 0, .47], [73, 51, 0, .42], [73, 17, 0, .42], [73, -17, 0, .42], [73, -51, 0, .42]],
  year: Array.from({ length: 12 }, (_, month): CardPlace => {
    const radians = month * Math.PI / 6;
    return [Math.sin(radians) * 85, -Math.cos(radians) * 51, month * 30, .44];
  }),
};
const twelveSlots = Array.from({ length: 12 }, (_, index) => index);
const stack: CardPlace = [0, 0, 0, .72];
const shuffleDuration = 380;
const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' });

function getDailyCard(date: Date) {
  const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let hash = 0;
  for (const char of dateKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CARDS[hash % CARDS.length];
}

function SmallDiagram({ id }: { id: string }) {
  return <svg viewBox="-112 -76 224 152" className="room-small-diagram" aria-hidden="true">
    {placements[id].map(([x, y, angle, scale], i) => (
      <g key={i} transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
        <rect x="-18" y="-30" width="36" height="60" rx="2" />
      </g>
    ))}
  </svg>;
}

function TableDiagram({ id, shuffling, instant }: { id: string; shuffling: boolean; instant: boolean }) {
  const prefix = useId();
  const places = placements[id];
  return <svg className={`room-table-diagram${instant ? ' room-diagram-instant' : ''}`} viewBox="-145 -79 290 158" aria-hidden="true">
    <defs>
      <linearGradient id={prefix + 'metal'} x2=".8" y2="1" gradientUnits="objectBoundingBox">
        <stop stopColor="#8a8d80"/><stop offset=".22" stopColor="#4c5a58"/><stop offset=".54" stopColor="#182b2e"/><stop offset="1" stopColor="#3c4544"/>
      </linearGradient>
      <linearGradient id={prefix + 'edge'} x2=".85" y2="1">
        <stop stopColor="#f2e2be"/><stop offset=".36" stopColor="#ba9773"/><stop offset="1" stopColor="#7b6352"/>
      </linearGradient>
    </defs>
    <g className="room-table-engraving" fill="none">
      <ellipse rx="130" ry="63"/><ellipse rx="124" ry="60" strokeDasharray="1 5"/>
      <path d="M-139 0h17m244 0h17M0-72v14m0 116v14"/>
      <path d="m-107 41 4-1-1 4m205-86 4-1-1 4"/>
    </g>
    {twelveSlots.map((index) => {
      const place = places[index];
      const [x, y, angle, scale] = place ?? stack;
      const style = {
        transform: shuffling
          ? `translate(${index * .68 - 3}px, ${-index * .42}px) rotate(${index * .7 - 4}deg) scale(.8)`
          : `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${scale})`,
        opacity: place ? 1 : 0,
        transitionDelay: `${index * 7}ms`,
      };
      return <g className="room-brass-card" style={style} key={index}>
        <rect x="-18" y="-29" width="38" height="62" rx="2" fill="#060c0e" opacity=".7"/>
        <rect x="-19" y="-32" width="38" height="62" rx="2" fill={`url(#${prefix}metal)`} stroke={`url(#${prefix}edge)`} strokeWidth="1.4"/>
        <rect x="-16.2" y="-29" width="32.4" height="56" rx="1" fill="none" stroke="#d5b689" strokeWidth=".65"/>
        <g fill="none" stroke="#c6ad8a" strokeWidth=".7">
          <path d="M-13-21v-5h5m16 0h5v5M-13 18v5h5m16 0h5v-5"/>
          <ellipse cy="-1" rx="11" ry="17"/>
          <path d="m0-21 9 20-9 20-9-20Z"/>
        </g>
        <path fill="#e1c59d" d="m0-10 2.2 7.1 5.2 1.8-5.2 1.9L0 8l-2.2-7.2-5.2-1.9 5.2-1.8Z"/>
      </g>;
    })}
  </svg>;
}

export default function Ritual({ onDraw, onCard, pendingId }: RitualProps) {
  const [spread, setSpread] = useState('three');
  const [question, setQuestion] = useState('');
  const [reversed, setReversed] = useState(true);
  const [shuffling, setShuffling] = useState(false);
  const [keyboardSelection, setKeyboardSelection] = useState(false);
  const motionEnabled = useRitualMotion();
  const activation = useKeyboardActivation();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = SPREADS.find((item) => item.id === spread)!;
  const date = new Date();
  const today = getDailyCard(date);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  function draw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timer.current !== null) return;
    const fromKeyboard = activation.consume();
    const deal = () => onDraw(spread, question.trim(), reversed);
    if (fromKeyboard || !motionEnabled) {
      timer.current = setTimeout(() => { timer.current = null; }, 0);
      deal();
      return;
    }
    setKeyboardSelection(false);
    setShuffling(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setShuffling(false);
      deal();
    }, shuffleDuration);
  }

  return <section className="ritual-room" aria-labelledby="ritual-title">
    <header className="room-heading">
      <h1 id="ritual-title">青铜长桌</h1>
      <p>选择牌阵，写下你想探寻的问题。</p>
      {pendingId && <a className="room-resume" href={`#selection?id=${pendingId}`}>继续上次选牌 <ArrowUpRight size={14} aria-hidden="true"/></a>}
    </header>
    <div className="room-layout">
      <form className="room-desk" onSubmit={draw}>
        <fieldset className="room-spread-group" disabled={shuffling}>
          <legend>选择牌阵</legend>
          <div className="room-planning">
            <div className="room-picker" onKeyDown={() => setKeyboardSelection(true)} onPointerDown={() => setKeyboardSelection(false)}>
              {SPREADS.map((item) => (
                <label key={item.id} className={`room-choice${item.id === spread ? ' room-choice-selected' : ''}`}>
                  <input type="radio" name="spread" value={item.id} checked={item.id === spread} onChange={() => setSpread(item.id)} />
                  <SmallDiagram id={item.id}/>
                  <span>{item.name}</span>
                  <small>{item.positions.length} 张</small>
                  {item.id === spread && <Check className="room-choice-tick" size={12} aria-hidden="true"/>}
                </label>
              ))}
            </div>
            <div className="room-preview">
              <TableDiagram id={spread} shuffling={shuffling} instant={keyboardSelection}/>
              <div className="room-preview-caption">
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
            </div>
          </div>
        </fieldset>
        <div className="room-question">
          <div className="room-question-label"><label htmlFor="question">此刻，你想探寻什么？</label><span>选填</span></div>
          <textarea id="question" name="question" rows={2} maxLength={1000} disabled={shuffling} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如，面对即将到来的改变，我可以做哪些准备？"/>
        </div>
        <div className="room-deal">
          <div className="room-deal-options">
            <label><input type="checkbox" disabled={shuffling} checked={reversed} onChange={(event) => setReversed(event.target.checked)}/>包含逆位牌</label>
            <label><input type="checkbox" role="switch" aria-label="仪式动画" disabled={shuffling} checked={motionEnabled} onChange={(event) => setRitualMotion(event.target.checked)}/>仪式动画<span className="room-motion-status" aria-hidden="true">{motionEnabled ? '开' : '关'}</span></label>
          </div>
          <button type="submit" className="room-deal-button" disabled={shuffling} {...activation.handlers}>
            <Layers3 size={18} aria-hidden="true"/>{shuffling ? '正在洗牌…' : pendingId ? '重新洗牌选牌' : '洗牌并亲自选牌'}
          </button>
        </div>
      </form>
      <aside className="room-almanac" aria-labelledby="room-daily-title">
        <header><h2 id="room-daily-title"><MoonStar size={18} aria-hidden="true"/>今日一牌</h2><span>{dateLabel.format(date)}</span></header>
        <button className="room-daily-link" type="button" onClick={() => onCard(today.name_short)} aria-label={`查看今日一牌：${today.nameZh}`}>
          <span className="room-daily-niche"><img src={today.image} alt="" width={150} height={255}/></span>
          <strong>{today.nameZh}</strong><span lang="en" className="room-daily-name">{today.name}</span>
          <span className="room-daily-action">读懂这张牌 <ArrowUpRight size={14} aria-hidden="true"/></span>
        </button>
        <p className="room-daily-excerpt">{today.meaningUpZh}</p>
      </aside>
    </div>
  </section>;
}
