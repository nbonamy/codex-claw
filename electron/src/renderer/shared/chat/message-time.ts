const dayMs = 24 * 60 * 60 * 1000

export function formatMessageSentAt(value: string, now = new Date()) {
  const sentAt = new Date(value)
  if (Number.isNaN(sentAt.getTime())) {
    return ''
  }

  const timeOptions = {
    hour: 'numeric',
    minute: '2-digit',
  } satisfies Intl.DateTimeFormatOptions

  if (isSameLocalDay(sentAt, now)) {
    return new Intl.DateTimeFormat(undefined, timeOptions).format(sentAt)
  }

  if (sentAt.getTime() <= now.getTime() && now.getTime() - sentAt.getTime() < 7 * dayMs) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      ...timeOptions,
    }).format(sentAt)
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(sentAt)
}

export function fullMessageSentAt(value: string) {
  const sentAt = new Date(value)
  if (Number.isNaN(sentAt.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(sentAt)
}

function isSameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}
