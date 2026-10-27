import { describe, expect, it } from 'vitest'
import { callbackError, callbackUrl, intendedPath, pathForSection, safeReturnPath, sectionFromPath } from './authRoutes'

describe('authenticated navigation', () => {
  it('maps every protected page to a direct URL', () => {
    expect(pathForSection('overview')).toBe('/')
    expect(pathForSection('problems')).toBe('/recommendations')
    expect(sectionFromPath('/roadmap')).toBe('roadmap')
    expect(sectionFromPath('/review')).toBe('review')
    expect(sectionFromPath('/recommendations')).toBe('problems')
  })

  it('returns to the intended page after an OAuth or email callback', () => {
    expect(callbackUrl('http://localhost:5173', '/roadmap'))
      .toBe('http://localhost:5173/auth/callback?next=%2Froadmap')
    expect(intendedPath('/auth/callback', '?next=%2Freview&code=temporary')).toBe('/review')
    expect(intendedPath('/recommendations', '')).toBe('/recommendations')
  })

  it('rejects external and unknown return paths', () => {
    expect(safeReturnPath('//attacker.example')).toBe('/')
    expect(safeReturnPath('https://attacker.example')).toBe('/')
    expect(safeReturnPath('/unknown')).toBe('/')
    expect(intendedPath('/auth/callback', '?next=https%3A%2F%2Fattacker.example')).toBe('/')
  })

  it('shows safe feedback for cancelled and disabled provider callbacks', () => {
    expect(callbackError('?error=access_denied', '')).toMatch(/cancelled/)
    expect(callbackError('', '#error=server_error&error_description=Provider+is+not+enabled'))
      .toMatch(/unavailable/)
    expect(callbackError('?code=temporary', '')).toBeNull()
  })
})
