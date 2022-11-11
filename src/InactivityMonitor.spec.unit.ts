import { InactivityMonitor } from './InactivityMonitor'
import { wait } from './testing/utils'

describe('InactivityMonitor', () => {
  it('calls the registered inactivity handler on timeout', async () => {
    const monitor = new InactivityMonitor(200)

    const handler = jest.fn()
    monitor.register('something', handler)

    await wait(200)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(monitor.numberActive()).toBe(0)
  })
  it('keeps a connection alive on refresh', async () => {
    const monitor = new InactivityMonitor(200)

    const handler = jest.fn()
    monitor.register('something', handler)

    await wait(100)
    monitor.refresh('something')
    await wait(150)

    expect(handler).not.toHaveBeenCalled()
    expect(monitor.numberActive()).toBe(1)

    await monitor.close()
  })
  it('closes all registers', async () => {
    const monitor = new InactivityMonitor(200)

    const handler = jest.fn()
    const handler2 = jest.fn()
    monitor.register('something', handler)
    monitor.register('here', handler2)

    await monitor.close()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)
    expect(monitor.numberActive()).toBe(0)
  })
  it('unregisters the handler', async () => {
    const monitor = new InactivityMonitor(200)

    const handler = jest.fn()
    const handler2 = jest.fn()
    monitor.register('something', handler)
    monitor.register('here', handler2)

    await monitor.unregister('here')
    expect(monitor.numberActive()).toBe(1)

    await monitor.close()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(0)
    expect(monitor.numberActive()).toBe(0)
  })
})
