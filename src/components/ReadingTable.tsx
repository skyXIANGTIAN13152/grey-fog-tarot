import {CARD_MAP} from '../lib/tarot';
import type {Reading} from '../types';
import './reading-motion.css';

export default function ReadingTable({reading, onCard}: {reading: Reading; onCard: (id: string) => void}) {
  return <div className={`reading-table tarot-motion-table spread-${reading.spreadId}`} role="group" aria-label="本次牌阵">
    {reading.cards.map((draw, index) => {
      const card = CARD_MAP.get(draw.cardId)!;
      const orientation = draw.reversed ? '逆位' : '正位';
      return <div className={`drawn-card drawn-${index}`} key={draw.cardId}>
        <span className="position-label"><span>{String(index + 1).padStart(2, '0')}</span> {draw.position}</span>
        <button type="button" className="flip-card recorded-card" onClick={() => onCard(card.name_short)}
          aria-label={`查看${card.nameZh}${orientation}牌义`}>
          <img src={card.image} alt={card.nameZh} width={200} height={340} className={draw.reversed ? 'reversed' : ''}/>
        </button>
        <div className="drawn-caption">
          <h2>{card.nameZh}</h2>
          <span className={draw.reversed ? 'orientation reversed-label' : 'orientation'}>{orientation}<span> · {card.name}</span></span>
        </div>
      </div>;
    })}
  </div>;
}
