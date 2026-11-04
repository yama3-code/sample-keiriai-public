import type { ReactNode } from "react";
import fig from "./Figures.module.css";

// 解説の図で使い回す、外部画像を使わない簡単なイラスト集。
// 色は紺・青・薄い青を基本に、注意はオレンジ、OKは緑で表す。
const C = { navy: "#183d60", blue: "#35648d", pale: "#dfe8ef", paper: "#ffffff", skin: "#f3d6bd", hair: "#3b2f2a", orange: "#d9892b", green: "#2d7a52", red: "#c0483a", gray: "#93a4b3" };

export type IllustName =
  | "person" | "ai" | "checker" | "desk" | "cloud" | "cabinet" | "sheet" | "ledger" | "key" | "lock"
  | "browser" | "code" | "question" | "clock" | "book" | "folder" | "warning" | "globe" | "laptop"
  | "ticket" | "shield" | "calculator" | "trash" | "restore" | "yen" | "mail" | "gear" | "people" | "check" | "stop";

const shapes: Record<IllustName, ReactNode> = {
  person: <><circle cx="32" cy="20" r="10" fill={C.skin} /><path d="M22 18a10 10 0 0 1 20 0c-3-4-8-5-10-5s-7 1-10 5z" fill={C.hair} /><path d="M14 58c0-12 8-20 18-20s18 8 18 20z" fill={C.blue} /><rect x="36" y="40" width="16" height="12" rx="1.5" fill={C.paper} stroke={C.navy} strokeWidth="1.5" /><path d="M39 44h10M39 48h7" stroke={C.gray} strokeWidth="1.5" /></>,
  people: <><circle cx="22" cy="22" r="8" fill={C.skin} /><path d="M8 54c0-10 6-17 14-17s14 7 14 17z" fill={C.blue} /><circle cx="43" cy="24" r="8" fill={C.skin} /><path d="M29 56c0-10 6-17 14-17s14 7 14 17z" fill={C.navy} /></>,
  ai: <><path d="M32 6v7" stroke={C.navy} strokeWidth="2.5" strokeLinecap="round" /><circle cx="32" cy="6" r="3" fill={C.orange} /><rect x="12" y="13" width="40" height="32" rx="10" fill={C.pale} stroke={C.navy} strokeWidth="2.5" /><circle cx="24" cy="28" r="4" fill={C.navy} /><circle cx="40" cy="28" r="4" fill={C.navy} /><path d="M25 37q7 5 14 0" stroke={C.navy} strokeWidth="2.5" fill="none" strokeLinecap="round" /><path d="M20 45h24l4 13H16z" fill={C.blue} /><path d="M50 50l3-3 3 3-3 3z" fill={C.orange} /></>,
  checker: <><rect x="12" y="8" width="32" height="46" rx="3" fill={C.paper} stroke={C.navy} strokeWidth="2.5" /><rect x="20" y="4" width="16" height="8" rx="2" fill={C.blue} /><path d="M18 22l3 3 6-6M18 34l3 3 6-6" stroke={C.green} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M31 23h8M31 35h8" stroke={C.gray} strokeWidth="2" /><circle cx="44" cy="44" r="9" fill={C.pale} stroke={C.navy} strokeWidth="2.5" /><path d="M50.5 50.5l7 7" stroke={C.navy} strokeWidth="3.5" strokeLinecap="round" /></>,
  desk: <><circle cx="32" cy="16" r="8" fill={C.skin} /><path d="M18 40c0-9 6-15 14-15s14 6 14 15z" fill={C.navy} /><rect x="6" y="38" width="52" height="8" rx="2" fill={C.blue} /><rect x="10" y="46" width="44" height="12" fill={C.pale} stroke={C.blue} strokeWidth="2" /><path d="M44 34a5 5 0 0 1 10 0z" fill={C.orange} /><path d="M49 31v-2" stroke={C.orange} strokeWidth="2" /></>,
  cloud: <><path d="M18 46a11 11 0 0 1 1-22 14 14 0 0 1 27 3 9.5 9.5 0 0 1 0 19z" fill={C.pale} stroke={C.navy} strokeWidth="2.5" strokeLinejoin="round" /><circle cx="32" cy="36" r="6" fill="none" stroke={C.blue} strokeWidth="3" /><path d="M32 26v3M32 43v3M22 36h3M39 36h3" stroke={C.blue} strokeWidth="3" strokeLinecap="round" /></>,
  cabinet: <><rect x="14" y="6" width="36" height="52" rx="2" fill={C.pale} stroke={C.navy} strokeWidth="2.5" /><path d="M14 23h36M14 40h36" stroke={C.navy} strokeWidth="2.5" /><rect x="27" y="13" width="10" height="4" rx="1" fill={C.blue} /><rect x="27" y="30" width="10" height="4" rx="1" fill={C.blue} /><rect x="27" y="47" width="10" height="4" rx="1" fill={C.blue} /></>,
  sheet: <><path d="M14 6h26l10 10v42H14z" fill={C.paper} stroke={C.navy} strokeWidth="2.5" strokeLinejoin="round" /><path d="M40 6v10h10" fill={C.pale} stroke={C.navy} strokeWidth="2.5" strokeLinejoin="round" /><path d="M20 26h24M20 34h24M20 42h24M20 50h24M30 22v32" stroke={C.gray} strokeWidth="1.8" /><rect x="20" y="22" width="24" height="4" fill={C.green} opacity=".35" /></>,
  ledger: <><rect x="8" y="10" width="48" height="44" rx="3" fill={C.paper} stroke={C.navy} strokeWidth="2.5" /><path d="M32 10v44M8 22h48" stroke={C.navy} strokeWidth="2" /><text x="20" y="19.5" fontSize="8" textAnchor="middle" fill={C.navy} fontWeight="700">借</text><text x="44" y="19.5" fontSize="8" textAnchor="middle" fill={C.navy} fontWeight="700">貸</text><path d="M13 31h14M13 39h10M37 31h14M37 39h10" stroke={C.gray} strokeWidth="2" /><path d="M13 47h14M37 47h14" stroke={C.blue} strokeWidth="2.5" /></>,
  key: <><circle cx="20" cy="32" r="11" fill={C.orange} /><circle cx="20" cy="32" r="4" fill={C.paper} /><path d="M31 32h25M48 32v8M54 32v6" stroke={C.orange} strokeWidth="5" strokeLinecap="round" /></>,
  lock: <><path d="M20 28v-7a12 12 0 0 1 24 0v7" fill="none" stroke={C.navy} strokeWidth="4" /><rect x="12" y="28" width="40" height="28" rx="4" fill={C.blue} /><circle cx="32" cy="40" r="4" fill={C.paper} /><path d="M32 43v6" stroke={C.paper} strokeWidth="3" strokeLinecap="round" /></>,
  browser: <><rect x="6" y="10" width="52" height="42" rx="4" fill={C.paper} stroke={C.navy} strokeWidth="2.5" /><path d="M6 20h52" stroke={C.navy} strokeWidth="2.5" /><circle cx="12" cy="15" r="1.8" fill={C.red} /><circle cx="18" cy="15" r="1.8" fill={C.orange} /><circle cx="24" cy="15" r="1.8" fill={C.green} /><rect x="13" y="27" width="22" height="4" rx="1" fill={C.blue} /><path d="M13 37h38M13 43h30" stroke={C.gray} strokeWidth="2" /></>,
  code: <><rect x="6" y="10" width="52" height="42" rx="4" fill={C.navy} /><path d="M24 24l-8 8 8 8M40 24l8 8-8 8" stroke={C.paper} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M35 21l-6 22" stroke={C.orange} strokeWidth="3" strokeLinecap="round" /></>,
  question: <><path d="M8 12h48v32H30l-12 10v-10H8z" fill={C.pale} stroke={C.navy} strokeWidth="2.5" strokeLinejoin="round" /><path d="M27 23a5 5 0 1 1 7 4.6c-1.5.7-2 1.6-2 3.4" stroke={C.navy} strokeWidth="3" fill="none" strokeLinecap="round" /><circle cx="32" cy="37" r="2" fill={C.navy} /></>,
  clock: <><circle cx="32" cy="32" r="24" fill={C.paper} stroke={C.navy} strokeWidth="2.5" /><path d="M32 16v16l11 7" stroke={C.blue} strokeWidth="3.5" fill="none" strokeLinecap="round" /><circle cx="32" cy="32" r="2.5" fill={C.navy} /></>,
  book: <><path d="M32 14c-6-4-14-5-22-4v40c8-1 16 0 22 4 6-4 14-5 22-4V10c-8-1-16 0-22 4z" fill={C.paper} stroke={C.navy} strokeWidth="2.5" strokeLinejoin="round" /><path d="M32 14v40" stroke={C.navy} strokeWidth="2.5" /><path d="M16 22h10M16 29h10M16 36h8M38 22h10M38 29h10M38 36h8" stroke={C.gray} strokeWidth="1.8" /></>,
  folder: <><path d="M6 16a3 3 0 0 1 3-3h14l5 6h27a3 3 0 0 1 3 3v29a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill={C.orange} opacity=".85" /><rect x="6" y="24" width="52" height="30" rx="3" fill="#e8b25f" /></>,
  warning: <><path d="M32 8l26 46H6z" fill="#f6dfb4" stroke={C.orange} strokeWidth="3" strokeLinejoin="round" /><path d="M32 24v14" stroke={C.orange} strokeWidth="4" strokeLinecap="round" /><circle cx="32" cy="45" r="2.6" fill={C.orange} /></>,
  globe: <><circle cx="32" cy="32" r="24" fill={C.pale} stroke={C.navy} strokeWidth="2.5" /><ellipse cx="32" cy="32" rx="10" ry="24" fill="none" stroke={C.blue} strokeWidth="2" /><path d="M8 32h48M12 20h40M12 44h40" stroke={C.blue} strokeWidth="2" /></>,
  laptop: <><rect x="12" y="12" width="40" height="28" rx="2" fill={C.paper} stroke={C.navy} strokeWidth="2.5" /><rect x="16" y="16" width="32" height="20" fill={C.pale} /><path d="M4 46h56l-4 6H8z" fill={C.blue} /></>,
  ticket: <><path d="M6 20h52v8a4 4 0 0 0 0 8v8H6v-8a4 4 0 0 0 0-8z" fill="#f6dfb4" stroke={C.orange} strokeWidth="2.5" strokeLinejoin="round" /><path d="M40 20v24" stroke={C.orange} strokeWidth="2" strokeDasharray="3 3" /><path d="M14 29h18M14 35h12" stroke={C.orange} strokeWidth="2.5" strokeLinecap="round" /></>,
  shield: <><path d="M32 6l22 8v14c0 15-9 25-22 30C19 53 10 43 10 28V14z" fill={C.pale} stroke={C.navy} strokeWidth="2.5" strokeLinejoin="round" /><path d="M22 31l7 7 13-14" stroke={C.green} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  calculator: <><rect x="14" y="6" width="36" height="52" rx="4" fill={C.navy} /><rect x="19" y="11" width="26" height="11" rx="1.5" fill={C.pale} /><g fill={C.paper}><rect x="19" y="27" width="7" height="6" rx="1" /><rect x="29" y="27" width="7" height="6" rx="1" /><rect x="19" y="36" width="7" height="6" rx="1" /><rect x="29" y="36" width="7" height="6" rx="1" /><rect x="19" y="45" width="7" height="6" rx="1" /><rect x="29" y="45" width="7" height="6" rx="1" /></g><rect x="39" y="27" width="6" height="24" rx="1" fill={C.orange} /></>,
  trash: <><path d="M16 18h32l-3 38H19z" fill={C.pale} stroke={C.navy} strokeWidth="2.5" strokeLinejoin="round" /><path d="M12 18h40M26 18v-6h12v6M27 26v22M37 26v22" stroke={C.navy} strokeWidth="2.5" strokeLinecap="round" /></>,
  restore: <><path d="M16 32a16 16 0 1 0 5-11.6" fill="none" stroke={C.blue} strokeWidth="4" strokeLinecap="round" /><path d="M12 12v12h12" fill="none" stroke={C.blue} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M32 22v11l7 5" stroke={C.navy} strokeWidth="3" fill="none" strokeLinecap="round" /></>,
  yen: <><circle cx="32" cy="32" r="24" fill="#f6dfb4" stroke={C.orange} strokeWidth="2.5" /><path d="M23 18l9 13 9-13M32 31v17M24 34h16M24 41h16" stroke={C.orange} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  mail: <><rect x="6" y="14" width="52" height="36" rx="3" fill={C.paper} stroke={C.navy} strokeWidth="2.5" /><path d="M8 17l24 18 24-18" fill="none" stroke={C.navy} strokeWidth="2.5" strokeLinejoin="round" /></>,
  gear: <><path d="M28 6h8l1.5 7 5 2 6-4 5.5 5.5-4 6 2 5 7 1.5v8l-7 1.5-2 5 4 6-5.5 5.5-6-4-5 2-1.5 7h-8l-1.5-7-5-2-6 4-5.5-5.5 4-6-2-5-7-1.5v-8l7-1.5 2-5-4-6 5.5-5.5 6 4 5-2z" fill={C.pale} stroke={C.navy} strokeWidth="2.5" strokeLinejoin="round" /><circle cx="32" cy="32" r="8" fill={C.blue} /></>,
  check: <><circle cx="32" cy="32" r="24" fill="#d8eee1" stroke={C.green} strokeWidth="2.5" /><path d="M20 33l8 8 16-17" stroke={C.green} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  stop: <><circle cx="32" cy="32" r="24" fill="#f6d9d4" stroke={C.red} strokeWidth="2.5" /><path d="M23 23l18 18M41 23L23 41" stroke={C.red} strokeWidth="5" strokeLinecap="round" /></>,
};

export function Illust({ name, size = 64, label }: { name: IllustName; size?: number; label?: string }) {
  return <svg viewBox="0 0 64 64" width={size} height={size} className={fig.illust} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>{shapes[name]}</svg>;
}

// ---- 図の共通部品 ----

export function Figure({ title, caption, children, note }: { title: string; caption?: string; children: ReactNode; note?: ReactNode }) {
  return <figure className={fig.figure}>
    <figcaption className={fig.figcaption}><strong>{title}</strong>{caption ? <span>{caption}</span> : null}</figcaption>
    {children}
    {note ? <p className={fig.note}>{note}</p> : null}
  </figure>;
}

export type CardItem = { icon: IllustName; title: string; who?: string; text?: ReactNode; tone?: "ok" | "warn" | "stop" | "plain" };

/** 横に並ぶ流れ図。スマホでは縦に並び、矢印も下向きになる。 */
export function Flow({ items, arrow = "→" }: { items: CardItem[]; arrow?: string }) {
  return <ol className={fig.flow}>{items.map((item, i) => <li key={item.title} className={fig.flowItem}>
    <Card item={item} />
    {i < items.length - 1 ? <span className={fig.flowArrow} aria-hidden="true">{arrow}</span> : null}
  </li>)}</ol>;
}

/** 番号付きの手順。 */
export function Steps({ items }: { items: CardItem[] }) {
  return <ol className={fig.steps}>{items.map((item, i) => <li key={item.title} className={fig.stepItem}>
    <span className={fig.stepNo}>{i + 1}</span>
    <Illust name={item.icon} size={52} />
    <div>{item.who ? <small>{item.who}</small> : null}<strong>{item.title}</strong>{item.text ? <p>{item.text}</p> : null}</div>
  </li>)}</ol>;
}

/** カードを格子状に並べる。 */
export function Grid({ items, columns = 3 }: { items: CardItem[]; columns?: 2 | 3 | 4 }) {
  return <ul className={`${fig.grid} ${fig[`cols${columns}`]}`}>{items.map((item) => <li key={item.title}><Card item={item} /></li>)}</ul>;
}

export function Card({ item }: { item: CardItem }) {
  return <div className={`${fig.card} ${item.tone ? fig[item.tone] : ""}`}>
    <Illust name={item.icon} />
    {item.who ? <small className={fig.who}>{item.who}</small> : null}
    <strong>{item.title}</strong>
    {item.text ? <p>{item.text}</p> : null}
  </div>;
}

/** 左右で見比べる図。 */
export function Compare({ left, right }: { left: { title: string; icon: IllustName; tone?: "ok" | "warn" | "stop" | "plain"; points: ReactNode[] }; right: { title: string; icon: IllustName; tone?: "ok" | "warn" | "stop" | "plain"; points: ReactNode[] } }) {
  return <div className={fig.compare}>{[left, right].map((side) => <section key={side.title} className={`${fig.compareSide} ${side.tone ? fig[side.tone] : ""}`}>
    <div className={fig.compareHead}><Illust name={side.icon} size={48} /><strong>{side.title}</strong></div>
    <ul>{side.points.map((point, i) => <li key={i}>{point}</li>)}</ul>
  </section>)}</div>;
}

/** 大きな数字で見せるタイル。 */
export function Stats({ items }: { items: { value: string; unit?: string; label: string }[] }) {
  return <ul className={fig.stats}>{items.map((item) => <li key={item.label}><span className={fig.statValue}>{item.value}<small>{item.unit}</small></span><span className={fig.statLabel}>{item.label}</span></li>)}</ul>;
}

/** 会話の吹き出し。 */
export function Talk({ lines }: { lines: { icon: IllustName; who: string; text: ReactNode; side?: "left" | "right" }[] }) {
  return <ul className={fig.talk}>{lines.map((line, i) => <li key={i} className={line.side === "right" ? fig.talkRight : undefined}>
    <div className={fig.talkWho}><Illust name={line.icon} size={48} /><small>{line.who}</small></div>
    <p className={fig.bubble}>{line.text}</p>
  </li>)}</ul>;
}
