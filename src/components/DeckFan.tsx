import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useKeyboardActivation } from '../lib/ritualMotion';
import { CardBack } from './Artwork';
import './deck-fan.css';

interface DeckFanProps {
  cards: readonly ({ cardId: string; reversed: boolean } | null)[];
  onPick: (index: number, origin: DOMRect, keyboard: boolean) => void;
  disabled: boolean;
  shuffleKey: number;
  motion: boolean;
}

export default function DeckFan({ cards, onPick, disabled, shuffleKey, motion }: DeckFanProps) {
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [anchor, setAnchor] = useState(0);
  const [grouped, setGrouped] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [pointed, setPointed] = useState<number | null>(null);
  const [keyboardPage, setKeyboardPage] = useState(false);
  const focusAfterPick = useRef(false);
  const keyboard = useKeyboardActivation();

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const measured = element.clientWidth;
      if (measured > 0) setWidth(measured);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const wide = width >= 780;
  const whole = wide && !grouped;
  // The magnified view leaves enough of each edge exposed to select it by touch.
  const groupSize = width >= 660 ? 13 : width >= 500 ? 9 : width >= 360 ? 6 : width >= 280 ? 5 : 4;
  const pageSize = whole ? Math.max(1, cards.length) : groupSize;
  const pages = Array.from({ length: Math.ceil(cards.length / pageSize) }, (_, i) => i * pageSize)
    .filter(start => cards.slice(start, start + pageSize).some(Boolean));
  const desiredStart = Math.floor(anchor / pageSize) * pageSize;
  const pageStart = pages.find(start => start >= desiredStart) ?? pages[0] ?? 0;
  const pageIndex = pages.indexOf(pageStart);
  const page = cards.slice(pageStart, pageStart + pageSize);
  const remaining = cards.reduce((total, card) => total + Number(Boolean(card)), 0);
  const available = page.flatMap((card, i) => card ? [pageStart + i] : []);
  const tabStop = available.find(i => i >= focusIndex) ?? available[0];

  useLayoutEffect(() => {
    if (!focusAfterPick.current) return;
    focusAfterPick.current = false;
    stage.current?.querySelector<HTMLButtonElement>(`[data-fan-card="${tabStop}"]`)?.focus({ preventScroll: true });
  }, [cards, tabStop]);

  function changePage(direction: number) {
    setKeyboardPage(keyboard.consume());
    setAnchor(pages[(pageIndex + direction + pages.length) % pages.length]);
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    keyboard.handlers.onKeyDown(event);
    if (!whole) return;
    const current = available.indexOf(index);
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = available[(current + 1) % available.length]; break;
      case 'ArrowLeft': next = available[(current + available.length - 1) % available.length]; break;
      case 'Home': next = available[0]; break;
      case 'End': next = available[available.length - 1]; break;
      default: return;
    }
    event.preventDefault();
    stage.current?.querySelector<HTMLButtonElement>(`[data-fan-card="${next}"]`)?.focus({ preventScroll: true });
  }

  const cardWidth = Math.min(128, Math.max(72, width * .16));
  const cardHeight = cardWidth * 5 / 3;
  const angleLimit = page.length === 1 ? 0 : whole ? 24 : page.length <= 6 ? 21 : 28;
  const radians = angleLimit * Math.PI / 180;
  const edgeWidth = cardWidth * Math.cos(radians) + cardHeight * Math.sin(radians);
  const halfSpan = Math.min(Math.max(0, (width - edgeWidth - 24) / 2), (page.length - 1) * cardWidth * .27);
  const radius = radians ? halfSpan / Math.sin(radians) : 0;
  const rise = radius * (1 - Math.cos(radians));
  const tableStyle = {
    '--fan-width': `${cardWidth}px`,
    '--fan-height': `${cardHeight}px`,
    '--fan-strip': `${Math.max(4, halfSpan * 1.5 / Math.max(page.length - 1, 1))}px`,
    height: Math.ceil(cardHeight + rise + 50),
  } as CSSProperties;

  return <section className="deck-fan" aria-label="扇形暗牌">
    <div ref={stage} className={`deck-fan-stage${motion ? ' has-motion' : ''}${whole ? ' deck-fan-whole' : ''}`} style={tableStyle}>
      <div className="deck-fan-sweep" key={`${shuffleKey}-${pageStart}-${pageSize}`} data-open={motion && !keyboardPage}>
        {page.map((card, offset) => {
          const index = pageStart + offset;
          const fraction = page.length > 1 ? 2 * offset / (page.length - 1) - 1 : 0;
          const angle = fraction * radians;
          const style = {
            '--fan-x': `${radius * Math.sin(angle)}px`,
            '--fan-y': `${radius * (1 - Math.cos(angle))}px`,
            '--fan-angle': `${fraction * angleLimit}deg`,
            '--fan-order': offset,
            zIndex: offset + 1,
          } as CSSProperties;
          // Keep the place of a picked card empty so its neighbours stay where they were.
          if (!card) return null;
          return <div key={index} className="deck-fan-place" style={style}>
            <button type="button" className="deck-fan-card" data-fan-card={index} disabled={disabled}
              aria-label={`选择第 ${index + 1} 张暗牌`} {...keyboard.handlers}
              tabIndex={whole && index !== tabStop ? -1 : 0}
              onKeyDown={event => moveFocus(event, index)}
              onFocus={() => { setFocusIndex(index); setPointed(index); }}
              onBlur={() => { keyboard.handlers.onBlur(); setPointed(null); }}
              onPointerEnter={() => { if (whole) setPointed(index); }}
              onPointerLeave={() => { if (whole) setPointed(null); }}
              onClick={event => {
                const fromKeyboard = keyboard.consume();
                focusAfterPick.current = fromKeyboard;
                setPointed(null);
                const back = event.currentTarget.firstElementChild!;
                onPick(index, back.getBoundingClientRect(), fromKeyboard);
              }}>
              <span className="deck-fan-ink" aria-hidden="true">
                <CardBack/>
                {!whole && <span className="deck-fan-number">{String(index + 1).padStart(2, '0')}</span>}
              </span>
            </button>
          </div>;
        })}
      </div>
    </div>
    <div className="deck-fan-controls">
    {wide && <div role="group" aria-label="选牌视图" className="deck-fan-modes">
      {[false, true].map(showGroups => <button type="button" key={String(showGroups)} aria-pressed={showGroups === grouped}
        {...keyboard.handlers} onClick={() => { setKeyboardPage(keyboard.consume()); setPointed(null); setGrouped(showGroups); }}>
        {showGroups ? '分组选牌' : '整副牌'}
      </button>)}
    </div>}
    {!whole && <div className="deck-fan-navigation">
      <button type="button" aria-label="上一组暗牌" disabled={disabled || pages.length < 2}
        {...keyboard.handlers} onClick={() => changePage(-1)}><ChevronLeft size={16} aria-hidden="true"/>上一组</button>
      <label className="deck-fan-range">
        <select aria-label="跳到一组暗牌" value={pageStart} disabled={disabled || pages.length < 2}
          onChange={event => { setKeyboardPage(true); setAnchor(Number(event.currentTarget.value)); }}>
          {pages.map(start => <option key={start} value={start}>
            第 {start + 1}–{Math.min(start + pageSize, cards.length)} 张
          </option>)}
        </select>
        <ChevronDown size={12} aria-hidden="true"/>
      </label>
      <button type="button" aria-label="下一组暗牌" disabled={disabled || pages.length < 2}
        {...keyboard.handlers} onClick={() => changePage(1)}>下一组<ChevronRight size={16} aria-hidden="true"/></button>
    </div>}
    </div>
    <p className="deck-fan-count">{whole && pointed !== null && cards[pointed] && <span>第 {pointed + 1} 张暗牌 · </span>}牌堆剩余 {remaining} / {cards.length} 张</p>
  </section>;
}
