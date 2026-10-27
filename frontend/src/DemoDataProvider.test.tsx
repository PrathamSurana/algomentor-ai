import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoDataProvider, useDemoData } from './DemoDataProvider'

function Probe() {
  const demo = useDemoData()
  const sorting = demo.tree.nodes.find((node) => node.key === 'sorting')
  return <div>
    <span>Active: {String(demo.active)}</span>
    <span>Sorting: {sorting?.state}</span>
    <button onClick={demo.enter}>Enter</button>
    <button onClick={() => demo.simulate('arrays', 'advanced')}>Simulate</button>
    <button onClick={demo.reset}>Reset</button>
    <button onClick={demo.exit}>Exit</button>
  </div>
}

beforeEach(() => sessionStorage.clear())
afterEach(cleanup)

describe('demo session isolation', () => {
  it('keeps sample progress for this browser session, then clears it on reset and exit', () => {
    const view = render(<DemoDataProvider><Probe /></DemoDataProvider>)
    expect(screen.getByText('Active: false')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))
    expect(screen.getByText('Sorting: ready')).toBeTruthy()
    expect(sessionStorage.getItem('algomentor:demo-solves')).toContain('arrays:advanced')

    view.unmount()
    render(<DemoDataProvider><Probe /></DemoDataProvider>)
    expect(screen.getByText('Active: true')).toBeTruthy()
    expect(screen.getByText('Sorting: ready')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByText('Sorting: locked')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))
    expect(screen.getByText('Active: false')).toBeTruthy()
    expect(sessionStorage.getItem('algomentor:demo-active')).toBeNull()
    expect(sessionStorage.getItem('algomentor:demo-solves')).toBeNull()
  })
})
