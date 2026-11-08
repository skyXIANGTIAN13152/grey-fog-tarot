import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import {
  cancelReplacement, pickAt, revealSlot, startReplacement, type Selection,
} from '../lib/selection';
import { useKeyboardActivation, useRitualMotion } from '../lib/ritualMotion';
import { CARD_MAP, SPREADS } from '../lib/tarot';
import { CardBack } from './Artwork';
import DeckFan from './DeckFan';
import './selection-room.css';

interface SelectionRoomProps {
  selection: Selection;
  spreadId: string;
  question: string;
  onChange: (update: (current: Selection) => Selection) => void;
  onComplete: () => void;
}

type Gesture =
  | { kind: 'pick'; slot: number; origin: DOMRect; keyboard: boolean }
  | { kind: 'flip' | 'replace' | 'cancel'; slot: number; keyboard: boolean };

const pad = (value: number) => String(value).padStart(2, '0');

function revealRemaining(selection: Selection) {
  return selection.revealed.reduce((current, shown, slot) => shown ? current : revealSlot(current, slot), selection);
}

/** A detached card can cross the edge of the scrolling row without being clipped. */
function flyToSeat(origin: DOMRect, seat: HTMLElement, ease: string) {
  const target = seat.getBoundingClientRect();
  const ghost = document.createElement('span');
  ghost.className = 'selection-flight';
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    left: target.left + 'px', top: target.top + 'px',
    width: target.width + 'px', height: target.height + 'px',
  });
  document.body.append(ghost);
  seat.dataset.inFlight = 'true';
  const dx = origin.left + origin.width / 2 - target.left - target.width / 2;
  const dy = origin.top + origin.height / 2 - target.top - target.height / 2;
  const scale = Math.min(origin.width / target.width, origin.height / target.height);
  const flight = ghost.animate([
    { transform: `translate(${dx}px, ${dy}px) rotate(-5deg) scale(${scale})` },
    { transform: `translate(${dx * .54}px, ${dy * .5 - 18}px) rotate(-3deg) scale(${(1 + scale) / 2})`, offset: .48 },
    { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
  ], { duration: 390, easing: ease });
  const finish = () => {
    delete seat.dataset.inFlight;
    ghost.remove();
  };
  flight.onfinish = finish;
  return () => { flight.cancel(); finish(); };
}

export default function SelectionRoom({ selection, spreadId, question, onChange, onComplete }: SelectionRoomProps) {
  const motion = useRitualMotion();
  const activation = useKeyboardActivation();
  const board = useRef<HTMLDivElement>(null);
  const fan = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const clearFlight = useRef<(() => void) | null>(null);
  const turns = useRef(new Set<Animation>());
  const [turning, setTurning] = useState(false);
  const [batch, setBatch] = useState(false);
  const batchTimer = useRef<number | undefined>(undefined);
  const focusComplete = useRef(false);
  const spread = SPREADS.find(item => item.id === spreadId)!;
  const size = selection.slots.length;
  const filled = selection.slots.filter(Boolean).length;
  const shown = selection.revealed.filter(Boolean).length;
  const swapping = selection.replacement !== null;
  const choosing = filled < size || swapping;
  const complete = !choosing && shown === size && !turning && !batch;
  const target = selection.replacement ?? selection.slots.findIndex(card => card === null);

  useLayoutEffect(() => {
    const running = turns.current;
    return () => {
      clearFlight.current?.();
      window.clearTimeout(batchTimer.current);
      for (const turn of running) {
        turn.onfinish = turn.oncancel = null;
        turn.cancel();
      }
      running.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const action = gesture.current;
    gesture.current = null;
    if (!motion) {
      clearFlight.current?.();
      for (const turn of turns.current) turn.finish();
    }
    if (!action || !board.current) return;
    const row = board.current;
    const tile = row.querySelector<HTMLElement>(`[data-seat="${action.slot}"]`);
    if (!tile) return;
    const seat = tile.querySelector<HTMLElement>('.selection-placement')!;
    const firstFanCard = fan.current?.querySelector<HTMLButtonElement>('[data-fan-card]:not(:disabled)');
    if (action.kind === 'replace') {
      if (action.keyboard) firstFanCard?.focus({ preventScroll: true });
      fan.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      return;
    }
    if (action.kind === 'cancel') {
      tile.querySelector<HTMLButtonElement>('.selection-replace')?.focus({ preventScroll: true });
      tile.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      return;
    }
    const animate = motion && !action.keyboard && typeof seat.animate === 'function';
    if (action.kind === 'flip') {
      if (animate) {
        const turn = seat.querySelector<HTMLElement>('.selection-turn')!;
        const ease = getComputedStyle(seat).getPropertyValue('--ease-in-out').trim() || 'ease-in-out';
        const rotation = turn.animate([
          { transform: 'rotateY(0deg)' },
          { transform: 'translateY(-5px) rotateY(90deg)', offset: .5 },
          { transform: 'rotateY(180deg)' },
        ], { duration: 540, easing: ease });
        turns.current.add(rotation);
        setTurning(true);
        rotation.onfinish = rotation.oncancel = () => {
          turns.current.delete(rotation);
          if (turns.current.size === 0) setTurning(false);
        };
        turn.querySelector<HTMLElement>('.selection-glint')?.animate([
          { opacity: 0, transform: 'translateX(-75%)' },
          { opacity: .66, offset: .45 },
          { opacity: 0, transform: 'translateX(75%)' },
        ], { duration: 280, delay: 250, easing: 'ease-out' });
      }
      if (action.keyboard) {
        const next = row.querySelector<HTMLButtonElement>('.selection-card:not(:disabled)');
        if (next) next.focus();
        else focusComplete.current = true;
      }
      return;
    }
    if (action.kind !== 'pick') return;

    // Move the selection rail, without moving the fan away from the pointer.
    if (row.scrollWidth > row.clientWidth) {
      const tileBox = tile.getBoundingClientRect();
      const rail = row.getBoundingClientRect();
      if (tileBox.right > rail.right) row.scrollLeft += tileBox.right - rail.right + 8;
      else if (tileBox.left < rail.left) row.scrollLeft -= rail.left - tileBox.left + 8;
    }
    clearFlight.current?.();
    if (animate) {
      const ease = getComputedStyle(seat).getPropertyValue('--ease-out').trim() || 'ease-out';
      clearFlight.current = flyToSeat(action.origin, seat, ease);
    }
    if (action.keyboard) {
      const next = choosing ? firstFanCard : row.querySelector<HTMLButtonElement>('.selection-card:not(:disabled)');
      next?.focus();
    }
  }, [selection, choosing, motion]);

  useLayoutEffect(() => {
    if (complete && focusComplete.current) {
      focusComplete.current = false;
      board.current?.closest('section')?.querySelector<HTMLButtonElement>('.selection-complete')?.focus();
    }
  }, [complete]);

  useLayoutEffect(() => {
    if (!batch) return;
    const next = selection.revealed.indexOf(false);
    if (choosing || next === -1 || !motion) {
      if (!choosing && !motion) onChange(current => current === selection ? revealRemaining(current) : current);
      setBatch(false);
      return;
    }
    // Schedule only the next turn. A replacement clears it before the deck can change.
    batchTimer.current = window.setTimeout(() => {
      gesture.current = { kind: 'flip', slot: next, keyboard: false };
      onChange(current => current === selection ? revealSlot(current, next) : current);
    }, 115);
    return () => window.clearTimeout(batchTimer.current);
  }, [batch, selection, choosing, motion, onChange]);

  function change(action: Gesture, update: (current: Selection) => Selection) {
    window.clearTimeout(batchTimer.current);
    setBatch(false);
    focusComplete.current = false;
    gesture.current = action;
    // An event from the previous fan must not claim a card from a reshuffled deck.
    onChange(current => current === selection ? update(current) : current);
  }

  function pick(index: number, origin: DOMRect, keyboard: boolean) {
    if (!choosing || !selection.deck[index] || target < 0) return;
    change({ kind: 'pick', slot: target, origin, keyboard }, current => pickAt(current, index));
  }

  const instruction = swapping
    ? `为「${spread.positions[target]}」从扇面重新选一张。`
    : choosing
      ? `从扇面选第 ${filled + 1} 张，放入「${spread.positions[target]}」。`
      : complete ? '牌面已全部翻开。' : batch || shown === size ? '正在翻开牌面…' : '点击牌背，按你喜欢的顺序翻开。';

  return <section className="selection-room" aria-labelledby="selection-title">
    <a className="selection-back" href="#ritual"><ArrowLeft size={15} aria-hidden="true"/> 返回仪式</a>
    <div className="selection-header">
      <div><h1 id="selection-title">{spread.name}</h1>{question && <p className="selection-question">{question}</p>}</div>
      <p className="selection-progress" aria-label={choosing ? `已选 ${filled} 张，共 ${size} 张` : `已翻 ${shown} 张，共 ${size} 张`}>
        {choosing ? '已选' : '已翻'} <b>{pad(choosing ? filled : shown)}</b><span>/ {pad(size)}</span>
      </p>
    </div>
    <div className={`selection-desk ${choosing ? 'is-choosing' : 'is-turning'}${size > 5 ? ' many-seats' : ''}`}>
      <div className="selection-instruction">
        <p role="status" aria-live="polite">{instruction}</p>
        {swapping && <button type="button" {...activation.handlers} onClick={() => {
          change({ kind: 'cancel', slot: target, keyboard: activation.consume() }, cancelReplacement);
        }}>取消换牌</button>}
        {!choosing && size - shown > 1 && <button type="button" disabled={batch} {...activation.handlers}
          onClick={() => {
            const keyboard = activation.consume();
            if (keyboard || !motion) {
              focusComplete.current = keyboard;
              onChange(current => current === selection ? revealRemaining(current) : current);
            } else setBatch(true);
          }}>{batch ? '正在翻牌…' : `翻开剩余 ${size - shown} 张`}</button>}
      </div>
      <div className="selection-seats" ref={board} role="group" aria-label="我的牌阵">
        {selection.slots.map((draw, index) => {
          const revealed = selection.revealed[index];
          const card = revealed && draw ? CARD_MAP.get(draw.cardId) : undefined;
          const position = spread.positions[index];
          const isTarget = choosing && index === target;
          return <div className={`selection-seat${isTarget ? ' is-target' : ''}`} key={index} data-seat={index}>
            <div className="selection-position"><b>{pad(index + 1)}</b><span>{position}</span></div>
            <div className="selection-placement">
              {draw ? <button type="button" className={`selection-card${revealed ? ' is-faceup' : ''}`}
                key={draw.cardId} disabled={choosing || revealed}
                aria-label={card ? `${card.nameZh}，${draw.reversed ? '逆位' : '正位'}，${position}` : `翻开第 ${index + 1} 张牌：${position}`}
                {...activation.handlers} onClick={() => {
                  change({ kind: 'flip', slot: index, keyboard: activation.consume() }, current => revealSlot(current, index));
                }}>
                <span className="selection-turn">
                  <span className="selection-backface"><CardBack/></span>
                  {card && <span className="selection-face"><img src={card.image} alt="" width={200} height={340}
                    className={draw.reversed ? 'is-reversed' : ''}/><span className="selection-glint" aria-hidden="true"/></span>}
                </span>
              </button> : <div className="selection-empty" aria-label={`第 ${index + 1} 张待选`}>
                <span aria-hidden="true">✧</span>
              </div>}
            </div>
            {card && draw && <div className="selection-identity"><strong>{card.nameZh}</strong><small>{draw.reversed ? '逆位' : '正位'}</small></div>}
            {draw && <button type="button" className="selection-replace" disabled={swapping && isTarget}
              aria-label={`换掉第 ${index + 1} 张牌：${position}`} {...activation.handlers} onClick={() => {
                change({ kind: 'replace', slot: index, keyboard: activation.consume() }, current => startReplacement(current, index));
              }}>
              <RotateCcw size={12} aria-hidden="true"/>{swapping && isTarget ? '正在换牌' : '换这张'}
            </button>}
          </div>;
        })}
      </div>
      {choosing && <div ref={fan} className="selection-fan-area">
        <DeckFan cards={selection.deck} onPick={pick} disabled={false} shuffleKey={selection.shuffleKey} motion={motion}/>
      </div>}
      {complete && <div className="selection-finish">
        <button type="button" className="button primary selection-complete" onClick={onComplete}>
          完成并查看解读 <ArrowRight size={16} aria-hidden="true"/>
        </button>
      </div>}
    </div>
  </section>;
}
