import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatFechaSoloDia,
  formatTimestamptzDiaAR,
  formatTimestamptzFechaHoraAR,
  isPureCalendarDate,
} from './date'

test('2026-08-07T01:43:00.000Z → 06/08/2026 22:43 en Argentina', () => {
  const iso = '2026-08-07T01:43:00.000Z'
  assert.equal(formatTimestamptzFechaHoraAR(iso), '06/08/2026 22:43')
  assert.equal(formatTimestamptzDiaAR(iso), '06/08/2026')
  assert.equal(formatFechaSoloDia(iso), '06/08/2026')
})

test('date puro YYYY-MM-DD no se convierte por TZ', () => {
  assert.equal(isPureCalendarDate('2026-08-07'), true)
  assert.equal(formatFechaSoloDia('2026-08-07'), '07/08/2026')
  assert.equal(isPureCalendarDate('2026-08-07T01:43:00.000Z'), false)
})
