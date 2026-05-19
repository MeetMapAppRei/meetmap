export const DEFAULT_NOTIFICATION_PREFERENCES = {
  reminders_enabled: true,
  event_updates_enabled: true,
  reminder_24h_enabled: true,
  reminder_2h_enabled: true,
}

export const normalizeNotificationPreferences = (row) => {
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  return {
    reminders_enabled: row.reminders_enabled !== false,
    event_updates_enabled: row.event_updates_enabled !== false,
    reminder_24h_enabled: row.reminder_24h_enabled !== false,
    reminder_2h_enabled: row.reminder_2h_enabled !== false,
  }
}

export const isReminderWindowEnabled = (prefs, windowId) => {
  const p = prefs || DEFAULT_NOTIFICATION_PREFERENCES
  if (!p.reminders_enabled) return false
  if (windowId === '24h') return p.reminder_24h_enabled !== false
  if (windowId === '2h') return p.reminder_2h_enabled !== false
  return true
}
