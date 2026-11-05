// 日付ユーティリティ。Android版の Calendar/SimpleDateFormat 相当をローカルタイムで実装する

const WEEKDAY_CHARS = ['日', '月', '火', '水', '木', '金', '土'];

/** その日の0時（ローカルタイム）のepochミリ秒 */
export function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 日付を delta 日ずらす（DST等を考慮して Date の日加算で行う） */
export function shiftDay(dayStart: number, delta: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + delta);
  return d.getTime();
}

export function daysAgo(days: number, from: number = Date.now()): number {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d.getTime();
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** "HH:mm" */
export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "yyyy年M月d日(曜)" */
export function formatDateLabel(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAY_CHARS[d.getDay()]})`;
}

/** "M/d(曜)" */
export function formatShortDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_CHARS[d.getDay()]})`;
}

/** "M/d(曜) HH:mm" */
export function formatShortDateTime(timestamp: number): string {
  return `${formatShortDate(timestamp)} ${formatTime(timestamp)}`;
}

/** "yyyy/M/d(曜) HH:mm" */
export function formatFullDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_CHARS[d.getDay()]}) ${formatTime(timestamp)}`;
}

/** 0時からの経過時間（時間単位の小数、0.0〜24.0） */
export function hourFractionOf(timestamp: number): number {
  const d = new Date(timestamp);
  return d.getHours() + d.getMinutes() / 60;
}
