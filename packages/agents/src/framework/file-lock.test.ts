import { describe, expect, test } from 'bun:test'
import { acquireFileLock } from './file-lock'

describe('file-lock', () => {
  test('acquireFileLock returns a release function immediately when not locked', async () => {
    const release = await acquireFileLock()
    expect(typeof release).toBe('function')
    release()
  })

  test('second acquire waits until first is released', async () => {
    const order: string[] = []

    const release1 = await acquireFileLock()
    order.push('acquired-1')

    const promise2 = acquireFileLock().then((release2) => {
      order.push('acquired-2')
      release2()
    })

    // Second acquire should still be pending
    await Promise.resolve()
    expect(order).toEqual(['acquired-1'])

    release1()
    await promise2

    expect(order).toEqual(['acquired-1', 'acquired-2'])
  })

  test('multiple waiters are served in FIFO order', async () => {
    const order: number[] = []

    const release1 = await acquireFileLock()

    const p2 = acquireFileLock().then((release) => {
      order.push(2)
      release()
    })

    const p3 = acquireFileLock().then((release) => {
      order.push(3)
      release()
    })

    const p4 = acquireFileLock().then((release) => {
      order.push(4)
      release()
    })

    release1()
    await Promise.all([p2, p3, p4])

    expect(order).toEqual([2, 3, 4])
  })

  test('lock can be re-acquired after full release', async () => {
    const release1 = await acquireFileLock()
    release1()

    const release2 = await acquireFileLock()
    expect(typeof release2).toBe('function')
    release2()
  })

  test('concurrent operations are serialized', async () => {
    const results: number[] = []

    async function work(id: number, delay: number) {
      const release = await acquireFileLock()
      results.push(id)
      await new Promise((r) => setTimeout(r, delay))
      release()
    }

    await Promise.all([work(1, 10), work(2, 5), work(3, 1)])

    // All three should have run; first to acquire runs first
    expect(results).toHaveLength(3)
    expect(results[0]).toBe(1)
  })
})
