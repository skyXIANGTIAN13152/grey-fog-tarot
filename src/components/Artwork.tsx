export function Sigil({className = '', simple = false}: {className?: string; simple?: boolean}) {
  return <svg className={className} viewBox="0 0 400 400" fill="none" aria-hidden="true">
    <circle cx="200" cy="200" r="180" stroke="currentColor" strokeWidth=".7" />
    <circle cx="200" cy="200" r="169" stroke="currentColor" strokeWidth=".5" strokeDasharray="1 9" />
    <circle cx="200" cy="200" r="148" stroke="currentColor" strokeWidth=".6" />
    <path d="M200 40 338.56 280H61.44Z M200 360 61.44 120h277.12Z" stroke="currentColor" strokeWidth=".7" />
    <circle cx="200" cy="200" r="92" stroke="currentColor" strokeWidth=".8" />
    <circle cx="200" cy="200" r="76" stroke="currentColor" strokeWidth=".5" />
    {Array.from({length: 12}, (_, i) => <g key={i} transform={`rotate(${i * 30} 200 200)`}>
      <path d="M200 9v18 M196 13l4-5 4 5 M200 43v9" stroke="currentColor" strokeWidth="1" />
      {!simple && <path d="m200 61 3 5-3 5-3-5Z" fill="currentColor" />}
    </g>)}
    <path d="m200 122 17 56 61 22-61 22-17 56-17-56-61-22 61-22Z" stroke="currentColor" strokeWidth="1.2" />
    <path d="M155 200q45-40 90 0-45 40-90 0Z" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="200" cy="200" r="14" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="200" cy="200" r="5" fill="currentColor" />
  </svg>;
}

export function CardBack() {
  return <span className="card-back engraved-back" aria-hidden="true"/>;
}