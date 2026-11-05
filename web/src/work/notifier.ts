// Android版 work/StressNotifier.kt の移植。Web Notifications API を使う

export function notificationSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationSupported()) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notifyStressAlert(score: number, suggestion: string) {
  if (!notificationSupported() || Notification.permission !== 'granted') return;
  new Notification(`ストレス値が高まっています（${score}）`, {
    body: suggestion,
    tag: 'stress_alert', // 連続発火時は最新で置き換える
  });
}
